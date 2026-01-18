/**
 * Hide label overlay
 * POST /api/label/hide
 */
import { defineEventHandler } from 'h3'
import { getAgent } from '~/utils/agent'

export default defineEventHandler(async () => {
  const agent = await getAgent()
  await agent.labelHide()
  return { ok: true }
})
