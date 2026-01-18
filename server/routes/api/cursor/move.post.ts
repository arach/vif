/**
 * Move cursor to position
 * POST /api/cursor/move
 * Body: { x: number, y: number, duration?: number }
 */
import { defineEventHandler, readBody, createError } from 'h3'
import { getAgent } from '~/utils/agent'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ x: number; y: number; duration?: number }>(event)

  if (typeof body.x !== 'number' || typeof body.y !== 'number') {
    throw createError({
      statusCode: 400,
      message: 'x and y are required numbers',
    })
  }

  const agent = await getAgent()
  await agent.cursorMoveTo(body.x, body.y, body.duration ?? 0.3)

  return { ok: true, x: body.x, y: body.y }
})
