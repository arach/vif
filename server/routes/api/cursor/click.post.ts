/**
 * Perform click at current position
 * POST /api/cursor/click
 */
import { defineEventHandler } from 'h3'
import { getAgent } from '~/utils/agent'

export default defineEventHandler(async () => {
  const agent = await getAgent()
  await agent.cursorClick()
  return { ok: true }
})
