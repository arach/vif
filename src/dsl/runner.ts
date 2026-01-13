/**
 * Vif Scene Runner
 *
 * Executes a parsed scene by sending commands to the vif server via WebSocket.
 */

import WebSocket from 'ws';
import {
  ParsedScene,
  Action,
  SceneParser,
  View,
  LabelDef
} from './parser.js';
import { resolveTarget, TargetRegistry, queryAppTargets } from './targets.js';

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

  constructor(scene: ParsedScene, options: RunnerOptions = {}) {
    this.scene = scene;
    this.options = {
      port: 7850,
      verbose: false,
      dryRun: false,
      validate: true,  // Enable validation by default
      ...options,
    };
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
   * Run the scene
   */
  async run(): Promise<void> {
    console.log(`\n▶ Running scene: ${this.scene.scene.name}\n`);

    // Clear previous events for clean validation
    if (this.options.validate) {
      await this.clearVifEvents();
    }

    await this.connect();

    try {
      // Setup stage
      await this.setupStage();

      // Execute sequence
      for (const action of this.scene.sequence) {
        await this.executeAction(action);
      }

      // Cleanup
      await this.cleanup();

      console.log('\n✓ Scene complete');

      // Print validation summary
      this.printValidationSummary();
    } finally {
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
    }

    // Position and resize app window
    if (app) {
      const width = app.window?.width || 1200;
      const height = app.window?.height || 800;

      await this.send('stage.center', {
        app: app.name,
        width,
        height,
      });

      // Store app bounds for coordinate resolution
      // The stage.center command returns the calculated bounds
      // For now, calculate based on screen center
      const screenWidth = 1710; // TODO: Get from server
      const screenHeight = 1112;
      const padding = stage.viewport?.padding || 10;

      this.appBounds = {
        x: Math.floor((screenWidth - width) / 2),
        y: Math.floor((screenHeight - height) / 2),
        width,
        height,
      };

      // Set viewport
      if (stage.viewport) {
        const vp = {
          x: this.appBounds.x - padding,
          y: this.appBounds.y - padding,
          width: width + padding * 2,
          height: height + padding * 2,
        };
        await this.send('viewport.set', vp);
        await this.send('viewport.show');
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
    }
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
          // Click target with coordinates from app
          this.log(`📍 Using app target: ${target} → (${(directTarget as any).x}, ${(directTarget as any).y})`);
          await this.send('cursor.moveTo', { x: (directTarget as any).x, y: (directTarget as any).y, duration: 0.3 });
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

    // record
    if ('record' in action) {
      if (action.record === 'start') {
        const mode = this.scene.scene.mode || 'draft';
        await this.send('record.start', { mode, name: this.scene.scene.output });
      } else {
        await this.send('record.stop');
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
   * Cleanup after scene execution
   */
  private async cleanup(): Promise<void> {
    await this.send('viewport.hide');
    await this.send('stage.backdrop', { show: false });
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
