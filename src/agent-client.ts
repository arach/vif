/**
 * Vif Agent Client
 *
 * Spawns and communicates with the native Vif Agent for cursor,
 * keyboard, and typing overlays.
 */

import { spawn, ChildProcess } from 'child_process';
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
   * Check if agent is available
   */
  static isAvailable(): boolean {
    return VifAgent.findBinary() !== null;
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
      });

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
