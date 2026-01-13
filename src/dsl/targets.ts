/**
 * Vif Target Resolution
 *
 * Queries apps for clickable target coordinates.
 * Apps expose targets via HTTP endpoint on a known port.
 */

export interface Target {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface TargetRegistry {
  [identifier: string]: Target;
}

// Default port for target queries (apps run server on this port)
const DEFAULT_TARGET_PORT = 7851;

/**
 * Query an app for its registered targets
 */
export async function queryAppTargets(
  appName: string,
  port: number = DEFAULT_TARGET_PORT
): Promise<TargetRegistry> {
  try {
    const response = await fetch(`http://localhost:${port}/vif/targets`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.targets || {};
  } catch (err) {
    // App doesn't expose targets - return empty
    return {};
  }
}

/**
 * Resolve a target identifier to coordinates
 */
export async function resolveTarget(
  identifier: string,
  appName: string,
  port: number = DEFAULT_TARGET_PORT
): Promise<Target | null> {
  const targets = await queryAppTargets(appName, port);
  return targets[identifier] || null;
}

/**
 * Check if an app exposes vif targets
 */
export async function appHasTargets(
  appName: string,
  port: number = DEFAULT_TARGET_PORT
): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/vif/targets`, {
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  }
}
