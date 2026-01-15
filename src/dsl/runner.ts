/**
 * Vif Scene Runner
 *
 * Executes a parsed scene by:
 * - Using the recorder module directly for screen capture
 * - Sending commands to the vif server via WebSocket for overlays/cursor
 */

import WebSocket from 'ws';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import {
  ParsedScene,
  Action,
  SceneParser,
  View,
  LabelDef,
  EntryTiming,
  EasingType,
  ZoomAction,
  ZoomResetAction,
} from './parser.js';
import { resolveTarget, TargetRegistry, queryAppTargets } from './targets.js';
import { Recorder, RecordingRegion } from '../recorder/index.js';
import { getWindows, findWindow, launchApp } from '../index.js';

export interface RunnerOptions {
  port?: number;
  verbose?: boolean;
  dryRun?: boolean;
  validate?: boolean;  // Enable action validation via VifTargets
  debug?: boolean;     // Show debug HUD with coordinate info
}

// Target resolution mode
export type TargetMode = 'connected' | 'standalone';

// Preflight check result
export interface PreflightResult {
  passed: boolean;
  mode: TargetMode;
  checks: {
    appRunning: { passed: boolean; detail: string };
    windowVisible: { passed: boolean; detail: string };
    windowPosition: { passed: boolean; detail: string };
    vifTargets: { passed: boolean; detail: string; targetCount?: number };
  };
  appInfo?: {
    name: string;
    pid?: number;
    windowId?: number;
    bounds?: { x: number; y: number; width: number; height: number };
  };
}

// Action validation result
interface ActionResult {
  action: string;
  target: string;
  success: boolean;
  validated: boolean;
  error?: string;
}

// VifTargets event from SDK
interface VifEvent {
  id: string;
  timestamp: string;
  action: string;
  target: string;
  success: boolean;
  detail?: string;
  state?: Record<string, string>;
}

export class SceneRunner {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private scene: ParsedScene;
  private options: RunnerOptions;
  private appBounds: { x: number; y: number; width: number; height: number } | null = null;
  private appTargets: TargetRegistry = {};
  private vifTargetsPort = 7851;  // VifTargets SDK port
  private validationResults: ActionResult[] = [];
  private lastEventId: string | null = null;

  // Target resolution mode (connected = SDK, standalone = YAML)
  private targetMode: TargetMode = 'standalone';
  private preflightResult: PreflightResult | null = null;

  // Recorder instance - manages screen capture independently
  private recorder: Recorder;
  private viewportRegion: RecordingRegion | undefined;

  constructor(scene: ParsedScene, options: RunnerOptions = {}) {
    this.scene = scene;
    this.options = {
      port: 7850,
      verbose: false,
      dryRun: false,
      validate: true,  // Enable validation by default
      ...options,
    };
    this.recorder = new Recorder();

    // Set up recorder event handlers
    this.recorder.on('started', (info) => {
      this.log(`🎬 Recording started: ${info.output}`);
      if (info.region) {
        this.log(`🎬 Region: x=${info.region.x}, y=${info.region.y}, ${info.region.width}x${info.region.height}`);
      } else {
        this.log(`🎬 Region: full screen`);
      }
    });
    this.recorder.on('stopped', (info) => {
      this.log(`🎬 Recording stopped: ${info.output}`);
    });
    this.recorder.on('error', (err) => {
      this.log(`🎬 Recording error: ${err.message}`);
    });
  }

  // ─── Validation Methods ─────────────────────────────────────────────

  /**
   * Query VifTargets for recent events
   */
  private async queryVifEvents(): Promise<VifEvent[]> {
    try {
      const response = await fetch(`http://localhost:${this.vifTargetsPort}/vif/events`);
      const data = await response.json() as { events: VifEvent[] };
      return data.events || [];
    } catch {
      return [];
    }
  }

