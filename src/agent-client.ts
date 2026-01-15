/**
 * Vif Agent Client
 *
 * Spawns and communicates with the native Vif Agent for cursor,
 * keyboard, and typing overlays.
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Agent binary locations (in order of preference)
const AGENT_PATHS = [
  // Development: local build
  join(__dirname, '..', 'dist', 'Vif Agent.app', 'Contents', 'MacOS', 'vif-agent'),
  // Production: ~/.vif install
  join(homedir(), '.vif', 'Vif Agent.app', 'Contents', 'MacOS', 'vif-agent'),
];

// App bundle locations (for `open` launch)
const APP_BUNDLE_PATHS = [
  // Development: local build
  join(__dirname, '..', 'dist', 'Vif Agent.app'),
  // Production: ~/.vif install
  join(homedir(), '.vif', 'Vif Agent.app'),
];

export interface AgentResponse {
  ok?: boolean;
  error?: string;
  event?: string;
  [key: string]: unknown;
}

export class VifAgent extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private ready = false;
  private queue: Array<{ resolve: (r: AgentResponse) => void; reject: (e: Error) => void }> = [];

  /**
   * Find the agent binary
   */
  static findBinary(): string | null {
    for (const p of AGENT_PATHS) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Find the app bundle (for launching with `open`)
   */
  static findAppBundle(): string | null {
    for (const p of APP_BUNDLE_PATHS) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Check if agent is available
   */
  static isAvailable(): boolean {
    return VifAgent.findBinary() !== null;
  }

  /**
   * Launch agent as independent app (not tied to terminal)
   * Uses `open` command so it gets its own screen recording permission
   */
  static launchIndependent(): void {
    const appBundle = VifAgent.findAppBundle();
    if (!appBundle) {
      throw new Error('Vif Agent.app not found');
    }
    // Launch with open -g (don't bring to foreground)
    execSync(`open -g "${appBundle}"`, { stdio: 'ignore' });
  }

  /**
   * Check if agent is already running (by checking for process)
   */
  static isRunning(): boolean {
    try {
      const result = execSync('pgrep -f "Vif Agent.app/Contents/MacOS/vif-agent"', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Start the agent process
   */
  async start(): Promise<void> {
    const binary = VifAgent.findBinary();
    if (!binary) {
      throw new Error('Vif Agent not found. Run "vif install-agent" to install.');
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(binary, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,  // Run independently of terminal
      });

      // Don't keep parent alive waiting for this child
      this.process.unref();

      this.rl = readline.createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity,
      });

      this.rl.on('line', (line) => {
        try {
          const data = JSON.parse(line) as AgentResponse;

          if (data.event === 'ready') {
            this.ready = true;
            this.emit('ready');
            resolve();
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
      });

      // Log agent's stderr (debug output)
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        for (const line of text.split('\n')) {
          if (line.trim()) {
            console.error('[agent]', line);
          }
        }
      });

      this.process.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.process.on('exit', (code) => {
        this.ready = false;
        this.emit('exit', code);
      });

      // Timeout for startup
      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Agent startup timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Stop the agent
   */
  stop(): void {
    if (this.process) {
      this.send({ action: 'quit' }).catch(() => {});
      setTimeout(() => {
        this.process?.kill();
        this.process = null;
      }, 100);
    }
  }

  /**
   * Send a command to the agent
   */
  private send(cmd: Record<string, unknown>): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.ready) {
        return reject(new Error('Agent not running'));
      }

      this.queue.push({ resolve, reject });
      this.process.stdin!.write(JSON.stringify(cmd) + '\n');
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

  async stageBackdrop(show: boolean, type?: string): Promise<void> {
    await this.send({ action: 'stage.backdrop', show, type });
  }

  async stageRender(params: Record<string, unknown>): Promise<void> {
    await this.send({ action: 'stage.render', ...params });
  }

  async stageActivate(app: string): Promise<void> {
    await this.send({ action: 'stage.activate', app });
  }

  async stageSetup(config: {
    backdrop?: string;
    app?: { name: string; width?: number; height?: number };
    viewport?: { padding?: number };
    entry?: { timing?: number };
  }): Promise<AgentResponse> {
    return await this.send({ action: 'stage.setup', ...config });
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

  async panelTargetMode(mode: string): Promise<void> {
    await this.send({ action: 'panel.targetMode', mode });
  }

  async panelScene(name: string | null): Promise<void> {
    await this.send({ action: 'panel.scene', name: name ?? '' });
  }

  async panelAction(text: string): Promise<void> {
    await this.send({ action: 'panel.action', text });
  }

  async panelProgress(current: number, total: number): Promise<void> {
    await this.send({ action: 'panel.progress', current, total });
  }

  async panelRecordingPath(path: string): Promise<void> {
    await this.send({ action: 'panel.recordingPath', path });
  }

  // Countdown methods
  async countdownStart(count: number = 3): Promise<void> {
    await this.send({ action: 'countdown.start', count });
  }

  async countdownCancel(): Promise<void> {
    await this.send({ action: 'countdown.cancel' });
  }

  // Cue sound methods
  async cuePlay(sound: string, wait: boolean = false): Promise<void> {
    await this.send({ action: 'cue.play', sound, wait });
  }

  async cueStop(): Promise<void> {
    await this.send({ action: 'cue.stop' });
  }

  // Zoom methods
  async zoomStart(config: {
    type?: 'crop' | 'lens';
    level: number;
    target?: 'cursor' | { x: number; y: number };
    in?: { duration: number; easing: string };
    out?: { duration: number; easing: string };
    hold?: number | 'auto';
    size?: number;
    border?: boolean;
    shadow?: boolean;
  }): Promise<AgentResponse & { zooming?: boolean }> {
    return await this.send({ action: 'zoom.start', ...config });
  }

  async zoomEnd(config?: {
    duration?: number;
    easing?: string;
  }): Promise<AgentResponse & { duration?: number }> {
    return await this.send({ action: 'zoom.end', ...config });
  }

  async zoomStatus(): Promise<AgentResponse & { active?: boolean; type?: string; level?: number }> {
    return await this.send({ action: 'zoom.status' });
  }

  // Debug HUD methods
  async debugShow(x?: number, y?: number, width?: number): Promise<void> {
    if (x !== undefined && y !== undefined && width !== undefined) {
      await this.send({ action: 'debug.show', x, y, width });
    } else {
      await this.send({ action: 'debug.show' });
    }
  }

  async debugHide(): Promise<void> {
    await this.send({ action: 'debug.hide' });
  }

  async debugUpdate(data: Record<string, string>): Promise<void> {
    await this.send({ action: 'debug.update', ...data });
  }

  async debugClear(): Promise<void> {
    await this.send({ action: 'debug.clear' });
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
