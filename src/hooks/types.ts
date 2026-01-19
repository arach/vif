/**
 * Vif Hook Types
 *
 * Type definitions for all hooks in the vif system.
 * Follows the same patterns as Nitro's hookable system.
 */

import type { VifAgent } from '../agent-client.js';
import type { Action, ParsedScene } from '../dsl/parser.js';

/**
 * Recording options passed to recording hooks
 */
export interface RecordingOptions {
  mode: 'draft' | 'final';
  name?: string;
  output: string;
}

/**
 * Command context for command execution hooks
 */
export interface CommandContext {
  action: string;
  params: Record<string, unknown>;
  id?: number;
}

/**
 * All Vif hooks
 *
 * Hook naming convention:
 * - `namespace:before-action` - Called before an action
 * - `namespace:action` or `namespace:after-action` - Called after action completes
 * - `namespace:error` - Called when an error occurs
 */
export interface VifHooks {
  // ─── Server Lifecycle ─────────────────────────────────────────────────────
  /**
   * Called before the server starts
   */
  'server:before-start': () => void | Promise<void>;

  /**
   * Called after the server has started and is listening
   */
  'server:started': (port: number) => void | Promise<void>;

  /**
   * Called before the server stops
   */
  'server:before-stop': () => void | Promise<void>;

  /**
   * Called after the server has stopped
   */
  'server:stopped': () => void | Promise<void>;

  // ─── Agent Lifecycle ──────────────────────────────────────────────────────
  /**
   * Called before the agent starts
   */
  'agent:before-start': () => void | Promise<void>;

  /**
   * Called when the agent is ready
   */
  'agent:ready': (agent: VifAgent) => void | Promise<void>;

  /**
   * Called when the agent disconnects
   */
  'agent:disconnected': () => void | Promise<void>;

  /**
   * Called when an agent error occurs
   */
  'agent:error': (error: Error) => void | Promise<void>;

  // ─── Command Execution ────────────────────────────────────────────────────
  /**
   * Called before a command is executed
   */
  'command:before': (context: CommandContext) => void | Promise<void>;

  /**
   * Called after a command completes successfully
   */
  'command:after': (context: CommandContext, result: unknown) => void | Promise<void>;

  /**
   * Called when a command fails
   */
  'command:error': (context: CommandContext, error: Error) => void | Promise<void>;

  // ─── Recording ────────────────────────────────────────────────────────────
  /**
   * Called before recording starts
   */
  'recording:before-start': (options: RecordingOptions) => void | Promise<void>;

  /**
   * Called after recording has started
   */
  'recording:started': (outputPath: string) => void | Promise<void>;

  /**
   * Called before recording stops
   */
  'recording:before-stop': () => void | Promise<void>;

  /**
   * Called after recording has stopped
   */
  'recording:stopped': (outputPath: string) => void | Promise<void>;

  // ─── Scene Execution ──────────────────────────────────────────────────────
  /**
   * Called before a scene starts running
   */
  'scene:before-run': (scene: ParsedScene) => void | Promise<void>;

  /**
   * Called before an action in the scene executes
   */
  'scene:action-before': (action: Action, index: number) => void | Promise<void>;

  /**
   * Called after an action in the scene completes
   */
  'scene:action-after': (action: Action, index: number) => void | Promise<void>;

  /**
   * Called when an action fails
   */
  'scene:action-error': (action: Action, index: number, error: Error) => void | Promise<void>;

  /**
   * Called when a scene completes successfully
   */
  'scene:complete': (scene: ParsedScene) => void | Promise<void>;

  /**
   * Called when a scene fails
   */
  'scene:error': (scene: ParsedScene, error: Error) => void | Promise<void>;
}

/**
 * Plugin definition for vif
 */
export interface VifPlugin {
  /**
   * Plugin name (used for debugging)
   */
  name?: string;

  /**
   * Setup function that registers hooks
   */
  setup: (hooks: VifHookable) => void | Promise<void>;
}

/**
 * Hookable instance type (for plugin setup function)
 */
export interface VifHookable {
  hook<T extends keyof VifHooks>(
    name: T,
    fn: VifHooks[T],
    options?: { allowDeprecated?: boolean }
  ): () => void;

  hookOnce<T extends keyof VifHooks>(
    name: T,
    fn: VifHooks[T],
    options?: { allowDeprecated?: boolean }
  ): () => void;

  callHook<T extends keyof VifHooks>(
    name: T,
    ...args: Parameters<VifHooks[T]>
  ): Promise<void>;

  callHookParallel<T extends keyof VifHooks>(
    name: T,
    ...args: Parameters<VifHooks[T]>
  ): Promise<void>;

  removeHook<T extends keyof VifHooks>(
    name: T,
    fn: VifHooks[T]
  ): void;

  removeAllHooks(): void;
}
