/**
 * Chrome DevTools Protocol Client
 *
 * Manages WebSocket connection to Chrome for browser automation.
 * Handles launching Chrome, connecting to tabs, and sending CDP commands.
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import WebSocket from 'ws';

// CDP message types
interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface CDPClientOptions {
  port?: number;
  host?: string;
  launchChrome?: boolean;
  chromeFlags?: string[];
}

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = 'localhost';

// Chrome paths for macOS
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];

export class CDPClient {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pending = new Map<number, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private eventHandlers = new Map<string, Set<(params: unknown) => void>>();
  private chromeProcess: ChildProcess | null = null;
  private port: number;
  private host: string;
  private targetId: string | null = null;

  constructor(options: CDPClientOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
  }

  /**
   * Find Chrome executable on macOS
   */
  static findChrome(): string | null {
    for (const path of CHROME_PATHS) {
      try {
        execSync(`test -x "${path}"`, { stdio: 'ignore' });
        return path;
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Launch Chrome with remote debugging enabled
   */
  async launchChrome(flags: string[] = []): Promise<void> {
    const chromePath = CDPClient.findChrome();
    if (!chromePath) {
      throw new Error('Chrome not found. Please install Google Chrome.');
    }

    const args = [
      `--remote-debugging-port=${this.port}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...flags,
    ];

    this.chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });

    // Wait for Chrome to start and begin listening
    await this.waitForDebugger(10000);
  }

  /**
   * Wait for Chrome debugger to become available
   */
  private async waitForDebugger(timeout: number): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`http://${this.host}:${this.port}/json/version`);
        if (response.ok) {
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Timeout waiting for Chrome debugger');
  }

  /**
   * Get list of available targets (pages/tabs)
   */
  async listTargets(): Promise<CDPTarget[]> {
    const response = await fetch(`http://${this.host}:${this.port}/json/list`);
    if (!response.ok) {
      throw new Error(`Failed to list targets: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Create a new page/tab
   */
  async newPage(url?: string): Promise<CDPTarget> {
    const endpoint = url
      ? `http://${this.host}:${this.port}/json/new?${encodeURIComponent(url)}`
      : `http://${this.host}:${this.port}/json/new`;

    const response = await fetch(endpoint, { method: 'PUT' });
    if (!response.ok) {
      throw new Error(`Failed to create new page: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Connect to a specific target by ID, or to the first available page
   */
  async connect(targetId?: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    let target: CDPTarget | undefined;

    if (targetId) {
      const targets = await this.listTargets();
      target = targets.find(t => t.id === targetId);
      if (!target) {
        throw new Error(`Target ${targetId} not found`);
      }
    } else {
      // Find first page target
      const targets = await this.listTargets();
      target = targets.find(t => t.type === 'page');

      if (!target) {
        // Create a new page if none exists
        target = await this.newPage();
      }
    }

    if (!target.webSocketDebuggerUrl) {
      throw new Error('Target has no WebSocket debugger URL');
    }

    this.targetId = target.id;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(target!.webSocketDebuggerUrl!);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.targetId = null;
      });

      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle incoming CDP messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as CDPMessage;

      // Response to a command
      if (message.id !== undefined && this.pending.has(message.id)) {
        const handler = this.pending.get(message.id)!;
        this.pending.delete(message.id);

        if (message.error) {
          handler.reject(new Error(`CDP Error: ${message.error.message}`));
        } else {
          handler.resolve(message.result);
        }
      }

      // Event notification
      if (message.method) {
        const handlers = this.eventHandlers.get(message.method);
        if (handlers) {
          for (const handler of handlers) {
            handler(message.params);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  /**
   * Send a CDP command and wait for response
   */
  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Chrome');
    }

    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject
      });

      this.ws!.send(JSON.stringify({ id, method, params }));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * Subscribe to a CDP event
   */
  on(event: string, handler: (params: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from a CDP event
   */
  off(event: string, handler: (params: unknown) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Enable a CDP domain
   */
  async enableDomain(domain: string): Promise<void> {
    await this.send(`${domain}.enable`);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current target ID
   */
  getTargetId(): string | null {
    return this.targetId;
  }

  /**
   * Disconnect from the target
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.targetId = null;
    this.pending.clear();
  }

  /**
   * Close Chrome if we launched it
   */
  close(): void {
    this.disconnect();
    if (this.chromeProcess) {
      try {
        process.kill(-this.chromeProcess.pid!);
      } catch {
        this.chromeProcess.kill();
      }
      this.chromeProcess = null;
    }
  }
}

// Singleton instance for convenience
let defaultClient: CDPClient | null = null;

export async function getCDPClient(options?: CDPClientOptions): Promise<CDPClient> {
  if (!defaultClient) {
    defaultClient = new CDPClient(options);
  }
  return defaultClient;
}

export function closeCDPClient(): void {
  if (defaultClient) {
    defaultClient.close();
    defaultClient = null;
  }
}
