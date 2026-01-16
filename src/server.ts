/**
 * vif Automation Server
 *
 * WebSocket server that accepts cursor/keyboard commands from any client.
 * Uses vif-agent for native overlays and input simulation.
 *
 * Protocol: JSON messages over WebSocket
 *
 * Client → Server (commands):
 *   // Cursor
 *   {"id": 1, "action": "cursor.show"}
 *   {"id": 2, "action": "cursor.hide"}
 *   {"id": 3, "action": "cursor.moveTo", "x": 500, "y": 300, "duration": 0.3}
 *   {"id": 4, "action": "cursor.click"}
 *   {"id": 5, "action": "cursor.doubleClick"}
 *   {"id": 6, "action": "cursor.rightClick"}
 *   {"id": 7, "action": "cursor.dragStart"}
 *   {"id": 8, "action": "cursor.dragEnd"}
 *
 *   // Keys (with visual overlay)
 *   {"id": 10, "action": "keys.show", "keys": ["cmd", "shift", "p"]}
 *   {"id": 11, "action": "keys.show", "keys": ["cmd", "c"], "press": true}
 *   {"id": 12, "action": "keys.press", "keys": ["cmd", "v"]}
 *   {"id": 13, "action": "keys.hide"}
 *
 *   // Typer (with visual overlay)
 *   {"id": 20, "action": "typer.type", "text": "hello", "style": "terminal"}
 *   {"id": 21, "action": "typer.clear"}
 *   {"id": 22, "action": "typer.hide"}
 *
 *   // Viewport (recording region mask)
 *   {"id": 25, "action": "viewport.set", "x": 100, "y": 100, "width": 1280, "height": 720}
 *   {"id": 26, "action": "viewport.set", "app": "Talkie"}  // Match app window
 *   {"id": 27, "action": "viewport.show"}
 *   {"id": 28, "action": "viewport.hide"}
 *
 *   // Recording (draft mode overwrites ~/.vif/draft.mp4)
 *   {"id": 40, "action": "record.start"}                              // draft mode
 *   {"id": 41, "action": "record.start", "mode": "final"}             // final mode
 *   {"id": 42, "action": "record.start", "mode": "final", "name": "feature-demo"}
 *   {"id": 43, "action": "record.stop"}
 *   {"id": 44, "action": "record.status"}
 *
 *   // Legacy shortcuts (for compatibility)
 *   {"id": 30, "action": "move", "x": 500, "y": 300}  → cursor.moveTo
 *   {"id": 31, "action": "click"}                     → cursor.click
 *   {"id": 32, "action": "type", "text": "hi"}        → typer.type
 *
 *   // System
 *   {"id": 99, "action": "ping"}
 *
 * Server → Client (responses):
 *   {"id": 1, "ok": true}
 *   {"id": 9, "ok": false, "error": "unknown action"}
 *
 * Server → Client (events):
 *   {"event": "ready", "version": "0.1.1"}
 *   {"event": "connected", "clients": 2}
 */

import { WebSocketServer, WebSocket } from 'ws';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, extname } from 'path';
import { VifAgent } from './agent-client.js';
import { runScene } from './dsl/index.js';

// ============================================================================
// Types
// ============================================================================

interface Command {
  id?: number;
  action: string;
  [key: string]: unknown;
}

