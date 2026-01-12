/**
 * vif Automation Server
 *
 * WebSocket server that accepts cursor/keyboard commands from any client.
 * This is the platform layer - handles OS permissions and input control.
 *
 * Protocol: JSON messages over WebSocket
 *
 * Client → Server (commands):
 *   {"id": 1, "action": "move", "x": 500, "y": 300, "duration": 0.3}
 *   {"id": 2, "action": "click", "x": 500, "y": 300}
 *   {"id": 3, "action": "click"}  // at current position
 *   {"id": 4, "action": "type", "text": "hello"}
 *   {"id": 5, "action": "key", "key": "enter", "modifiers": ["cmd"]}
 *   {"id": 6, "action": "drag", "from": [100,100], "to": [200,200]}
 *   {"id": 7, "action": "scroll", "x": 500, "y": 300, "delta": -100}
 *   {"id": 8, "action": "position"}  // get current cursor position
 *
 * Server → Client (responses):
 *   {"id": 1, "ok": true}
 *   {"id": 8, "ok": true, "x": 500, "y": 300}
 *   {"id": 9, "ok": false, "error": "unknown action"}
 *
 * Server → Client (events):
 *   {"event": "ready", "version": "0.1.0"}
 *   {"event": "connected", "clients": 2}
 */

import { WebSocketServer, WebSocket } from 'ws';
import {
  getMousePosition,
  moveMouse,
  smoothMove,
  click,
  drag,
  hasMouseControl,
} from './automation.js';
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

interface Command {
  id?: number;
  action: string;
  [key: string]: any;
}

interface Response {
  id?: number;
  ok: boolean;
  error?: string;
  [key: string]: any;
}

interface ServerEvent {
  event: string;
  [key: string]: any;
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

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port ?? 7850,
      host: options.host ?? 'localhost',
      verbose: options.verbose ?? false,
    };
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
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
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections
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
      version: '0.1.0',
      mouseControl: hasMouseControl(),
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

    this.log(`← ${action}${id ? ` (id: ${id})` : ''}`);

    try {
      switch (action) {
        case 'move': {
          const { x, y, duration = 0 } = cmd;
          if (typeof x !== 'number' || typeof y !== 'number') {
            return { id, ok: false, error: 'move requires x and y' };
          }
          if (duration > 0) {
            await smoothMove({ x, y }, duration);
          } else {
            moveMouse({ x, y });
          }
          return { id, ok: true };
        }

        case 'click': {
          const { x, y, button = 'left', count = 1 } = cmd;
          const pos = (typeof x === 'number' && typeof y === 'number')
            ? { x, y }
            : undefined;
          click(pos, button, count);
          const finalPos = getMousePosition();
          return { id, ok: true, x: finalPos.x, y: finalPos.y };
        }

        case 'drag': {
          const { from, to, duration } = cmd;
          if (!Array.isArray(from) || !Array.isArray(to)) {
            return { id, ok: false, error: 'drag requires from and to arrays' };
          }
          drag({ x: from[0], y: from[1] }, { x: to[0], y: to[1] });
          return { id, ok: true };
        }

        case 'type': {
          const { text } = cmd;
          if (typeof text !== 'string') {
            return { id, ok: false, error: 'type requires text string' };
          }
          // Escape for AppleScript
          const escaped = text.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
          execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`, {
            stdio: 'pipe',
          });
          return { id, ok: true };
        }

        case 'key': {
          const { key, modifiers = [] } = cmd;
          if (typeof key !== 'string') {
            return { id, ok: false, error: 'key requires key string' };
          }

          // Map modifiers to AppleScript format
          const modMap: Record<string, string> = {
            cmd: 'command down',
            command: 'command down',
            opt: 'option down',
            option: 'option down',
            alt: 'option down',
            ctrl: 'control down',
            control: 'control down',
            shift: 'shift down',
          };

          const modStrs = modifiers
            .map((m: string) => modMap[m.toLowerCase()])
            .filter(Boolean);

          // Handle special keys
          const keyCodeMap: Record<string, number> = {
            enter: 36,
            return: 36,
            tab: 48,
            space: 49,
            delete: 51,
            backspace: 51,
            escape: 53,
            esc: 53,
            left: 123,
            right: 124,
            down: 125,
            up: 126,
          };

          let script: string;
          const keyCode = keyCodeMap[key.toLowerCase()];

          if (keyCode) {
            // Use key code for special keys
            script = modStrs.length > 0
              ? `tell application "System Events" to key code ${keyCode} using {${modStrs.join(', ')}}`
              : `tell application "System Events" to key code ${keyCode}`;
          } else {
            // Use keystroke for regular characters
            script = modStrs.length > 0
              ? `tell application "System Events" to keystroke "${key}" using {${modStrs.join(', ')}}`
              : `tell application "System Events" to keystroke "${key}"`;
          }

          execSync(`osascript -e '${script}'`, { stdio: 'pipe' });
          return { id, ok: true };
        }

        case 'scroll': {
          const { x, y, deltaX = 0, deltaY = 0 } = cmd;
          // Use AppleScript for scrolling
          // Positive deltaY = scroll down, negative = scroll up
          const direction = deltaY < 0 ? 'up' : 'down';
          const amount = Math.abs(deltaY);
          execSync(
            `osascript -e 'tell application "System Events" to scroll ${direction} ${amount}'`,
            { stdio: 'pipe' }
          );
          return { id, ok: true };
        }

        case 'position': {
          const pos = getMousePosition();
          return { id, ok: true, x: pos.x, y: pos.y };
        }

        case 'ping': {
          return { id, ok: true, pong: Date.now() };
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

  private send(ws: WebSocket, data: Response | ServerEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private log(msg: string): void {
    if (this.options.verbose) {
      console.log(`[vif] ${msg}`);
    }
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
