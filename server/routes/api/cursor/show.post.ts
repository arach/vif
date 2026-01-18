/**
 * Show cursor overlay
 * POST /api/cursor/show
 */
import { defineEventHandler } from 'h3'
import { getAgent } from '~/utils/agent'

export default defineEventHandler(async () => {
  const agent = await getAgent()
  await agent.cursorShow()
  return { ok: true }
})
