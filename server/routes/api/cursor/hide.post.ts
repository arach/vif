/**
 * Hide cursor overlay
 * POST /api/cursor/hide
 */
import { defineEventHandler } from 'h3'
import { getAgent } from '~/utils/agent'

export default defineEventHandler(async () => {
  const agent = await getAgent()
  await agent.cursorHide()
  return { ok: true }
})