  /**
   * Query VifTargets for current app state
   */
  private async queryVifState(): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(`http://localhost:${this.vifTargetsPort}/vif/state`);
      const data = await response.json() as { state: Record<string, unknown> };
      return data.state || null;
    } catch {
      return null;
    }
  }

  /**
   * Clear VifTargets events (reset for new run)
   */
  private async clearVifEvents(): Promise<void> {
    try {
      await fetch(`http://localhost:${this.vifTargetsPort}/vif/events`, { method: 'DELETE' });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Validate an action by checking VifTargets events
   */
  private async validateAction(action: string, target: string): Promise<ActionResult> {
    if (!this.options.validate) {
      return { action, target, success: true, validated: false };
    }

    // Give the SDK time to emit the event
    await this.sleep(150);

    const events = await this.queryVifEvents();

    // Find the most recent event for this action/target
    const event = events.find(e =>
      e.action === action &&
      e.target.toLowerCase() === target.toLowerCase() &&
      e.id !== this.lastEventId
    );

    if (event) {
      this.lastEventId = event.id;
      const result: ActionResult = {
        action,
        target,
        success: event.success,
        validated: true,
        error: event.success ? undefined : event.detail
      };

      if (event.success) {
        this.log(`✓ Validated: ${action}:${target}`);
      } else {
        this.log(`✗ Failed: ${action}:${target} - ${event.detail || 'unknown error'}`);
      }

      this.validationResults.push(result);
      return result;
    }

    // No event found - can't validate
    this.log(`? Unverified: ${action}:${target} (no SDK event)`);
    return { action, target, success: true, validated: false };
  }

  /**
   * Print validation summary
   */
  private printValidationSummary(): void {
    if (this.validationResults.length === 0) return;

    const passed = this.validationResults.filter(r => r.success).length;
    const failed = this.validationResults.filter(r => !r.success).length;
    const unverified = this.validationResults.filter(r => !r.validated).length;

    console.log('\n── Validation Summary ──');
    console.log(`  ✓ Passed:     ${passed}`);
    if (failed > 0) {
      console.log(`  ✗ Failed:     ${failed}`);
      for (const r of this.validationResults.filter(r => !r.success)) {
        console.log(`    - ${r.action}:${r.target} ${r.error ? `(${r.error})` : ''}`);
      }
    }
    if (unverified > 0) {
      console.log(`  ? Unverified: ${unverified}`);
    }
    console.log('');
  }

  // ─── Preflight Check ──────────────────────────────────────────────────

  /**
   * Run preflight checks before scene execution
   * Always launches a fresh instance of the app to ensure known state
   */
  private async runPreflight(): Promise<PreflightResult> {
    const appName = this.scene.app?.name;
    const result: PreflightResult = {
      passed: true,
      mode: 'standalone',
      checks: {
        appRunning: { passed: false, detail: '' },
        windowVisible: { passed: false, detail: '' },
        windowPosition: { passed: false, detail: '' },
        vifTargets: { passed: false, detail: '' },
      },
    };

    // If no app specified, skip app-related checks
    if (!appName) {
      result.checks.appRunning = { passed: true, detail: 'No app specified (coordinate-only mode)' };
      result.checks.windowVisible = { passed: true, detail: 'N/A' };
      result.checks.windowPosition = { passed: true, detail: 'N/A' };
      result.checks.vifTargets = { passed: false, detail: 'No app specified' };
      return result;
    }

    // Launch fresh instance - kills existing and opens new
    const appPath = this.scene.app?.path;
    this.log(`🚀 Launching fresh instance of ${appName}${appPath ? ` from ${appPath}` : ''}...`);
    const window = launchApp(appName, { path: appPath });

    if (!window) {
      result.checks.appRunning = { passed: false, detail: `Failed to launch ${appName}` };
      result.passed = false;
      return result;
    }

    result.appInfo = {
      name: appName,
      windowId: window.id,
      bounds: window.bounds,
    };
    result.checks.appRunning = {
      passed: true,
      detail: `${appName} (window ${window.id})`
    };

    // Check 2: Window visible (has reasonable bounds)
    const bounds = window.bounds;
    if (bounds.width > 0 && bounds.height > 0) {
      result.checks.windowVisible = {
        passed: true,
        detail: `${bounds.width}×${bounds.height} at (${bounds.x}, ${bounds.y})`
      };
    } else {
      result.checks.windowVisible = {
        passed: false,
        detail: 'Window has zero size or is hidden'
      };
      result.passed = false;
    }

    // Check 3: Window position - we'll resize it ourselves, so just note what we'll do
    const expectedWidth = this.scene.app?.window?.width;
    const expectedHeight = this.scene.app?.window?.height;
    if (expectedWidth && expectedHeight) {
      result.checks.windowPosition = {
        passed: true,
        detail: `Will resize to ${expectedWidth}×${expectedHeight}`
      };
    } else {
      result.checks.windowPosition = { passed: true, detail: 'Using current size' };
    }

    // Check 4: VifTargets SDK connection
    try {
      const targets = await queryAppTargets(appName);
      const targetCount = Object.keys(targets).length;
      if (targetCount > 0) {
        result.checks.vifTargets = {
          passed: true,
          detail: `Connected (${targetCount} targets)`,
          targetCount
        };
        result.mode = 'connected';
        this.appTargets = targets;
      } else {
        result.checks.vifTargets = {
          passed: false,
          detail: 'No targets exposed'
        };
      }
    } catch {
      result.checks.vifTargets = {
        passed: false,
        detail: 'SDK not available (using YAML coordinates)'
      };
    }

    return result;
  }

  /**
   * Print preflight check results
   */
  private printPreflightResults(result: PreflightResult): void {
    console.log('  Preflight Check');
    console.log('  ───────────────');

    const { checks } = result;

    // App running
    const appIcon = checks.appRunning.passed ? '✓' : '✗';
    console.log(`  ${appIcon} App running:     ${checks.appRunning.detail}`);

    // Window visible
    if (checks.windowVisible.detail !== 'N/A') {
      const winIcon = checks.windowVisible.passed ? '✓' : '✗';
      console.log(`  ${winIcon} Window visible:  ${checks.windowVisible.detail}`);
    }

    // VifTargets
    const sdkIcon = checks.vifTargets.passed ? '✓' : '○';
    console.log(`  ${sdkIcon} VifTargets:     ${checks.vifTargets.detail}`);

    // Mode summary
    console.log('');
    if (result.mode === 'connected') {
      console.log(`  📡 Mode: Connected`);
    } else {
      console.log(`  📍 Mode: Standalone`);
    }
    console.log('');
  }

  /**
   * Connect to the vif server
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${this.options.port}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.log('Connected to vif server');
        resolve();
      });

      this.ws.on('error', (err) => {
        reject(new Error(`Failed to connect to vif server: ${err.message}`));
      });
    });
  }

  /**
   * Send a command and wait for response
   */
  private send(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        return reject(new Error('Not connected'));
      }

      const id = ++this.msgId;
      const msg = { id, action, ...params };

      this.log(`→ ${action}`, params);

      if (this.options.dryRun) {
        resolve({ ok: true });
        return;
      }

      const handler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            this.ws?.off('message', handler);
            if (response.ok) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Command failed'));
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.on('message', handler);
      this.ws.send(JSON.stringify(msg));

      // Timeout after 30 seconds
      setTimeout(() => {
        this.ws?.off('message', handler);
        reject(new Error(`Timeout waiting for response to ${action}`));
      }, 30000);
    });
  }

  /**
   * Sleep for given milliseconds
   */
  private sleep(ms: number): Promise<void> {
    this.log(`⏱ wait ${ms}ms`);
    if (this.options.dryRun) {
      return Promise.resolve();
    }
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Retry an async operation with exponential backoff
   */
  private async retry<T>(
    operation: () => Promise<T>,
    options: {
      name: string;
      maxAttempts?: number;
      initialDelayMs?: number;
      maxDelayMs?: number;
    }
  ): Promise<T> {
    const { name, maxAttempts = 3, initialDelayMs = 200, maxDelayMs = 2000 } = options;
    let lastError: Error | null = null;
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          this.log(`⚠️ ${name} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(delay * 2, maxDelayMs);
        }
      }
    }

    throw lastError || new Error(`${name} failed after ${maxAttempts} attempts`);
  }

  /**
   * Verify window position matches expected bounds (with tolerance)
   */
  private async verifyWindowPosition(
    appName: string,
    expected: { x: number; y: number; width: number; height: number },
    tolerance: number = 10
  ): Promise<boolean> {
    const windows = await getWindows(appName);
    if (windows.length === 0) return false;

    const win = windows[0].bounds;
    const matches = (
      Math.abs(win.x - expected.x) <= tolerance &&
      Math.abs(win.y - expected.y) <= tolerance &&
      Math.abs(win.width - expected.width) <= tolerance &&
      Math.abs(win.height - expected.height) <= tolerance
    );

    if (!matches) {
      this.log(`⚠️ Window position mismatch: expected (${expected.x}, ${expected.y}) ${expected.width}x${expected.height}, got (${win.x}, ${win.y}) ${win.width}x${win.height}`);
    }

    return matches;
  }

  /**
   * Get actual screen dimensions
   */
  private async getScreenBounds(): Promise<{ width: number; height: number }> {
    // Query agent for screen info, or fall back to reasonable defaults
    try {
      const result = await this.send('stage.screenInfo', {}) as { width?: number; height?: number };
      if (result.width && result.height) {
        return { width: result.width, height: result.height };
      }
    } catch {
      // Agent doesn't support screenInfo - use common defaults
    }
    // Fallback to common MacBook Pro resolution
    return { width: 1710, height: 1112 };
  }

  /**
   * Log message if verbose
   */
  private log(msg: string, data?: unknown): void {
    if (this.options.verbose) {
      if (data && Object.keys(data).length > 0) {
        console.log(`[scene] ${msg}`, data);
      } else {
        console.log(`[scene] ${msg}`);
      }
    }
  }

  /**
   * Humanize a target name for readable display
   * e.g., "sidebar.drafts" → "Drafts", "drafts.voice-btn" → "Voice Button"
   */
  private humanizeTarget(target: string): string {
    // Extract the last part after the dot
    const parts = target.split('.');
    const name = parts[parts.length - 1];

    // Convert kebab-case and camelCase to Title Case with spaces
    return name
      .replace(/-/g, ' ')  // kebab-case to spaces
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase to spaces
      .replace(/\b(btn|nav)\b/gi, '')  // Remove common suffixes
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Create human-readable action description (past tense for log)
   */
  private humanizeAction(action: string, target: string): string {
    const humanTarget = this.humanizeTarget(target);

    if (action === 'click') {
      return `Clicked ${humanTarget}`;
    } else if (action === 'navigate') {
      return `Navigated to ${humanTarget}`;
    } else if (action === 'type') {
      return `Typed text`;
    } else if (action === 'voice') {
      return `Played voice command`;
    }
    return `${action} ${humanTarget}`;
  }

  /**
   * Get a brief description of an action for panel display
   */
  private getActionDescription(action: Action): string {
    // Check action type and return appropriate description
    if ('click' in action) {
      const target = action.click;
      if (typeof target === 'string') {
        return `Click ${this.humanizeTarget(target)}`;
      }
      return 'Click';
    }
    if ('type' in action) {
      const text = (action as { type: string }).type;
      const preview = text.length > 20 ? text.slice(0, 17) + '...' : text;
      return `Type "${preview}"`;
    }
    if ('voice' in action) {
      return 'Voice command';
    }
    if ('label.show' in action) {
      return 'Show label';
    }
    if ('label.update' in action) {
      const text = (action as { 'label.update': string })['label.update'];
      return `Label: ${text.slice(0, 20)}${text.length > 20 ? '...' : ''}`;
    }
    if ('record.start' in action) {
      return 'Start recording';
    }
    if ('record.stop' in action) {
      return 'Stop recording';
    }
    if ('cursor.show' in action) {
      return 'Show cursor';
    }
    if ('cursor.hide' in action) {
      return 'Hide cursor';
    }
    if ('wait' in action) {
      return `Wait ${(action as { wait: number }).wait}ms`;
    }
    if ('sleep' in action) {
      return `Sleep ${(action as { sleep: number }).sleep}ms`;
    }
    // Default: use first key name
    const keys = Object.keys(action);
    return keys.length > 0 ? keys[0] : 'Action';
  }

  /**
   * Update debug HUD with action info
   */
  private async updateDebugHUD(data: {
    actionText?: string;
    source?: string;
    target?: string;
    screen?: string;
    app?: string;
    offset?: string;
    sdk?: string;
  }): Promise<void> {
    if (!this.options.debug) return;

    try {
      await this.send('debug.update', data);
    } catch {
      // Ignore errors - debug HUD is optional
    }
  }

  /**
   * Get output file path for recording
   */
  private getOutputPath(mode: 'draft' | 'final', name?: string): string {
    const vifDir = join(homedir(), '.vif');

    if (mode === 'draft') {
      // Draft mode: overwrite ~/.vif/draft.mp4
      return join(vifDir, 'draft.mp4');
    } else {
      // Final mode: timestamped file or named file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = name ? `${name}.mp4` : `recording-${timestamp}.mp4`;
      return join(vifDir, 'recordings', filename);
    }
  }

  /**
   * Run the scene
   */
  async run(): Promise<void> {
    console.log(`\n▶ Running scene: ${this.scene.scene.name}\n`);

    // Run preflight checks
    this.preflightResult = await this.runPreflight();
    this.targetMode = this.preflightResult.mode;
    this.printPreflightResults(this.preflightResult);

    // Abort if critical preflight checks failed
    if (!this.preflightResult.passed) {
      const failedCheck = Object.entries(this.preflightResult.checks)
        .find(([_, check]) => !check.passed);
      const reason = failedCheck ? failedCheck[1].detail : 'Unknown error';
      throw new Error(`Preflight failed: ${reason}`);
    }

    // Check if scene requires a specific target mode
    const requiredMode = this.scene.scene.targets;
    if (requiredMode && requiredMode !== 'auto') {
      if (requiredMode === 'connected' && this.targetMode === 'standalone') {
        throw new Error(`Scene requires 'connected' mode but VifTargets SDK is not available. Either start the app with VifTargets integrated, or change 'targets: connected' to 'targets: auto' in the scene.`);
      }
      if (requiredMode === 'standalone' && this.targetMode === 'connected') {
        // Force standalone mode even if SDK is available
        this.targetMode = 'standalone';
        this.appTargets = {};  // Clear SDK targets
        console.log('  ⚠ Forcing standalone mode (scene setting)\n');
      }
    }

    // Clear previous events for clean validation
    if (this.options.validate) {
      await this.clearVifEvents();
    }

    await this.connect();

    // Send scene info to control panel
    await this.send('panel.scene', { name: this.scene.scene.name });
    await this.send('panel.targetMode', { mode: this.targetMode });
    await this.send('panel.progress', { current: 0, total: this.scene.sequence.length });

    // Handle Ctrl+C gracefully - cleanup before exit
    const handleInterrupt = async () => {
      console.log('\n\n⚠ Interrupted - cleaning up...');
      try {
        // Stop recorder first
        if (this.recorder.isRecording()) {
          this.recorder.forceStop();
        }
        await this.cleanup();
      } catch {
        // Ignore cleanup errors on interrupt
      }
      this.ws?.close();
      process.exit(130);  // Standard exit code for SIGINT
    };
    process.on('SIGINT', handleInterrupt);
    process.on('SIGTERM', handleInterrupt);

    try {
      // Setup stage
      await this.setupStage();

      // Execute sequence with progress tracking
      const totalSteps = this.scene.sequence.length;
      for (let i = 0; i < totalSteps; i++) {
        const action = this.scene.sequence[i];
        // Update progress
        await this.send('panel.progress', { current: i + 1, total: totalSteps });
        // Update current action display
        const actionName = this.getActionDescription(action);
        await this.send('panel.action', { text: actionName });

        await this.executeAction(action);
      }

      // Clear action when done
      await this.send('panel.action', { text: '' });

      // Play end cue sound if configured
      const endCue = this.scene.scene.cues?.end;
      if (endCue && !this.options.dryRun) {
        await this.send('cue.play', { sound: endCue, wait: false });
      }

      console.log('\n✓ Scene complete');

      // Print validation summary
      this.printValidationSummary();
    } catch (err) {
      // Force stop recorder if still running
      if (this.recorder.isRecording()) {
        this.log('⚠ Force stopping recorder due to error');
        this.recorder.forceStop();
      }
      throw err;
    } finally {
      // Remove signal handlers to prevent memory leaks
      process.off('SIGINT', handleInterrupt);
      process.off('SIGTERM', handleInterrupt);

      // Always cleanup - hide all overlays even on error
      try {
        await this.cleanup();
      } catch {
        // Ignore cleanup errors
      }

      this.ws?.close();

      // Ensure recorder is stopped
      if (this.recorder.isRecording()) {
        this.recorder.forceStop();
      }
    }
  }

  /**
   * Get entry timing from scene config
   */
  private getEntryTiming(): number {
    const { stage } = this.scene;
    const DEFAULT_TIMING = 150;  // 150ms per layer

    if (!stage.entry) return DEFAULT_TIMING;
    if (typeof stage.entry === 'number') return stage.entry;
    return stage.entry.timing ?? DEFAULT_TIMING;
  }

  /**
   * Setup stage - delegates choreography to agent
   * Agent handles: Z1 Backdrop → Z2 App → Z4 Viewport → Z5 Ready → Countdown
   */
  private async setupStage(): Promise<void> {
    const { stage, app, scene } = this.scene;
    const timing = this.getEntryTiming();

    this.log(`🎬 Setting up stage (${timing}ms per layer)`);

    // Build stage config for agent
    const stageConfig: Record<string, unknown> = {
      backdrop: stage.backdrop === true ? 'black' : (stage.backdrop || 'black'),
      entry: { timing },
    };

    if (app) {
      stageConfig.app = {
        name: app.name,
        width: app.window?.width || 1200,
        height: app.window?.height || 800,
      };
    }

    if (stage.viewport) {
      stageConfig.viewport = {
        padding: stage.viewport.padding || 10,
      };
    }

    // Countdown config: default enabled (3), can be disabled or customized
    // scene.countdown: true | false | number | { count, tick }
    if (scene.countdown === false) {
      stageConfig.countdown = false;
    } else if (typeof scene.countdown === 'number') {
      stageConfig.countdown = scene.countdown;
    } else if (scene.countdown === true) {
      stageConfig.countdown = 3;  // Default
    } else {
      stageConfig.countdown = 3;  // Default enabled
    }

    // Send to agent - it handles the choreographed entry sequence
    const result = await this.retry(
      () => this.send('stage.setup', stageConfig),
      { name: 'stage.setup', maxAttempts: 2 }
    ) as { ok: boolean; ready?: boolean; bounds?: { x: number; y: number; width: number; height: number } };

    // Store app bounds from agent response
    if (result.bounds) {
      this.appBounds = result.bounds;
      this.log(`📐 App bounds: (${this.appBounds.x}, ${this.appBounds.y}) ${this.appBounds.width}×${this.appBounds.height}`);

      // Store viewport region for recorder
      if (stage.viewport) {
        const padding = stage.viewport.padding || 10;
        this.viewportRegion = {
          x: this.appBounds.x - padding,
          y: this.appBounds.y - padding,
          width: this.appBounds.width + padding * 2,
          height: this.appBounds.height + padding * 2,
        };
      }
    } else if (this.preflightResult?.appInfo?.bounds) {
      this.appBounds = this.preflightResult.appInfo.bounds;
    }

    // Query app for registered targets
    if (app) {
      try {
        this.appTargets = await queryAppTargets(app.name);
        const targetCount = Object.keys(this.appTargets).length;
        if (targetCount > 0) {
          this.log(`📍 Loaded ${targetCount} targets from ${app.name}`);
        }
      } catch {
        // App doesn't expose targets - that's ok
      }
    }

    // Show debug HUD if enabled (runner-specific, not part of agent choreography)
    if (this.options.debug && this.appBounds && stage.viewport) {
      const padding = stage.viewport.padding || 10;
      const hudY = this.appBounds.y + this.appBounds.height + padding;
      await this.send('debug.show', {
        x: this.appBounds.x - padding,
        y: hudY,
        width: this.appBounds.width + padding * 2,
      });
      await this.updateDebugHUD({
        actionText: 'Starting scene...',
        source: this.targetMode === 'connected' ? 'connected (SDK)' : 'standalone (YAML)',
        offset: `App at (${this.appBounds.x}, ${this.appBounds.y})`,
      });
    }

    this.log(`✓ Stage ready`);
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: Action): Promise<void> {
    // cursor.show
    if ('cursor.show' in action) {
      await this.send('cursor.show');
      return;
    }

    // cursor.hide
    if ('cursor.hide' in action) {
      await this.send('cursor.hide');
      return;
    }

    // cursor.moveTo
    if ('cursor.moveTo' in action) {
      const move = action['cursor.moveTo'];
      const coords = this.resolveCoordinates(move.x, move.y);
      const duration = move.duration || 0.3;
      await this.send('cursor.moveTo', {
        x: coords.x,
        y: coords.y,
        duration,
      });
      // Wait for animation to complete (agent responds before animation finishes)
      await this.sleep(duration * 1000 + 50);
      return;
    }

    // cursor.click
    if ('cursor.click' in action) {
      await this.send('cursor.click');
      return;
    }

    // click (supports coordinates, app targets, and view references)
    if ('click' in action) {
      const target = action.click;
      const moveDuration = 0.3;

      if (typeof target === 'object' && 'x' in target) {
        // Explicit coordinates
        const coords = this.resolveCoordinates(target.x, target.y);
        await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: moveDuration });
        await this.sleep(moveDuration * 1000 + 50);
        await this.send('cursor.click');
      } else if (typeof target === 'string') {
        // First check if target exists directly in appTargets (DemoKit anchors, SDK targets)
        const directTarget = this.appTargets[target];
        if (directTarget && typeof (directTarget as any).x === 'number') {
          // Click target with coordinates from app (Connected mode)
          const screenX = (directTarget as any).x;
          const screenY = (directTarget as any).y;
          this.log(`📡 [connected] ${target} → (${screenX}, ${screenY})`);
          await this.updateDebugHUD({
            actionText: this.humanizeAction('click', target),
            source: 'connected (SDK)',
            target: `SDK: (${screenX}, ${screenY})`,
            screen: `(${screenX}, ${screenY})`,
            app: this.appBounds ? `(${this.appBounds.x}, ${this.appBounds.y}) ${this.appBounds.width}×${this.appBounds.height}` : '—',
            offset: 'N/A (absolute from SDK)',
          });
          await this.send('cursor.moveTo', { x: screenX, y: screenY, duration: 0.3 });
          await this.sleep(350);
          await this.send('cursor.click');
          await this.validateAction('click', target);
          return;
        }

        // Check if it's a navigation target (nav.xxx)
        const navTarget = this.appTargets[`nav.${target}`] || this.appTargets[target];
        if (navTarget && (navTarget as any).type === 'navigate') {
          // Use navigation API (Connected mode)
          this.log(`📡 [connected] navigate → ${target}`);
          await this.updateDebugHUD({
            actionText: this.humanizeAction('navigate', target),
            source: 'connected (SDK)',
            target: `nav.${target}`,
            screen: 'HTTP API',
          });
          await this.navigateToSection((navTarget as any).section || target);
        } else if (this.appTargets[target] && typeof (this.appTargets[target] as any).x === 'number') {
          // Click target with coordinates from SDK (Connected mode)
          const appTarget = this.appTargets[target] as { x: number; y: number };
          this.log(`📡 [connected] ${target} → (${appTarget.x}, ${appTarget.y})`);
          await this.send('cursor.moveTo', { x: appTarget.x, y: appTarget.y, duration: moveDuration });
          await this.sleep(moveDuration * 1000 + 50);
          await this.send('cursor.click');
          // Validate click on known targets
          await this.validateAction('click', target);
        } else {
          // Check if this is a sidebar navigation that we can handle via API
          if (target.startsWith('sidebar.')) {
            const section = target.replace('sidebar.', '');
            const navTarget = this.appTargets[`nav.${section}`];
            if (navTarget && (navTarget as any).type === 'navigate') {
              // Animate cursor to sidebar position for visual effect (from YAML)
              try {
                const debugInfo = this.resolveViewTargetWithDebug(target);
                const coords = debugInfo.screen;
                this.log(`📡 [connected] ${target} → (${coords.x}, ${coords.y}) then navigate`);
                await this.updateDebugHUD({
                  actionText: this.humanizeAction('click', target),
                  source: 'connected (SDK + cursor)',
                  target: `nav.${section}`,
                  screen: `(${coords.x}, ${coords.y})`,
                });
                await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: moveDuration });
                await this.sleep(moveDuration * 1000 + 50);
                await this.send('cursor.click');
              } catch {
                // If YAML coords not available, just navigate without cursor
                this.log(`📡 [connected] navigate → ${section}`);
                await this.updateDebugHUD({
                  actionText: this.humanizeAction('navigate', section),
                  source: 'connected (SDK)',
                  target: `nav.${section}`,
                  screen: 'HTTP API',
                });
              }
              // Use SDK navigation for reliable state change
              await this.navigateToSection(section);
              return;
            }
          }

          // Fall back to view references defined in scene (using YAML coordinates)
          const debugInfo = this.resolveViewTargetWithDebug(target);
          const coords = debugInfo.screen;
          this.log(`📍 [YAML] ${target} → (${coords.x}, ${coords.y})`);
          await this.updateDebugHUD({
            actionText: this.humanizeAction('click', target),
            // Keep mode badge as-is (connected/standalone), just note coords source
            source: this.targetMode === 'connected' ? 'connected (YAML coords)' : 'standalone (YAML)',
            target: `YAML: (${debugInfo.raw.x}, ${debugInfo.raw.y})`,
            screen: `(${coords.x}, ${coords.y})`,
            app: this.appBounds ? `(${this.appBounds.x}, ${this.appBounds.y}) ${this.appBounds.width}×${this.appBounds.height}` : '—',
            offset: this.appBounds ? `+${this.appBounds.x}x +${this.appBounds.y}y` : 'none',
          });
          await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: moveDuration });
          await this.sleep(moveDuration * 1000 + 50);
          await this.send('cursor.click');

          // If clicking a sidebar item, try to validate navigation
          if (target.startsWith('sidebar.')) {
            const section = target.replace('sidebar.', '');
            await this.validateAction('navigate', section);
          }
        }
      }
      return;
    }

    // wait
    if ('wait' in action) {
      const ms = SceneParser.parseDuration(action.wait);
      await this.sleep(ms);
      return;
    }

    // record - use recorder module directly
    if ('record' in action) {
      if (action.record === 'start') {
        const mode = this.scene.scene.mode || 'draft';
        const output = this.getOutputPath(mode, this.scene.scene.output);

        if (this.options.dryRun) {
          this.log(`🎬 [dry-run] Would start recording to ${output}`);
        } else {
          // Ensure app is in front before recording
          if (this.scene.app?.name) {
            await this.send('stage.activate', { app: this.scene.app.name });
            await this.sleep(200);  // Wait for activation to complete
          }

          // Play start cue sound if configured
          const startCue = this.scene.scene.cues?.start;
          if (startCue) {
            await this.send('cue.play', { sound: startCue, wait: true });
          }

          // Run countdown if enabled
          const countdown = this.scene.scene.countdown;
          if (countdown) {
            const count = typeof countdown === 'number' ? countdown : 3;
            const tick = this.scene.scene.cues?.tick ?? 'tick.mp3';  // Default to tick.mp3
            this.log(`⏱ Countdown: ${count}...`);
            await this.send('countdown.start', { count, tick });
          }

          // Show recording indicator in agent UI
          await this.send('record.indicator', { show: true });
          await this.send('panel.recordingPath', { path: output });
          // Log viewport region for debugging
          if (this.viewportRegion) {
            this.log(`📐 Recording region: (${this.viewportRegion.x}, ${this.viewportRegion.y}) ${this.viewportRegion.width}×${this.viewportRegion.height}`);
          }
          await this.recorder.start({
            output,
            region: this.viewportRegion,
            audio: false,
          });
        }
      } else {
        if (this.options.dryRun) {
          this.log(`🎬 [dry-run] Would stop recording`);
        } else {
          const outputPath = await this.recorder.stop();
          // Hide recording indicator and clear path in agent UI
          await this.send('record.indicator', { show: false });
          await this.send('panel.recordingPath', { path: '' });
          console.log(`📼 Recording saved: ${outputPath}`);
        }
      }
      return;
    }

    // navigate
    if ('navigate' in action) {
      const { through, items, wait } = action.navigate;
      const waitMs = wait ? SceneParser.parseDuration(wait) : 400;
      const moveDuration = 0.4;

      for (const item of items) {
        const target = `${through}.${item}`;

        // Check if we can use SDK navigation for this item
        const navTarget = this.appTargets[`nav.${item}`];
        if (navTarget && (navTarget as any).type === 'navigate') {
          // Use SDK navigation API
          await this.updateDebugHUD({
            actionText: this.humanizeAction('navigate', item),
            source: 'connected (SDK)',
            target: `nav.${item}`,
            screen: 'HTTP API',
          });
          await this.navigateToSection(item);
        } else {
          // Fall back to YAML coordinates
          const debugInfo = this.resolveViewTargetWithDebug(target);
          const coords = debugInfo.screen;
          await this.updateDebugHUD({
            actionText: this.humanizeAction('click', target),
            source: this.targetMode === 'connected' ? 'connected (YAML coords)' : 'standalone (YAML)',
            target: `(${debugInfo.raw.x}, ${debugInfo.raw.y})`,
            screen: `(${coords.x}, ${coords.y})`,
          });
          await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: moveDuration });
          await this.sleep(moveDuration * 1000 + 50);
          await this.send('cursor.click');
        }
        await this.sleep(waitMs);
      }
      return;
    }

    // label
    if ('label' in action && typeof action.label === 'string') {
      const labelDef = this.scene.labels.get(action.label);
      const text = (action as any).text || labelDef?.text || action.label;
      const position = this.resolveLabelPosition(labelDef?.position);
      await this.send('label.show', { text, ...position });
      return;
    }

    // label.update
    if ('label.update' in action) {
      await this.send('label.update', { text: action['label.update'] });
      return;
    }

    // label.hide
    if ('label.hide' in action) {
      await this.send('label.hide');
      return;
    }

    // use (component import - for future implementation)
    if ('use' in action) {
      this.log(`⚠ Component import not yet implemented: ${action.use}`);
      return;
    }

    // typer.type (visual typing overlay)
    if ('typer.type' in action) {
      const { text, style = 'default', delay = 0.05 } = action['typer.type'];
      await this.send('typer.type', { text, style, delay });
      // Wait for typing animation to complete
      const typingDuration = text.length * delay * 1000 + 200;
      await this.sleep(typingDuration);
      return;
    }

    // typer.hide
    if ('typer.hide' in action) {
      await this.send('typer.hide');
      return;
    }

    // typer.clear
    if ('typer.clear' in action) {
      await this.send('typer.clear');
      return;
    }

    // input.type (actual keyboard input)
    if ('input.type' in action) {
      const { text, delay = 0.03 } = action['input.type'];
      // Ensure target app has focus before typing
      if (this.scene.app?.name) {
        await this.send('stage.activate', { app: this.scene.app.name });
        await this.sleep(100); // Small delay for activation
      }
      // Send entire text to agent for typing
      await this.send('input.type', { text, delay });
      // Wait for typing to complete (approximate time)
      const typingDuration = text.length * delay * 1000 + 100;
      await this.sleep(typingDuration);
      return;
    }

    // input.keys (keyboard shortcut)
    if ('input.keys' in action) {
      const keys = action['input.keys'];
      await this.send('keys.press', { keys });
      await this.sleep(100);
      return;
    }

    // voice.play (audio playback through virtual mic)
    if ('voice.play' in action) {
      const playAction = action['voice.play'];
      const file = typeof playAction === 'string' ? playAction : playAction.file;
      const shouldWait = typeof playAction === 'object' ? playAction.wait !== false : true;

      // Resolve relative paths from scene basePath
      const resolvedFile = file.startsWith('/') || file.startsWith('~')
        ? file
        : `${this.scene.basePath}/${file}`;

      this.log(`🎤 Playing voice: ${file}`);

      // If VifTargets SDK is available, set audio input override to BlackHole
      let sdkOverrideSet = false;
      if (this.vifTargetsPort) {
        try {
          const response = await fetch(`http://localhost:${this.vifTargetsPort}/vif/audio/input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: 'BlackHole 2ch' }),
          });
          if (response.ok) {
            sdkOverrideSet = true;
            this.log(`🎤 SDK audio input override set to BlackHole 2ch`);
            // Small delay for the app to apply the override
            await this.sleep(100);
          }
        } catch {
          // SDK not available, will fall back to system-level switching
        }
      }

      // Play audio through BlackHole
      const result = await this.send('voice.play', { file: resolvedFile }) as { duration?: number };

      // Wait for playback to complete if requested
      if (shouldWait && result.duration) {
        const waitMs = (result.duration as number) * 1000 + 200;
        await this.sleep(waitMs);
      }

      // Clear SDK audio override if we set it
      if (sdkOverrideSet && this.vifTargetsPort) {
        try {
          await fetch(`http://localhost:${this.vifTargetsPort}/vif/audio/input`, {
            method: 'DELETE',
          });
          this.log(`🎤 SDK audio input override cleared`);
        } catch {
          // Ignore errors
        }
      }

      return;
    }

    // voice.stop
    if ('voice.stop' in action) {
      await this.send('voice.stop');
      return;
    }

    // zoom - apply zoom effect with timing
    if ('zoom' in action) {
      const zoom = action.zoom as {
        type?: 'crop' | 'lens';
        level: number;
        target?: 'cursor' | { x: number; y: number };
        in?: { duration?: number | string; easing?: string };
        out?: { duration?: number | string; easing?: string };
        hold?: number | string | 'auto';
        size?: number;
        border?: boolean;
        shadow?: boolean;
      };

      // Parse durations
      const inDuration = zoom.in?.duration
        ? SceneParser.parseDuration(zoom.in.duration)
        : 300;
      const outDuration = zoom.out?.duration
        ? SceneParser.parseDuration(zoom.out.duration)
        : 400;
      const holdDuration = zoom.hold === 'auto' || zoom.hold === undefined
        ? 'auto'
        : SceneParser.parseDuration(zoom.hold as string | number);

      // Resolve target coordinates
      let targetX: number | undefined;
      let targetY: number | undefined;
      if (zoom.target && typeof zoom.target === 'object' && 'x' in zoom.target) {
        const coords = this.resolveCoordinates(zoom.target.x, zoom.target.y);
        targetX = coords.x;
        targetY = coords.y;
      }

      this.log(`🔍 Zoom ${zoom.level}x (${zoom.type || 'crop'})`);

      await this.send('zoom.start', {
        type: zoom.type || 'crop',
        level: zoom.level,
        target: zoom.target === 'cursor' ? 'cursor' : (targetX !== undefined ? { x: targetX, y: targetY } : 'cursor'),
        in: {
          duration: inDuration,
          easing: zoom.in?.easing || 'ease-out',
        },
        out: {
          duration: outDuration,
          easing: zoom.out?.easing || 'ease-in-out',
        },
        hold: holdDuration,
        // Lens-specific options
        size: zoom.size,
        border: zoom.border,
        shadow: zoom.shadow,
      });

      // Wait for zoom-in animation to complete
      await this.sleep(inDuration + 50);

      // If hold is a specific duration (not auto), wait and then zoom out
      if (holdDuration !== 'auto') {
        await this.sleep(holdDuration as number);
        await this.send('zoom.end', {
          duration: outDuration,
          easing: zoom.out?.easing || 'ease-in-out',
        });
        await this.sleep(outDuration + 50);
      }

      return;
    }

    // zoom.reset - reset zoom to normal
    if ('zoom.reset' in action) {
      const reset = action['zoom.reset'];
      const duration = typeof reset === 'object' && reset.duration
        ? SceneParser.parseDuration(reset.duration)
        : 400;
      const easing = typeof reset === 'object' && reset.easing
        ? reset.easing
        : 'ease-in-out';

      this.log(`🔍 Zoom reset`);
      await this.send('zoom.end', { duration, easing });
      await this.sleep(duration + 50);
      return;
    }

    this.log('⚠ Unknown action:', action);
  }

  /**
   * Resolve coordinates relative to app bounds
   */
  private resolveCoordinates(x: number, y: number): { x: number; y: number } {
    if (!this.appBounds) {
      return { x, y };
    }

    // If coordinates are within app window size, treat as relative
    if (x < this.appBounds.width && y < this.appBounds.height) {
      return {
        x: this.appBounds.x + x,
        y: this.appBounds.y + y,
      };
    }

    // Otherwise treat as absolute
    return { x, y };
  }

  /**
   * Resolve a view target (e.g., "sidebar.home") to coordinates
   */
  private resolveViewTarget(target: string): { x: number; y: number } {
    return this.resolveViewTargetWithDebug(target).screen;
  }

  /**
   * Resolve a view target with debug info (raw and screen coordinates)
   */
  private resolveViewTargetWithDebug(target: string): {
    raw: { x: number; y: number };
    screen: { x: number; y: number };
  } {
    const parts = target.split('.');
    const viewName = parts[0];
    const itemName = parts[1];

    const view = this.scene.views.get(viewName);
    if (!view) {
      throw new Error(`View not found: ${viewName}`);
    }

    // Try to find the item in view.items
    if (view.items && itemName) {
      for (const item of view.items) {
        if (itemName in item) {
          const pos = item[itemName];
          const baseX = this.getViewBaseX(view);
          const rawX = baseX + (pos.x || 0);
          const rawY = pos.y || 0;
          const screen = this.resolveCoordinates(rawX, rawY);
          return { raw: { x: rawX, y: rawY }, screen };
        }
      }
    }

    // Try view.positions
    if (view.positions && itemName && itemName in view.positions) {
      const pos = view.positions[itemName];
      const baseX = this.getViewBaseX(view);
      const rawX = baseX + this.resolvePositionValue(pos.x, this.appBounds?.width || 0);
      const rawY = this.resolvePositionValue(pos.y, this.appBounds?.height || 0);
      const screen = this.resolveCoordinates(rawX, rawY);
      return { raw: { x: rawX, y: rawY }, screen };
    }

    throw new Error(`Target not found: ${target}`);
  }

  /**
   * Get base X coordinate for a view
   */
  private getViewBaseX(view: View): number {
    if (!view.region) return 0;

    if (typeof view.region === 'object' && 'x' in view.region) {
      return view.region.x || 0;
    }

    return 0;
  }

  /**
   * Resolve percentage or numeric position value
   */
  private resolvePositionValue(value: number | string, dimension: number): number {
    if (typeof value === 'number') return value;

    if (typeof value === 'string' && value.endsWith('%')) {
      const pct = parseFloat(value.slice(0, -1));
      return Math.floor((pct / 100) * dimension);
    }

    return parseFloat(value);
  }

  /**
   * Resolve label position
   */
  private resolveLabelPosition(position?: LabelDef['position']): Record<string, unknown> {
    if (!position) {
      return { position: 'top' };
    }

    if (typeof position === 'string') {
      return { position };
    }

    return { x: position.x, y: position.y };
  }

  /**
   * Navigate to a section via HTTP POST or AppleScript fallback
   */
  private async navigateToSection(section: string): Promise<void> {
    const port = 7851; // VifTargets default port
    const appName = this.scene.app?.name || 'Talkie';

    // Try HTTP first
    try {
      const response = await fetch(`http://localhost:${port}/vif/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section }),
      });
      if (response.ok) {
        this.log(`🧭 Navigated to ${section} via HTTP`);
        await this.sleep(300);
        // Validate the navigation
        await this.validateAction('navigate', section);
        return;
      }
    } catch {
      // Fall through to AppleScript
    }

    // Fallback: Use AppleScript to post notification
    this.log(`🧭 Navigating to ${section} via AppleScript`);
    const { execSync } = await import('child_process');
    const script = `
      tell application "${appName}"
        activate
      end tell
      delay 0.2
      tell application "System Events"
        tell process "${appName}"
          -- Post notification to navigate
          do shell script "osascript -e 'tell application \\"${appName}\\" to «event navgSECT» \\"${section}\\"'"
        end tell
      end tell
    `;
    try {
      // Simple approach: just activate the app and let the DSL use coordinates
      execSync(`osascript -e 'tell application "${appName}" to activate'`);
    } catch {
      this.log(`⚠ AppleScript navigation failed`);
    }
    await this.sleep(500);
  }

  /**
   * Cleanup after scene execution
   */
  private async cleanup(): Promise<void> {
    this.log('🧹 Cleaning up...');

    // Hide all overlays - do these in parallel for speed
    const hidePromises: Promise<unknown>[] = [];

    // Always hide cursor and label (in case scene didn't)
    hidePromises.push(this.send('cursor.hide').catch(() => {}));
    hidePromises.push(this.send('label.hide').catch(() => {}));
    hidePromises.push(this.send('keys.hide').catch(() => {}));
    hidePromises.push(this.send('typer.hide').catch(() => {}));

    // Hide recording indicator
    hidePromises.push(this.send('record.indicator', { show: false }).catch(() => {}));

    // Hide debug HUD if enabled
    if (this.options.debug) {
      hidePromises.push(this.send('debug.hide').catch(() => {}));
    }

    // Wait for all hide commands to complete
    await Promise.all(hidePromises);

    // Hide viewport and backdrop (these should be last)
    await this.send('viewport.hide').catch(() => {});
    await this.send('stage.backdrop', { show: false }).catch(() => {});

    // Clear panel state
    await this.send('panel.action', { text: '' }).catch(() => {});
    await this.send('panel.scene', { name: '' }).catch(() => {});
    await this.send('panel.targetMode', { mode: 'none' }).catch(() => {});

    // Quit the app to ensure clean state for next run
    const appName = this.scene.app?.name;
    const appPath = this.scene.app?.path;
    if (appName) {
      this.log(`🧹 Quitting ${appName}`);
      try {
        execSync(`osascript -e 'tell application "${appName}" to quit'`, { timeout: 5000 });
        execSync('sleep 1');  // Give time for graceful quit
      } catch {
        // App might not respond to quit, force kill
        try {
          // Kill by path if specified, otherwise by name
          const killTarget = appPath || appName;
          execSync(`pkill -f "${killTarget}"`, { timeout: 5000 });
        } catch {
          // Ignore if app is already gone
        }
      }
    }

    this.log('✓ Cleanup complete');
  }
}

/**
 * Run a scene file
 */
export async function runScene(filePath: string, options?: RunnerOptions): Promise<void> {
  const parser = new SceneParser();
  const scene = parser.parseFile(filePath);
  const runner = new SceneRunner(scene, options);
  await runner.run();
}
