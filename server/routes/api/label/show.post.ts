/**
 * Show label overlay
 * POST /api/label/show
 * Body: { text: string, position?: 'top' | 'bottom' }
 */
import { defineEventHandler, readBody, createError } from 'h3'
import { getAgent } from '~/utils/agent'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ text: string; position?: 'top' | 'bottom' }>(event)

  if (!body.text) {
    throw createError({
      statusCode: 400,
      message: 'text is required',
    })
  }

  const agent = await getAgent()
  await agent.labelShow(body.text, body.position ?? 'top')

  return { ok: true }
})
