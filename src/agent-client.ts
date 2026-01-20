/**
 * Vif Agent Client
 *
 * Launches and communicates with the native Vif Agent for cursor,
 * keyboard, and typing overlays.
 *
 * Uses Unix socket for communication to ensure the agent gets its own
 * process identity for macOS permissions.
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import * as net from 'net';
import { hooks } from './hooks/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Socket path for agent communication
const SOCKET_PATH = '/tmp/vif-agent.sock';

// Agent app bundle locations (in order of preference)
const AGENT_APP_PATHS = [
  // Development: local build
  join(__dirname, '..', 'dist', 'Vif Agent.app'),
  // Production: ~/.vif install
  join(homedir(), '.vif', 'Vif Agent.app'),
];

// Legacy binary paths (for fallback)
const AGENT_PATHS = [
  join(__dirname, '..', 'dist', 'Vif Agent.app', 'Contents', 'MacOS', 'vif-agent'),
  join(homedir(), '.vif', 'Vif Agent.app', 'Contents', 'MacOS', 'vif-agent'),
];

export interface AgentResponse {
  ok?: boolean;
  error?: string;
  event?: string;
  [key: string]: unknown;
}

export class VifAgent extends EventEmitter {
  private socket: net.Socket | null = null;
  private ready = false;
  private queue: Array<{ resolve: (r: AgentResponse) => void; reject: (e: Error) => void }> = [];
  private lineBuffer = '';
  private useSocketMode = true; // New socket-based communication

  /**
   * Find the agent app bundle
   */
  static findAppBundle(): string | null {
    for (const p of AGENT_APP_PATHS) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Find the agent binary (legacy)
   */
  static findBinary(): string | null {
    for (const p of AGENT_PATHS) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Check if agent is available
   */
  static isAvailable(): boolean {
    return VifAgent.findAppBundle() !== null || VifAgent.findBinary() !== null;
  }

  /**
   * Start the agent process
   */
  async start(): Promise<void> {
    // Call before-start hook
    await hooks.callHook('agent:before-start');

    const appBundle = VifAgent.findAppBundle();

    try {
      if (this.useSocketMode && appBundle) {
        await this.startSocketMode(appBundle);
      } else {
        // Fallback to legacy stdio mode
        await this.startStdioMode();
      }

      // Call ready hook after successful start
      await hooks.callHook('agent:ready', this);
    } catch (error) {
      // Call error hook on failure
      await hooks.callHook('agent:error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start agent in socket mode (preferred)
   * Launches app via `open` for proper process identity
   */
  private async startSocketMode(appBundle: string): Promise<void> {
    // Clean up any existing socket
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // Ignore if doesn't exist
    }

    // Launch the app bundle with socket mode flag
    try {
      execSync(`open -a "${appBundle}" --args --socket --socket-path=${SOCKET_PATH}`, {
        stdio: 'ignore',
      });
    } catch (err) {
      throw new Error(`Failed to launch agent: ${err}`);
    }

    // Wait for socket to become available
    await this.waitForSocket(SOCKET_PATH, 10000);

    // Connect to the socket
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(SOCKET_PATH);

      this.socket.on('connect', () => {
        console.error('[agent] Connected via socket');
        this.ready = true;
        this.emit('ready');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.lineBuffer += data.toString();

        // Process complete lines
        let newlineIndex;
        while ((newlineIndex = this.lineBuffer.indexOf('\n')) !== -1) {
          const line = this.lineBuffer.slice(0, newlineIndex);
          this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);

          if (line.trim()) {
            this.handleLine(line);
          }
        }
      });

      this.socket.on('error', (err) => {
        this.emit('error', err);
        void hooks.callHook('agent:error', err);
        if (!this.ready) reject(err);
      });

      this.socket.on('close', () => {
        this.ready = false;
        this.emit('exit', 0);
        void hooks.callHook('agent:disconnected');
      });

      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Agent socket connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Wait for socket file to exist
   */
  private waitForSocket(path: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (existsSync(path)) {
          // Give the server a moment to start listening
          setTimeout(resolve, 100);
        } else if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for agent socket'));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Start agent in stdio mode (legacy fallback)
   */
  private async startStdioMode(): Promise<void> {
    const binary = VifAgent.findBinary();
    if (!binary) {
      throw new Error('Vif Agent not found. Run "vif install-agent" to install.');
    }

    return new Promise((resolve, reject) => {
      const process = spawn(binary, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const rl = readline.createInterface({
        input: process.stdout!,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => this.handleLine(line));

      process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        for (const line of text.split('\n')) {
          if (line.trim()) {
            console.error('[agent]', line);
          }
        }
      });

      process.on('error', (err) => {
        this.emit('error', err);
        void hooks.callHook('agent:error', err);
        reject(err);
      });

      process.on('exit', (code) => {
        this.ready = false;
        this.emit('exit', code);
        void hooks.callHook('agent:disconnected');
      });

      // Store process for sending commands
      (this as any)._process = process;

      // Wait for ready event
      const onReady = () => {
        this.ready = true;
        this.emit('ready');
        resolve();
      };
      this.once('ready', onReady);

      setTimeout(() => {
        if (!this.ready) {
          this.off('ready', onReady);
          reject(new Error('Agent startup timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle a line of JSON from the agent
   */
  private handleLine(line: string): void {
    try {
      const data = JSON.parse(line) as AgentResponse;

      if (data.event === 'ready') {
        this.ready = true;
        this.emit('ready');
      } else if (data.event) {
        this.emit(data.event, data);
      } else {
        // Response to a command
        const pending = this.queue.shift();
        if (pending) {
          if (data.ok) {
            pending.resolve(data);
          } else {
            pending.reject(new Error(data.error || 'Unknown error'));
          }
        }
      }
    } catch {
      // Ignore non-JSON output
    }
  }

  /**
   * Stop the agent
   */
  stop(): void {
    this.send({ action: 'quit' }).catch(() => {});
    setTimeout(async () => {
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }
      if ((this as any)._process) {
        (this as any)._process.kill();
        (this as any)._process = null;
      }
      // Call disconnected hook
      await hooks.callHook('agent:disconnected');
    }, 100);
  }

  /**
   * Send a command to the agent
   */
  private send(cmd: Record<string, unknown>): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        return reject(new Error('Agent not running'));
      }

      this.queue.push({ resolve, reject });
      const message = JSON.stringify(cmd) + '\n';

      if (this.socket) {
        this.socket.write(message);
      } else if ((this as any)._process) {
        (this as any)._process.stdin!.write(message);
      } else {
        this.queue.pop();
        reject(new Error('No connection to agent'));
      }
    });
  }

  // ─── Cursor Commands ─────────────────────────────────────────────

  async cursorShow(): Promise<void> {
    await this.send({ action: 'cursor.show' });
  }

  async cursorHide(): Promise<void> {
    await this.send({ action: 'cursor.hide' });
  }

  async cursorMoveTo(x: number, y: number, duration = 0.3): Promise<void> {
    await this.send({ action: 'cursor.moveTo', x, y, duration });
  }

  async cursorClick(): Promise<void> {
    await this.send({ action: 'cursor.click' });
  }

  async cursorDoubleClick(): Promise<void> {
    await this.send({ action: 'cursor.doubleClick' });
  }

  async cursorRightClick(): Promise<void> {
    await this.send({ action: 'cursor.rightClick' });
  }

  async cursorDragStart(): Promise<void> {
    await this.send({ action: 'cursor.dragStart' });
  }

  async cursorDragEnd(): Promise<void> {
    await this.send({ action: 'cursor.dragEnd' });
  }

  // ─── Keys Commands ───────────────────────────────────────────────

  async keysShow(keys: string[], press = false): Promise<void> {
    await this.send({ action: 'keys.show', keys, press });
  }

  async keysPress(keys: string[]): Promise<void> {
    await this.send({ action: 'keys.press', keys });
  }

  async keysHide(): Promise<void> {
    await this.send({ action: 'keys.hide' });
  }

  // ─── Typer Commands ──────────────────────────────────────────────

  async typerType(text: string, style: 'default' | 'terminal' | 'code' = 'default', delay = 0.05): Promise<void> {
    await this.send({ action: 'typer.type', text, style, delay });
  }

  async typerClear(): Promise<void> {
    await this.send({ action: 'typer.clear' });
  }

  async typerHide(): Promise<void> {
    await this.send({ action: 'typer.hide' });
  }

  // ─── Input Commands (Real Keyboard) ─────────────────────────────

  async inputType(text: string, delay = 0.03): Promise<void> {
    await this.send({ action: 'input.type', text, delay });
  }

  async inputChar(char: string): Promise<void> {
    await this.send({ action: 'input.char', char });
  }

  // ─── Voice Commands (Audio Playback through Virtual Mic) ─────────

  async voicePlay(file: string): Promise<AgentResponse> {
    return await this.send({ action: 'voice.play', file });
  }

  async voiceStop(): Promise<void> {
    await this.send({ action: 'voice.stop' });
  }

  async voiceStatus(): Promise<AgentResponse> {
    return await this.send({ action: 'voice.status' });
  }

  // ─── Viewport Commands ────────────────────────────────────────────

  async viewportSet(x: number, y: number, width: number, height: number): Promise<void> {
    await this.send({ action: 'viewport.set', x, y, width, height });
  }

  async viewportSetApp(appName: string): Promise<void> {
    await this.send({ action: 'viewport.set', app: appName });
  }

  async viewportShow(): Promise<void> {
    await this.send({ action: 'viewport.show' });
  }

  async viewportHide(): Promise<void> {
    await this.send({ action: 'viewport.hide' });
  }

  // ─── Label Commands (scene info, teleprompter) ────────────────────

  async labelShow(text: string, options?: { position?: 'top' | 'bottom'; x?: number; y?: number; width?: number }): Promise<void> {
    await this.send({ action: 'label.show', text, ...options });
  }

  async labelHide(): Promise<void> {
    await this.send({ action: 'label.hide' });
  }

  async labelUpdate(text: string): Promise<void> {
    await this.send({ action: 'label.update', text });
  }

  // ─── Stage Commands (clean recording environment) ─────────────────

  async stageSet(app: string, width?: number, height?: number, hideDesktop?: boolean): Promise<void> {
    await this.send({ action: 'stage.set', app, width, height, hideDesktop });
  }

  async stageClear(): Promise<void> {
    await this.send({ action: 'stage.clear' });
  }

  async stageCenter(app: string, width?: number, height?: number): Promise<AgentResponse> {
    return await this.send({ action: 'stage.center', app, width, height });
  }

  async stageHideOthers(app: string): Promise<void> {
    await this.send({ action: 'stage.hideOthers', app });
  }

  async stageHideDesktop(): Promise<void> {
    await this.send({ action: 'stage.hideDesktop' });
  }

  async stageShowDesktop(): Promise<void> {
    await this.send({ action: 'stage.showDesktop' });
  }

  async stageBackdrop(show: boolean): Promise<void> {
    await this.send({ action: 'stage.backdrop', show });
  }

  async stageRender(params: Record<string, unknown>): Promise<void> {
    await this.send({ action: 'stage.render', ...params });
  }

  // ─── Recording Commands ───────────────────────────────────────────

  async recordStart(mode: 'draft' | 'final' = 'draft', name?: string): Promise<AgentResponse> {
    return await this.send({ action: 'record.start', mode, name });
  }

  async recordStop(): Promise<AgentResponse> {
    return await this.send({ action: 'record.stop' });
  }

  async recordStatus(): Promise<AgentResponse> {
    return await this.send({ action: 'record.status' });
  }

  async recordIndicator(show: boolean): Promise<AgentResponse> {
    return await this.send({ action: 'record.indicator', show });
  }

  // ─── Panel Commands (control panel visibility) ────────────────────

  async panelShow(): Promise<void> {
    await this.send({ action: 'panel.show' });
  }

  async panelHide(): Promise<void> {
    await this.send({ action: 'panel.hide' });
  }

  async panelHeadless(enabled: boolean): Promise<void> {
    await this.send({ action: 'panel.headless', enabled });
  }

  // ─── Timeline Panel Commands ────────────────────────────────────────

  async timelineShow(): Promise<void> {
    await this.send({ action: 'timeline.show' });
  }

  async timelineHide(): Promise<void> {
    await this.send({ action: 'timeline.hide' });
  }

  async timelineScene(yaml: string): Promise<void> {
    await this.send({ action: 'timeline.scene', yaml });
  }

  async timelineStep(index: number): Promise<void> {
    await this.send({ action: 'timeline.step', index });
  }

  async timelineReset(): Promise<void> {
    await this.send({ action: 'timeline.reset' });
  }

  // ─── Camera Commands (Presenter Facecam Overlay) ───────────────────────────

  async cameraShow(options?: { position?: string; size?: string | number }): Promise<void> {
    await this.send({ action: 'camera.show', ...options });
  }

  async cameraHide(): Promise<void> {
    await this.send({ action: 'camera.hide' });
  }

  async cameraSet(options: { position?: string; size?: string | number }): Promise<void> {
    await this.send({ action: 'camera.set', ...options });
  }

  async cameraViewport(x: number, y: number, width: number, height: number): Promise<void> {
    await this.send({ action: 'camera.viewport', x, y, width, height });
  }

  // ─── Zoom Commands ─────────────────────────────────────────────────────────

  async zoomStart(options: {
    type?: 'crop' | 'lens';
    level: number;
    target?: 'cursor' | { x: number; y: number };
    in?: { duration: number; easing?: string };
    out?: { duration: number; easing?: string };
    hold?: number | 'auto';
  }): Promise<void> {
    await this.send({ action: 'zoom.start', ...options });
  }

  async zoomReset(options?: { duration?: number; easing?: string }): Promise<void> {
    await this.send({ action: 'zoom.reset', ...options });
  }
}

// Singleton instance for convenience
let defaultAgent: VifAgent | null = null;

export async function getAgent(): Promise<VifAgent> {
  if (!defaultAgent) {
    defaultAgent = new VifAgent();
    await defaultAgent.start();
  }
  return defaultAgent;
}

export function stopAgent(): void {
  if (defaultAgent) {
    defaultAgent.stop();
    defaultAgent = null;
  }
}
