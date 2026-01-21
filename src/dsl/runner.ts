/**
 * Vif Scene Runner
 *
 * Executes a parsed scene by:
 * - Using the recorder module directly for screen capture
 * - Sending commands to the vif server via WebSocket for overlays/cursor
 */

import WebSocket from 'ws';
import { homedir } from 'os';
import { join } from 'path';
import {
  ParsedScene,
  Action,
  SceneParser,
  View,
  LabelDef
} from './parser.js';
import { resolveTarget, TargetRegistry, queryAppTargets } from './targets.js';
import { Recorder, RecordingRegion } from '../recorder/index.js';
import { AudioManager } from '../audio-manager.js';
import { hooks } from '../hooks/index.js';
import type { RecordingOptions } from '../hooks/types.js';

export interface RunnerOptions {
  port?: number;
  verbose?: boolean;
  dryRun?: boolean;
  validate?: boolean;  // Enable action validation via VifTargets
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

// Track what we've set up for proper teardown
interface SetupState {
  backdrop: boolean;
  cursor: boolean;
  viewport: boolean;
  recording: boolean;
  recordIndicator: boolean;
  labels: Set<string>;  // label IDs
  keys: boolean;
  typer: boolean;
  camera: boolean;
}

export class SceneRunner {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private scene: ParsedScene;
  private options: RunnerOptions;
  private appBounds: { x: number; y: number; width: number; height: number } | null = null;
  private appTargets: TargetRegistry = {};
  private vifTargetsPort = 7851;  // VifTargets SDK port
  private targetOffset: { x: number; y: number } = { x: 0, y: 0 };  // Offset for target coordinates
  private validationResults: ActionResult[] = [];
  private lastEventId: string | null = null;

  // Recorder instance - manages screen capture independently
  private recorder: Recorder;
  private viewportRegion: RecordingRegion | undefined;

  // Audio manager for multi-channel audio
  private audioManager: AudioManager;
  private currentRecordingPath: string | null = null;

  // Setup state tracking for proper teardown
  private setupState: SetupState = {
    backdrop: false,
    cursor: false,
    viewport: false,
    recording: false,
    recordIndicator: false,
    labels: new Set(),
    keys: false,
    typer: false,
    camera: false,
  };

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

