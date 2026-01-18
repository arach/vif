/**
 * VifAgent singleton for Nitro routes
 *
 * Manages a single agent instance that can be shared across all routes.
 */

import { VifAgent } from '../../src/agent-client.js'

let agent: VifAgent | null = null
let startPromise: Promise<VifAgent> | null = null

/**
 * Get or create the VifAgent instance
 */
export async function getAgent(): Promise<VifAgent> {
  // Already started
  if (agent?.isReady()) {
    return agent
  }

  // Starting in progress
  if (startPromise) {
    return startPromise
  }

  // Start new agent
  startPromise = (async () => {
    agent = new VifAgent()
    await agent.start()
    return agent
  })()

  return startPromise
}

/**
 * Check if agent is available
 */
export function isAgentAvailable(): boolean {
  return VifAgent.isAvailable()
}

/**
 * Stop the agent
 */
export async function stopAgent(): Promise<void> {
  if (agent) {
    agent.stop()
    agent = null
    startPromise = null
  }
}