interface Response {
  id?: number;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

interface ServerEvent {
  event: string;
  [key: string]: unknown;
}

// ============================================================================
// Server
// ============================================================================

export interface ServerOptions {
  port?: number;
  host?: string;
  verbose?: boolean;
}

export class JsonRpcServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private options: Required<ServerOptions>;
  private agent: VifAgent | null = null;
  private startTime: number = Date.now();

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port ?? 7850,
      host: options.host ?? 'localhost',
      verbose: options.verbose ?? false,
    };
  }

  /**
   * Start the WebSocket server and vif-agent
   */
  async start(): Promise<void> {
    // Start vif-agent first
    this.log('Starting vif-agent...');
    this.agent = new VifAgent();

    try {
      await this.agent.start();
      this.log('vif-agent ready');

      // Listen for user events from the agent (control panel buttons)
      this.agent.on('user_stop_recording', () => {
        this.log('User requested stop recording');
        this.broadcast({ event: 'user_stop_recording' });
      });

      this.agent.on('user_clear_stage', () => {
        this.log('User requested clear stage');
        this.broadcast({ event: 'user_clear_stage' });
      });
    } catch (err) {
      this.log(`Warning: vif-agent not available (${err instanceof Error ? err.message : 'unknown error'})`);
      this.log('Overlay features will be disabled');
      this.agent = null;
    }

    // Start WebSocket server
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.options.port,
          host: this.options.host,
        });

        this.wss.on('listening', () => {
          this.log(`vif server listening on ws://${this.options.host}:${this.options.port}`);
          resolve();
        });

        this.wss.on('connection', (ws) => {
          this.handleConnection(ws);
        });

        this.wss.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Stop agent
    if (this.agent) {
      this.agent.stop();
      this.agent = null;
    }

    // Close WebSocket server
    return new Promise((resolve) => {
      if (this.wss) {
        for (const client of this.clients) {
          client.close();
        }
        this.wss.close(() => {
          this.log('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: ServerEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    this.log(`Client connected (total: ${this.clients.size})`);

    // Send ready event
    this.send(ws, {
      event: 'ready',
      version: '0.1.1',
      agent: this.agent !== null,
    });

    // Notify all clients of connection count
    this.broadcast({ event: 'clients', count: this.clients.size });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const response = await this.handleCommand(message);
        this.send(ws, response);
      } catch (err) {
        this.send(ws, {
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this.log(`Client disconnected (total: ${this.clients.size})`);
      this.broadcast({ event: 'clients', count: this.clients.size });
    });

    ws.on('error', (err) => {
      this.log(`Client error: ${err.message}`);
    });
  }

  private async handleCommand(cmd: Command): Promise<Response> {
    const { id, action } = cmd;

    // Enhanced logging with coordinates/params
    const params = this.formatParams(cmd);
    this.log(`← ${action}${params}${id ? ` (id: ${id})` : ''}`);

    // Check if agent is required but not available
    if (!this.agent && !['ping'].includes(action)) {
      return { id, ok: false, error: 'vif-agent not available' };
    }

    try {
      // Handle namespaced actions (cursor.*, keys.*, typer.*)
      if (action.includes('.')) {
        return await this.handleAgentCommand(id, action, cmd);
      }

      // Handle legacy shortcuts
      switch (action) {
        case 'move': {
          const { x, y, duration = 0.3 } = cmd;
          if (typeof x !== 'number' || typeof y !== 'number') {
            return { id, ok: false, error: 'move requires x and y' };
          }
          await this.agent!.cursorMoveTo(x, y, duration as number);
          return { id, ok: true };
        }

        case 'click': {
          const { x, y } = cmd;
          if (typeof x === 'number' && typeof y === 'number') {
            await this.agent!.cursorMoveTo(x, y, 0);
          }
          await this.agent!.cursorClick();
          return { id, ok: true };
        }

        case 'doubleClick': {
          await this.agent!.cursorDoubleClick();
          return { id, ok: true };
        }

        case 'rightClick': {
          await this.agent!.cursorRightClick();
          return { id, ok: true };
        }

        case 'type': {
          const { text, style = 'default' } = cmd;
          if (typeof text !== 'string') {
            return { id, ok: false, error: 'type requires text string' };
          }
          await this.agent!.typerType(text, style as 'default' | 'terminal' | 'code');
          return { id, ok: true };
        }

        case 'key': {
          const { keys, press = true } = cmd;
          if (!Array.isArray(keys)) {
            return { id, ok: false, error: 'key requires keys array' };
          }
          if (press) {
            await this.agent!.keysShow(keys as string[], true);
          } else {
            await this.agent!.keysShow(keys as string[], false);
          }
          return { id, ok: true };
        }

        case 'show': {
          await this.agent!.cursorShow();
          return { id, ok: true };
        }

        case 'hide': {
          await this.agent!.cursorHide();
          return { id, ok: true };
        }

        case 'ping': {
          return { id, ok: true, pong: Date.now() };
        }

        case 'status': {
          return {
            id,
            ok: true,
            agent: this.agent !== null,
            clients: this.clients.size,
            scene: this.runningScene,
            uptime: Date.now() - this.startTime,
            cwd: process.cwd(),
          };
        }

        case 'restart': {
          this.log('🔄 Restart requested, exiting...');
          setTimeout(() => process.exit(0), 100);
          return { id, ok: true, message: 'Server exiting - restart manually or use a process manager' };
        }

        case 'quit': {
          this.log('👋 Quit requested');
          setTimeout(() => process.exit(0), 100);
          return { id, ok: true, message: 'Server shutting down' };
        }

        default:
          return { id, ok: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return {
        id,
        ok: false,
        error: err instanceof Error ? err.message : 'Command failed',
      };
    }
  }

  private async handleAgentCommand(id: number | undefined, action: string, cmd: Command): Promise<Response> {
    const [domain, method] = action.split('.');

    switch (domain) {
      case 'cursor':
        return this.handleCursorCommand(id, method, cmd);
      case 'keys':
        return this.handleKeysCommand(id, method, cmd);
      case 'typer':
        return this.handleTyperCommand(id, method, cmd);
      case 'input':
        return this.handleInputCommand(id, method, cmd);
      case 'voice':
        return this.handleVoiceCommand(id, method, cmd);
      case 'viewport':
        return this.handleViewportCommand(id, method, cmd);
      case 'label':
        return this.handleLabelCommand(id, method, cmd);
      case 'stage':
        return this.handleStageCommand(id, method, cmd);
      case 'record':
        return this.handleRecordCommand(id, method, cmd);
      case 'panel':
        return this.handlePanelCommand(id, method, cmd);
      case 'scenes':
        return this.handleScenesCommand(id, method, cmd);
      default:
        return { id, ok: false, error: `Unknown domain: ${domain}` };
    }
  }

  private async handleCursorCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'show':
        await this.agent!.cursorShow();
        return { id, ok: true };

      case 'hide':
        await this.agent!.cursorHide();
        return { id, ok: true };

      case 'moveTo': {
        const { x, y, duration = 0.3 } = cmd;
        if (typeof x !== 'number' || typeof y !== 'number') {
          return { id, ok: false, error: 'moveTo requires x and y' };
        }
        await this.agent!.cursorMoveTo(x, y, duration as number);
        return { id, ok: true };
      }

      case 'click':
        await this.agent!.cursorClick();
        return { id, ok: true };

      case 'doubleClick':
        await this.agent!.cursorDoubleClick();
        return { id, ok: true };

      case 'rightClick':
        await this.agent!.cursorRightClick();
        return { id, ok: true };

      case 'dragStart':
        await this.agent!.cursorDragStart();
        return { id, ok: true };

      case 'dragEnd':
        await this.agent!.cursorDragEnd();
        return { id, ok: true };

      default:
        return { id, ok: false, error: `Unknown cursor method: ${method}` };
    }
  }

  private async handleKeysCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'show': {
        const { keys, press = false } = cmd;
        if (!Array.isArray(keys)) {
          return { id, ok: false, error: 'keys.show requires keys array' };
        }
        await this.agent!.keysShow(keys as string[], press as boolean);
        return { id, ok: true };
      }

      case 'press': {
        const { keys } = cmd;
        if (!Array.isArray(keys)) {
          return { id, ok: false, error: 'keys.press requires keys array' };
        }
        await this.agent!.keysPress(keys as string[]);
        return { id, ok: true };
      }

      case 'hide':
        await this.agent!.keysHide();
        return { id, ok: true };

      default:
        return { id, ok: false, error: `Unknown keys method: ${method}` };
    }
  }

  private async handleTyperCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'type': {
        const { text, style = 'default', delay = 0.05 } = cmd;
        if (typeof text !== 'string') {
          return { id, ok: false, error: 'typer.type requires text string' };
        }
        await this.agent!.typerType(text, style as 'default' | 'terminal' | 'code', delay as number);
        return { id, ok: true };
      }

      case 'clear':
        await this.agent!.typerClear();
        return { id, ok: true };

      case 'hide':
        await this.agent!.typerHide();
        return { id, ok: true };

      default:
        return { id, ok: false, error: `Unknown typer method: ${method}` };
    }
  }

  private async handleInputCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'type': {
        // Type actual text into focused field (real keyboard input)
        const { text, delay = 0.03 } = cmd;
        if (typeof text !== 'string') {
          return { id, ok: false, error: 'input.type requires text string' };
        }
        await this.agent!.inputType(text, delay as number);
        return { id, ok: true };
      }

      case 'char': {
        // Type a single character
        const { char } = cmd;
        if (typeof char !== 'string' || char.length === 0) {
          return { id, ok: false, error: 'input.char requires char string' };
        }
        await this.agent!.inputChar(char);
        return { id, ok: true };
      }

      default:
        return { id, ok: false, error: `Unknown input method: ${method}` };
    }
  }

  private async handleVoiceCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'play': {
        const { file } = cmd;
        if (typeof file !== 'string') {
          return { id, ok: false, error: 'voice.play requires file path' };
        }
        const result = await this.agent!.voicePlay(file);
        return {
          id,
          ok: result.ok ?? true,
          file,
          duration: result.duration as number,
          deviceIndex: result.deviceIndex as number,
          error: result.error as string | undefined,
        };
      }

      case 'stop':
        await this.agent!.voiceStop();
        return { id, ok: true };

      case 'status': {
        const result = await this.agent!.voiceStatus();
        return {
          id,
          ok: true,
          playing: result.playing as boolean,
        };
      }

      default:
        return { id, ok: false, error: `Unknown voice method: ${method}` };
    }
  }

  private async handleViewportCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'set': {
        const { x, y, width, height, app } = cmd;
        if (typeof app === 'string') {
          await this.agent!.viewportSetApp(app);
        } else if (typeof x === 'number' && typeof y === 'number' &&
                   typeof width === 'number' && typeof height === 'number') {
          await this.agent!.viewportSet(x, y, width, height);
        } else {
          return { id, ok: false, error: 'viewport.set requires (x, y, width, height) or app name' };
        }
        return { id, ok: true };
      }

      case 'show':
        await this.agent!.viewportShow();
        return { id, ok: true };

      case 'hide':
        await this.agent!.viewportHide();
        return { id, ok: true };

      default:
        return { id, ok: false, error: `Unknown viewport method: ${method}` };
    }
  }

  private async handleLabelCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'show': {
        const text = cmd.text as string || '';
        const options: { position?: 'top' | 'bottom'; x?: number; y?: number; width?: number } = {};
        if (cmd.position) options.position = cmd.position as 'top' | 'bottom';
        if (typeof cmd.x === 'number') options.x = cmd.x;
        if (typeof cmd.y === 'number') options.y = cmd.y;
        if (typeof cmd.width === 'number') options.width = cmd.width;
        await this.agent!.labelShow(text, options);
        return { id, ok: true };
      }

      case 'hide':
        await this.agent!.labelHide();
        return { id, ok: true };

      case 'update': {
        const text = cmd.text as string || '';
        await this.agent!.labelUpdate(text);
        return { id, ok: true };
      }

      default:
        return { id, ok: false, error: `Unknown label method: ${method}` };
    }
  }

  private async handleRecordCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'start': {
        const mode = (cmd.mode as 'draft' | 'final') || 'draft';
        const name = cmd.name as string | undefined;
        const result = await this.agent!.recordStart(mode, name);
        return {
          id,
          ok: result.ok ?? true,
          path: result.path as string,
          mode,
          error: result.error as string | undefined,
        };
      }

      case 'stop': {
        const result = await this.agent!.recordStop();
        return {
          id,
          ok: result.ok ?? true,
          path: result.path as string,
          sizeBytes: result.sizeBytes as number,
          sizeMB: result.sizeMB as number,
          error: result.error as string | undefined,
        };
      }

      case 'status': {
        const result = await this.agent!.recordStatus();
        return {
          id,
          ok: true,
          recording: result.recording as boolean,
          mode: result.mode as string,
          path: result.path as string,
        };
      }

      case 'indicator': {
        // Set recording indicator UI without actually recording
        // Used when TypeScript recorder handles capture
        const show = cmd.show as boolean;
        await this.agent!.recordIndicator(show);
        return { id, ok: true };
      }

      default:
        return { id, ok: false, error: `Unknown record method: ${method}` };
    }
  }

  private async handlePanelCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'show':
        await this.agent!.panelShow();
        return { id, ok: true };

      case 'hide':
        await this.agent!.panelHide();
        return { id, ok: true };

      case 'headless': {
        const enabled = cmd.enabled as boolean ?? true;
        await this.agent!.panelHeadless(enabled);
        return { id, ok: true };
      }

      default:
        return { id, ok: false, error: `Unknown panel method: ${method}` };
    }
  }

  private async handleStageCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'set': {
        const app = cmd.app as string;
        if (!app) return { id, ok: false, error: 'stage.set requires app name' };
        const width = cmd.width as number | undefined;
        const height = cmd.height as number | undefined;
        const hideDesktop = cmd.hideDesktop as boolean | undefined;
        await this.agent!.stageSet(app, width, height, hideDesktop);
        return { id, ok: true };
      }

      case 'clear':
        await this.agent!.stageClear();
        return { id, ok: true };

      case 'center': {
        const app = cmd.app as string;
        if (!app) return { id, ok: false, error: 'stage.center requires app name' };
        const width = cmd.width as number | undefined;
        const height = cmd.height as number | undefined;
        const result = await this.agent!.stageCenter(app, width, height);
        // Pass through bounds from agent if available
        return {
          id,
          ok: true,
          bounds: result.bounds as { x: number; y: number; width: number; height: number } | undefined,
        };
      }

      case 'hideOthers': {
        const app = cmd.app as string;
        if (!app) return { id, ok: false, error: 'stage.hideOthers requires app name' };
        await this.agent!.stageHideOthers(app);
        return { id, ok: true };
      }

      case 'hideDesktop':
        await this.agent!.stageHideDesktop();
        return { id, ok: true };

      case 'showDesktop':
        await this.agent!.stageShowDesktop();
        return { id, ok: true };

      case 'backdrop': {
        const show = cmd.show as boolean;
        await this.agent!.stageBackdrop(show);
        return { id, ok: true };
      }

      case 'render': {
        // Pass render command to web backdrop
        const { action: _a, id: _id, ...params } = cmd;
        await this.agent!.stageRender(params);
        return { id, ok: true };
      }

      default:
        return { id, ok: false, error: `Unknown stage method: ${method}` };
    }
  }

  // Track running scene
  private runningScene: { name: string; startTime: number } | null = null;

  private async handleScenesCommand(id: number | undefined, method: string, cmd: Command): Promise<Response> {
    switch (method) {
      case 'list': {
        // List scenes from a directory (default: demos/scenes in cwd)
        const dir = (cmd.dir as string) || 'demos/scenes';
        const scenesDir = resolve(process.cwd(), dir);

        try {
          const scenes = await this.scanScenesDir(scenesDir);
          return { id, ok: true, scenes, dir: scenesDir };
        } catch (err) {
          // Return empty list with the path we tried, so user knows what's wrong
          return { id, ok: true, scenes: [], error: `No scenes in ${scenesDir}` };
        }
      }

      case 'read': {
        // Read a scene file
        const path = cmd.path as string;
        if (!path) return { id, ok: false, error: 'scenes.read requires path' };

        try {
          const fullPath = resolve(process.cwd(), path);
          const content = await readFile(fullPath, 'utf-8');
          return { id, ok: true, content };
        } catch (err) {
          return { id, ok: false, error: `Failed to read scene: ${err}` };
        }
      }

      case 'run': {
        // Run a scene file
        const path = cmd.path as string;
        if (!path) return { id, ok: false, error: 'scenes.run requires path' };

        if (this.runningScene) {
          return { id, ok: false, error: `Scene already running: ${this.runningScene.name}` };
        }

        const fullPath = resolve(process.cwd(), path);
        this.runningScene = { name: path, startTime: Date.now() };
        this.log(`▶ Running scene: ${path}`);

        // Run scene in background, don't await
        runScene(fullPath, { port: this.options.port })
          .then(() => {
            this.log(`✓ Scene completed: ${path}`);
            this.runningScene = null;
          })
          .catch((err) => {
            this.log(`✗ Scene failed: ${err.message}`);
            this.runningScene = null;
          });

        return { id, ok: true, message: `Started scene: ${path}` };
      }

      case 'status': {
        return {
          id,
          ok: true,
          running: this.runningScene !== null,
          scene: this.runningScene,
        };
      }

      default:
        return { id, ok: false, error: `Unknown scenes method: ${method}` };
    }
  }

  private async scanScenesDir(dir: string): Promise<Array<{ name: string; path: string; modified: string }>> {
    const scenes: Array<{ name: string; path: string; modified: string }> = [];

    const scanDir = async (currentDir: string, prefix = '') => {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          await scanDir(fullPath, relativePath);
        } else if (extname(entry.name) === '.yaml' || extname(entry.name) === '.yml') {
          const stats = await stat(fullPath);
          scenes.push({
            name: entry.name,
            path: relativePath,
            modified: stats.mtime.toISOString(),
          });
        }
      }
    };

    await scanDir(dir);
    return scenes.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  private send(ws: WebSocket, data: Response | ServerEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private log(msg: string): void {
    // Always log - this is useful for debugging demos
    console.log(`[vif] ${msg}`);
  }

  private formatParams(cmd: Command): string {
    const { action, id, ...rest } = cmd;
    const parts: string[] = [];

    // Format key parameters for common actions
    if ('x' in rest && 'y' in rest) {
      parts.push(`x=${rest.x}, y=${rest.y}`);
      if ('duration' in rest) parts.push(`dur=${rest.duration}s`);
    }
    if ('text' in rest) {
      const text = String(rest.text);
      parts.push(`"${text.length > 30 ? text.slice(0, 30) + '...' : text}"`);
    }
    if ('keys' in rest && Array.isArray(rest.keys)) {
      parts.push(`[${(rest.keys as string[]).join('+')}]`);
    }
    if ('style' in rest) parts.push(`style=${rest.style}`);
    if ('width' in rest && 'height' in rest) {
      parts.push(`${rest.width}x${rest.height}`);
    }
    if ('app' in rest) parts.push(`app="${rest.app}"`);
    if ('mode' in rest) parts.push(`mode=${rest.mode}`);
    if ('name' in rest) parts.push(`name="${rest.name}"`);

    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }
}

// ============================================================================
// Convenience function
// ============================================================================

/**
 * Start the vif automation server
 */
export async function startServer(options: ServerOptions = {}): Promise<JsonRpcServer> {
  const server = new JsonRpcServer(options);
  await server.start();
  return server;
}