    // Initialize audio manager with scene config
    this.audioManager = new AudioManager();
    this.audioManager.configure(scene.audio, scene.basePath);

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
   * Get output file path for recording
   */
  private getOutputPath(mode: 'draft' | 'final', name?: string): string {
    const vifDir = join(homedir(), '.vif');

    if (mode === 'draft') {
      // Draft mode: use custom name if provided, otherwise draft.mp4
      const filename = name ? `${name}.mp4` : 'draft.mp4';
      return join(vifDir, filename);
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

    // Call before-run hook
    await hooks.callHook('scene:before-run', this.scene);

    // Clear previous events for clean validation
    if (this.options.validate) {
      await this.clearVifEvents();
    }

    await this.connect();

    // Wire up audio manager to send commands via WebSocket
    this.audioManager.setAgentSender((action, params) => this.send(action, params));

    try {
      // Setup stage
      await this.setupStage();

      // Execute sequence with step tracking for timeline
      for (let i = 0; i < this.scene.sequence.length; i++) {
        const action = this.scene.sequence[i];

        // Call action-before hook
        await hooks.callHook('scene:action-before', action, i);

        // Emit step start event for timeline visualization
        this.send('timeline.step', { index: i }).catch(() => {});

        try {
          await this.executeAction(action);

          // Call action-after hook
          await hooks.callHook('scene:action-after', action, i);
        } catch (actionErr) {
          // Call action-error hook
          const error = actionErr instanceof Error ? actionErr : new Error(String(actionErr));
          await hooks.callHook('scene:action-error', action, i, error);
          throw actionErr;
        }
      }

      // Cleanup
      await this.cleanup();

      console.log('\n✓ Scene complete');

      // Call complete hook
      await hooks.callHook('scene:complete', this.scene);

      // Print validation summary
      this.printValidationSummary();
    } catch (err) {
      // Call scene error hook
      const error = err instanceof Error ? err : new Error(String(err));
      await hooks.callHook('scene:error', this.scene, error);

      // On error, run teardown to clean up everything we set up
      console.log('\n⚠ Error during scene execution, cleaning up...');
      try {
        await this.teardown();
      } catch (teardownErr) {
        this.log(`⚠ Teardown error: ${teardownErr}`);
        // Force stop recorder as last resort
        if (this.recorder.isRecording()) {
          this.recorder.forceStop();
        }
      }
      throw err;
    } finally {
      // Final safety check - force cleanup anything still running
      if (this.recorder.isRecording()) {
        this.log('⚠ Force stopping recorder in finally block');
        this.recorder.forceStop();
      }
      this.ws?.close();
    }
  }

  /**
   * Setup stage (backdrop, viewport, app positioning)
   */
  private async setupStage(): Promise<void> {
    const { stage, app } = this.scene;

    // Show backdrop
    if (stage.backdrop) {
      await this.send('stage.backdrop', { show: true });
      this.setupState.backdrop = true;
    }

    // Position and resize app window
    if (app) {
      const width = app.window?.width || 1200;
      const height = app.window?.height || 800;

      let centerResult: { bounds?: { x: number; y: number; width: number; height: number } } = {};
      try {
        centerResult = await this.send('stage.center', {
          app: app.name,
          width,
          height,
        }) as { bounds?: { x: number; y: number; width: number; height: number } };
        // Wait for window to settle after centering
        await this.sleep(500);
      } catch (err) {
        this.log(`⚠️ stage.center failed (continuing anyway): ${err instanceof Error ? err.message : 'unknown'}`);
      }

      // Store app bounds for coordinate resolution
      // Use actual bounds from stage.center if available, otherwise calculate
      let screenWidth = 1710;
      let screenHeight = 1112;
      const padding = stage.viewport?.padding || 10;

      if (centerResult.bounds) {
        // Use actual bounds returned by stage.center
        this.appBounds = centerResult.bounds;
        this.log(`📐 Using actual bounds from agent: x=${centerResult.bounds.x}, y=${centerResult.bounds.y}, ${centerResult.bounds.width}x${centerResult.bounds.height}`);
      } else {
        this.log(`📐 No bounds from agent, using hardcoded screen size ${screenWidth}x${screenHeight}`);
        // Fall back to calculated bounds
        this.appBounds = {
          x: Math.floor((screenWidth - width) / 2),
          y: Math.floor((screenHeight - height) / 2),
          width,
          height,
        };
      }

      // Set viewport
      if (stage.viewport) {
        const vp = {
          x: this.appBounds.x - padding,
          y: this.appBounds.y - padding,
          width: width + padding * 2,
          height: height + padding * 2,
        };
        this.log(`📐 Viewport: x=${vp.x}, y=${vp.y}, ${vp.width}x${vp.height}`);
        await this.send('viewport.set', vp);
        await this.send('viewport.show');
        this.setupState.viewport = true;

        // Sync viewport with camera
        await this.send('camera.viewport', vp).catch(() => {});

        // Store viewport region for recorder
        this.viewportRegion = vp;
      }

      // Query app for registered targets (if app exposes them)
      try {
        this.appTargets = await queryAppTargets(app.name);
        const targetCount = Object.keys(this.appTargets).length;
        if (targetCount > 0) {
          this.log(`📍 Loaded ${targetCount} targets from ${app.name}`);
        }
      } catch {
        // App doesn't expose targets - that's ok
      }

      // Apply target offset if configured (compensates for coordinate system differences)
      if (app.targetOffset) {
        this.targetOffset = {
          x: app.targetOffset.x || 0,
          y: app.targetOffset.y || 0
        };
        this.log(`📍 Target offset: x=${this.targetOffset.x}, y=${this.targetOffset.y}`);
      }
    }

    // Auto-show camera if presenter is enabled in scene
    if (this.scene.scene.presenter?.enabled) {
      const cameraParams: Record<string, unknown> = {};
      if (this.scene.scene.presenter.position) {
        cameraParams.position = this.scene.scene.presenter.position;
      }
      if (this.scene.scene.presenter.size !== undefined) {
        cameraParams.size = this.scene.scene.presenter.size;
      }
      await this.send('camera.show', cameraParams);
      this.setupState.camera = true;
      this.log(`📹 Camera enabled with presenter config`);
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: Action): Promise<void> {
    // cursor.show
    if ('cursor.show' in action) {
      await this.send('cursor.show');
      this.setupState.cursor = true;
      return;
    }

    // cursor.hide
    if ('cursor.hide' in action) {
      await this.send('cursor.hide');
      this.setupState.cursor = false;
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
          // Click target with coordinates from app (apply offset)
          const clickX = (directTarget as any).x + this.targetOffset.x;
          const clickY = (directTarget as any).y + this.targetOffset.y;
          this.log(`📍 Using app target: ${target} → (${clickX}, ${clickY})`);

          // Ensure app is frontmost before clicking
          if (this.scene.app?.name) {
            const { execSync } = await import('child_process');
            try {
              execSync(`osascript -e 'tell application "${this.scene.app.name}" to activate'`, { stdio: 'ignore' });
              await this.sleep(100);
            } catch {
              // Ignore activation errors
            }
          }

          await this.send('cursor.moveTo', { x: clickX, y: clickY, duration: 0.3 });
          await this.sleep(350);
          await this.send('cursor.click');
          await this.validateAction('click', target);
          return;
        }

        // Check if it's a navigation target (nav.xxx)
        const navTarget = this.appTargets[`nav.${target}`] || this.appTargets[target];
        if (navTarget && (navTarget as any).type === 'navigate') {
          // Use navigation instead of clicking
          this.log(`🧭 Navigating to: ${target}`);
          await this.navigateToSection((navTarget as any).section || target);
        } else if (this.appTargets[target] && typeof (this.appTargets[target] as any).x === 'number') {
          // Click target with coordinates
          const appTarget = this.appTargets[target] as { x: number; y: number };
          this.log(`📍 Using app target: ${target} → (${appTarget.x}, ${appTarget.y})`);
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
              // Use navigation API for sidebar clicks (more reliable)
              this.log(`🧭 Using nav API for sidebar click: ${section}`);
              await this.navigateToSection(section);
              return;
            }
          }

          // Fall back to view references defined in scene
          const coords = this.resolveViewTarget(target);
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

        // Call before-start hook
        const recordingOptions: RecordingOptions = { mode, name: this.scene.scene.output, output };
        await hooks.callHook('recording:before-start', recordingOptions);

        if (this.options.dryRun) {
          this.log(`🎬 [dry-run] Would start recording to ${output}`);
        } else {
          // Show recording indicator in agent UI
          await this.send('record.indicator', { show: true });
          this.setupState.recordIndicator = true;

          // Start audio timeline tracking
          this.audioManager.startRecording();
          this.currentRecordingPath = output;

          await this.recorder.start({
            output,
            region: this.viewportRegion,
            audio: false,
          });
          this.setupState.recording = true;

          // Call started hook
          await hooks.callHook('recording:started', output);
        }
      } else {
        // Call before-stop hook
        await hooks.callHook('recording:before-stop');

        if (this.options.dryRun) {
          this.log(`🎬 [dry-run] Would stop recording`);
        } else {
          const outputPath = await this.recorder.stop();
          this.setupState.recording = false;
          // Hide recording indicator in agent UI
          await this.send('record.indicator', { show: false });
          this.setupState.recordIndicator = false;

          // Check if we have audio to mix
          const timeline = this.audioManager.getTimeline();
          const hasPostAudio = timeline.some(e => {
            const channel = e.channel;
            // Check if any non-virtual-mic channels have audio
            return channel !== 1 || this.scene.audio?.channels?.[channel]?.output !== 'virtual-mic';
          });

          let finalOutputPath = outputPath;
          if (hasPostAudio && outputPath) {
            // Mix audio in post-processing
            const finalPath = outputPath.replace(/\.(mp4|mov)$/, '-final.$1');
            this.log(`🎵 Mixing ${timeline.length} audio events...`);
            const success = this.audioManager.renderFinalMix(outputPath, finalPath);
            if (success) {
              console.log(`📼 Recording saved: ${finalPath}`);
              finalOutputPath = finalPath;
            } else {
              console.log(`📼 Recording saved (no audio mix): ${outputPath}`);
            }
          } else {
            console.log(`📼 Recording saved: ${outputPath}`);
          }

          // Call stopped hook
          if (finalOutputPath) {
            await hooks.callHook('recording:stopped', finalOutputPath);
          }

          // Reset audio manager for next recording
          this.audioManager.reset();
          this.currentRecordingPath = null;
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
        const coords = this.resolveViewTarget(target);
        await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: moveDuration });
        await this.sleep(moveDuration * 1000 + 50);
        await this.send('cursor.click');
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
      this.setupState.labels.add('default');
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
      this.setupState.labels.delete('default');
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
      this.setupState.typer = true;
      // Wait for typing animation to complete
      const typingDuration = text.length * delay * 1000 + 200;
      await this.sleep(typingDuration);
      return;
    }

