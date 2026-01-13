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
}

export class SceneRunner {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private scene: ParsedScene;
  private options: RunnerOptions;
  private appBounds: { x: number; y: number; width: number; height: number } | null = null;
  private appTargets: TargetRegistry = {};

  constructor(scene: ParsedScene, options: RunnerOptions = {}) {
    this.scene = scene;
    this.options = {
      port: 7850,
      verbose: false,
      dryRun: false,
      ...options,
    };
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

      console.log('\n✓ Scene complete\n');
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
      await this.send('cursor.moveTo', {
        x: coords.x,
        y: coords.y,
        duration: move.duration || 0.3,
      });
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

      if (typeof target === 'object' && 'x' in target) {
        // Explicit coordinates
        const coords = this.resolveCoordinates(target.x, target.y);
        await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: 0.3 });
        await this.send('cursor.click');
      } else if (typeof target === 'string') {
        // Try app targets first (from SDK integration)
        if (this.appTargets[target]) {
          const appTarget = this.appTargets[target];
          this.log(`📍 Using app target: ${target} → (${appTarget.x}, ${appTarget.y})`);
          await this.send('cursor.moveTo', { x: appTarget.x, y: appTarget.y, duration: 0.3 });
          await this.send('cursor.click');
        } else {
          // Fall back to view references defined in scene
          const coords = this.resolveViewTarget(target);
          await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: 0.3 });
          await this.send('cursor.click');
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

      for (const item of items) {
        const target = `${through}.${item}`;
        const coords = this.resolveViewTarget(target);
        await this.send('cursor.moveTo', { x: coords.x, y: coords.y, duration: 0.4 });
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
