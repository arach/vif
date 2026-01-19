/**
 * WebSocket handler for vif automation
 *
 * Provides real-time bidirectional communication for cursor, label, keys,
 * viewport, and recording control.
 *
 * Protocol: JSON messages
 *
 * Client → Server:
 *   { "id": 1, "action": "cursor.show" }
 *   { "id": 2, "action": "cursor.moveTo", "x": 500, "y": 300, "duration": 0.3 }
 *   { "id": 3, "action": "label.show", "text": "Hello" }
 *
 * Server → Client:
 *   { "id": 1, "ok": true }
 *   { "id": 2, "ok": false, "error": "message" }
 *   { "event": "ready" }
 */
import { defineWebSocketHandler } from 'h3'
import { getAgent, isAgentAvailable } from '~/utils/agent'
import { hooks } from '../../src/hooks/index.js'
import type { CommandContext } from '../../src/hooks/types.js'

interface Command {
  id?: number
  action: string
  [key: string]: unknown
}

interface Response {
  id?: number
  ok: boolean
  error?: string
  [key: string]: unknown
}

export default defineWebSocketHandler({
  async open(peer) {
    console.log('[ws] Client connected:', peer.id)

    // Send ready event
    peer.send(JSON.stringify({
      event: 'ready',
      version: '0.1.0',
      agentAvailable: isAgentAvailable(),
    }))
  },

  async message(peer, message) {
    let cmd: Command

    try {
      cmd = JSON.parse(message.text())
    } catch {
      peer.send(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      return
    }

    const response = await handleCommand(cmd)
    peer.send(JSON.stringify(response))
  },

  close(peer) {
    console.log('[ws] Client disconnected:', peer.id)
  },

  error(peer, error) {
    console.error('[ws] Error:', error)
  },
})

async function handleCommand(cmd: Command): Promise<Response> {
  const { id, action } = cmd

  // Create command context for hooks
  const { id: _id, action: _action, ...cmdParams } = cmd
  const context: CommandContext = { action, params: cmdParams, id }

  // Call before hook
  await hooks.callHook('command:before', context)

  try {
    const agent = await getAgent()

    switch (action) {
      // ─── Cursor ───────────────────────────────────────────────────────
      case 'cursor.show':
        await agent.cursorShow()
        return { id, ok: true }

      case 'cursor.hide':
        await agent.cursorHide()
        return { id, ok: true }

      case 'cursor.moveTo': {
        const x = cmd.x as number
        const y = cmd.y as number
        const duration = (cmd.duration as number) ?? 0.3
        await agent.cursorMoveTo(x, y, duration)
        return { id, ok: true }
      }

      case 'cursor.click':
        await agent.cursorClick()
        return { id, ok: true }

      case 'cursor.doubleClick':
        await agent.cursorDoubleClick()
        return { id, ok: true }

      case 'cursor.rightClick':
        await agent.cursorRightClick()
        return { id, ok: true }

      // ─── Label ────────────────────────────────────────────────────────
      case 'label.show': {
        const text = cmd.text as string
        const position = (cmd.position as 'top' | 'bottom') ?? 'top'
        await agent.labelShow(text, position)
        return { id, ok: true }
      }

      case 'label.update': {
        const text = cmd.text as string
        await agent.labelUpdate(text)
        return { id, ok: true }
      }

      case 'label.hide':
        await agent.labelHide()
        return { id, ok: true }

      // ─── Keys ─────────────────────────────────────────────────────────
      case 'keys.show': {
        const keys = cmd.keys as string[]
        const press = (cmd.press as boolean) ?? false
        await agent.keysShow(keys, press)
        return { id, ok: true }
      }

      case 'keys.press': {
        const keys = cmd.keys as string[]
        await agent.keysPress(keys)
        return { id, ok: true }
      }

      case 'keys.hide':
        await agent.keysHide()
        return { id, ok: true }

      // ─── Typer ────────────────────────────────────────────────────────
      case 'typer.type': {
        const text = cmd.text as string
        const style = (cmd.style as string) ?? 'default'
        const delay = (cmd.delay as number) ?? 0.05
        await agent.typerType(text, style, delay)
        return { id, ok: true }
      }

      case 'typer.hide':
        await agent.typerHide()
        return { id, ok: true }

      case 'typer.clear':
        await agent.typerClear()
        return { id, ok: true }

      // ─── Viewport ─────────────────────────────────────────────────────
      case 'viewport.set': {
        const { x, y, width, height } = cmd as { x: number; y: number; width: number; height: number }
        await agent.viewportSet(x, y, width, height)
        return { id, ok: true }
      }

      case 'viewport.show':
        await agent.viewportShow()
        return { id, ok: true }

      case 'viewport.hide':
        await agent.viewportHide()
        return { id, ok: true }

      // ─── Stage ────────────────────────────────────────────────────────
      case 'stage.backdrop': {
        const show = cmd.show as boolean
        if (show) {
          await agent.backdropShow()
        } else {
          await agent.backdropHide()
        }
        return { id, ok: true }
      }

      case 'stage.center': {
        const app = cmd.app as string
        const width = cmd.width as number | undefined
        const height = cmd.height as number | undefined
        const bounds = await agent.stageCenter(app, width, height)
        return { id, ok: true, bounds }
      }

      case 'stage.clear':
        await agent.stageClear()
        return { id, ok: true }

      // ─── Recording ────────────────────────────────────────────────────
      case 'record.indicator': {
        const show = cmd.show as boolean
        await agent.recordIndicator(show)
        return { id, ok: true }
      }

      // ─── Input (actual keyboard) ──────────────────────────────────────
      case 'input.type': {
        const text = cmd.text as string
        const delay = (cmd.delay as number) ?? 0.03
        await agent.inputType(text, delay)
        return { id, ok: true }
      }

      // ─── System ───────────────────────────────────────────────────────
      case 'ping':
        return { id, ok: true, pong: true }

      default:
        return { id, ok: false, error: `Unknown action: ${action}` }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    // Call error hook
    await hooks.callHook('command:error', context, err)
    return { id, ok: false, error: err.message }
  }
}