    // typer.hide
    if ('typer.hide' in action) {
      await this.send('typer.hide');
      this.setupState.typer = false;
      return;
    }

    // typer.clear
    if ('typer.clear' in action) {
      await this.send('typer.clear');
      this.setupState.typer = false;
      return;
    }

    // input.type (actual keyboard input)
    if ('input.type' in action) {
      const { text, delay = 0.03 } = action['input.type'];
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

    // ─── Multi-Channel Audio Actions ─────────────────────────────────────────

    // audio.play - play audio on a channel
    if ('audio.play' in action) {
      const playAction = action['audio.play'];
      const channel = playAction.channel ?? 1;
      const shouldWait = playAction.wait ?? (channel === 1);  // Default wait for channel 1

      this.log(`🎵 Playing audio on channel ${channel}: ${playAction.file}`);

      const duration = await this.audioManager.play({
        file: playAction.file,
        channel,
        wait: shouldWait,
        fadeIn: playAction.fadeIn ? SceneParser.parseDuration(playAction.fadeIn) : undefined,
        fadeOut: playAction.fadeOut ? SceneParser.parseDuration(playAction.fadeOut) : undefined,
        startAt: playAction.startAt ? SceneParser.parseDuration(playAction.startAt) : undefined,
        loop: playAction.loop,
      });

      this.log(`🎵 Audio duration: ${duration}ms`);
      return;
    }

    // audio.stop - stop audio on a channel
    if ('audio.stop' in action) {
      const stopAction = action['audio.stop'];
      const options = typeof stopAction === 'object' ? stopAction : {};

      this.log(`🎵 Stopping audio${options.channel ? ` on channel ${options.channel}` : ' (all channels)'}`);

      await this.audioManager.stop({
        channel: options.channel,
        fadeOut: options.fadeOut ? SceneParser.parseDuration(options.fadeOut) : undefined,
      });
      return;
    }

    // audio.volume - adjust volume on a channel
    if ('audio.volume' in action) {
      const volumeAction = action['audio.volume'];

      this.log(`🎵 Setting channel ${volumeAction.channel} volume to ${volumeAction.volume}`);

      await this.audioManager.setVolume({
        channel: volumeAction.channel,
        volume: volumeAction.volume,
        duration: volumeAction.duration ? SceneParser.parseDuration(volumeAction.duration) : undefined,
      });
      return;
    }

    // voice.play (audio playback through virtual mic) - backward compatible
    if ('voice.play' in action) {
      const playAction = action['voice.play'];
      const file = typeof playAction === 'string' ? playAction : playAction.file;
      const shouldWait = typeof playAction === 'object' ? playAction.wait !== false : true;

      // Resolve relative paths from scene basePath
      const resolvedFile = file.startsWith('/') || file.startsWith('~')
        ? file
        : `${this.scene.basePath}/${file}`;

      this.log(`🎤 Playing voice: ${file}`);
      const result = await this.send('voice.play', { file: resolvedFile }) as { duration?: number };

      // Wait for playback to complete if requested
      if (shouldWait && result.duration) {
        const waitMs = (result.duration as number) * 1000 + 200;
        await this.sleep(waitMs);
      }
      return;
    }

    // voice.stop
    if ('voice.stop' in action) {
      await this.send('voice.stop');
      return;
    }

    // camera.show
    if ('camera.show' in action) {
      const showAction = action['camera.show'];
      const params: Record<string, unknown> = (showAction && typeof showAction === 'object')
        ? (showAction as Record<string, unknown>)
        : {};
      await this.send('camera.show', params);
      this.setupState.camera = true;
      return;
    }

    // camera.hide
    if ('camera.hide' in action) {
      await this.send('camera.hide');
      this.setupState.camera = false;
      return;
    }

    // camera.set
    if ('camera.set' in action) {
      const setAction = action['camera.set'];
      await this.send('camera.set', setAction as Record<string, unknown>);
      return;
    }

    // zoom
    if ('zoom' in action) {
      const zoom = (action as any).zoom;
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
        in: { duration: inDuration, easing: zoom.in?.easing || 'ease-out' },
        out: { duration: outDuration, easing: zoom.out?.easing || 'ease-in' },
        hold: holdDuration,
      });
      return;
    }

