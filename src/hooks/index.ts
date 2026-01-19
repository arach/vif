/**
 * Vif Hooks System
 *
 * Central hook system for vif using the hookable library.
 * Enables plugins, telemetry, custom behaviors, and extensibility.
 *
 * @example Basic hook registration
 * ```typescript
 * import { hooks } from '@anthropic/vif'
 *
 * hooks.hook('scene:action-before', (action, index) => {
 *   console.log(`Executing action ${index}: ${JSON.stringify(action)}`)
 * })
 * ```
 *
 * @example Plugin pattern
 * ```typescript
 * import { defineVifPlugin } from '@anthropic/vif'
 *
 * export default defineVifPlugin({
 *   name: 'my-plugin',
 *   setup(hooks) {
 *     hooks.hook('recording:started', (path) => {
 *       sendNotification(`Recording started: ${path}`)
 *     })
 *   }
 * })
 * ```
 */

import { createHooks, type Hookable } from 'hookable';
import type { VifHooks, VifPlugin, VifHookable } from './types.js';

// ─── Core Hooks Instance ────────────────────────────────────────────────────

/**
 * Central hooks instance for the vif system.
 *
 * All components (server, agent, runner) share this instance
 * to provide a unified hook API.
 */
export const hooks = createHooks<VifHooks>() as Hookable<VifHooks> & VifHookable;

// ─── Plugin Helpers ─────────────────────────────────────────────────────────

/**
 * Define a vif plugin.
 *
 * @example
 * ```typescript
 * export default defineVifPlugin({
 *   name: 'telemetry',
 *   setup(hooks) {
 *     hooks.hook('command:after', (ctx, result) => {
 *       metrics.increment(`vif.command.${ctx.action}`)
 *     })
 *   }
 * })
 * ```
 */
export function defineVifPlugin(plugin: VifPlugin): VifPlugin {
  return plugin;
}

/**
 * Register a plugin with the hooks system.
 *
 * @example
 * ```typescript
 * import telemetryPlugin from './plugins/telemetry'
 * import { registerPlugin } from '@anthropic/vif'
 *
 * await registerPlugin(telemetryPlugin)
 * ```
 */
export async function registerPlugin(plugin: VifPlugin): Promise<void> {
  await plugin.setup(hooks);
}

/**
 * Register multiple plugins at once.
 *
 * @example
 * ```typescript
 * await registerPlugins([
 *   telemetryPlugin,
 *   loggingPlugin,
 *   notificationPlugin
 * ])
 * ```
 */
export async function registerPlugins(plugins: VifPlugin[]): Promise<void> {
  for (const plugin of plugins) {
    await registerPlugin(plugin);
  }
}

// ─── Hook Utilities ─────────────────────────────────────────────────────────

/**
 * Create a scoped hooks instance.
 *
 * Useful for testing or isolated hook contexts.
 */
export function createVifHooks(): Hookable<VifHooks> & VifHookable {
  return createHooks<VifHooks>() as Hookable<VifHooks> & VifHookable;
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export type {
  VifHooks,
  VifPlugin,
  VifHookable,
  RecordingOptions,
  CommandContext,
} from './types.js';