    // zoom.reset
    if ('zoom.reset' in action) {
      const reset = (action as any)['zoom.reset'];
      const duration = reset?.duration ? SceneParser.parseDuration(reset.duration) : 300;
      await this.send('zoom.reset', { duration, easing: reset?.easing || 'ease-out' });
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
          return this.resolveCoordinates(
            baseX + (pos.x || 0),
            pos.y || 0
          );
        }
      }
    }

    // Try view.positions
    if (view.positions && itemName && itemName in view.positions) {
      const pos = view.positions[itemName];
      const baseX = this.getViewBaseX(view);
      return this.resolveCoordinates(
        baseX + this.resolvePositionValue(pos.x, this.appBounds?.width || 0),
        this.resolvePositionValue(pos.y, this.appBounds?.height || 0)
      );
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
   * Cleanup after scene execution - unwind everything we set up
   */
  private async teardown(): Promise<void> {
    this.log('🧹 Teardown: cleaning up...');

    // Stop recording first (most critical)
    if (this.setupState.recording) {
      this.log('🧹 Stopping recording...');
      try {
        if (this.recorder.isRecording()) {
          await this.recorder.stop();
        }
      } catch (e) {
        this.log(`⚠ Failed to stop recorder: ${e}`);
        this.recorder.forceStop();
      }
      this.setupState.recording = false;
    }

    // Hide recording indicator
    if (this.setupState.recordIndicator) {
      try {
        await this.send('record.indicator', { show: false });
      } catch { /* ignore */ }
      this.setupState.recordIndicator = false;
    }

    // Stop any active audio
    try {
      await this.audioManager.stop({ fadeOut: 0 });
    } catch { /* ignore */ }
    this.audioManager.reset();

    // Hide typer
    if (this.setupState.typer) {
      try {
        await this.send('typer.hide');
      } catch { /* ignore */ }
      this.setupState.typer = false;
    }

    // Hide keys
    if (this.setupState.keys) {
      try {
        await this.send('keys.hide');
      } catch { /* ignore */ }
      this.setupState.keys = false;
    }

    // Hide labels
    if (this.setupState.labels.size > 0) {
      try {
        await this.send('label.hide');
      } catch { /* ignore */ }
      this.setupState.labels.clear();
    }

    // Hide cursor
    if (this.setupState.cursor) {
      try {
        await this.send('cursor.hide');
      } catch { /* ignore */ }
      this.setupState.cursor = false;
    }

    // Hide camera
    if (this.setupState.camera) {
      try {
        await this.send('camera.hide');
      } catch { /* ignore */ }
      this.setupState.camera = false;
    }

    // Hide viewport
    if (this.setupState.viewport) {
      try {
        await this.send('viewport.hide');
      } catch { /* ignore */ }
      this.setupState.viewport = false;
    }

    // Hide backdrop (last)
    if (this.setupState.backdrop) {
      try {
        await this.send('stage.backdrop', { show: false });
      } catch { /* ignore */ }
      this.setupState.backdrop = false;
    }

    this.log('🧹 Teardown complete');
  }

  /**
   * Cleanup after scene execution (alias for backward compatibility)
   */
  private async cleanup(): Promise<void> {
    await this.teardown();
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
