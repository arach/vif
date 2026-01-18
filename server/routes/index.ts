/**
 * Root endpoint
 * GET /
 */
import { defineEventHandler } from 'h3'
import { isAgentAvailable } from '~/utils/agent'

export default defineEventHandler(() => {
  return {
    name: 'vif-server',
    version: '0.1.0',
    description: 'Automation server for vif - screen capture and demo automation',
    agentAvailable: isAgentAvailable(),
    endpoints: {
      health: 'GET /api/health',
      cursor: {
        show: 'POST /api/cursor/show',
        hide: 'POST /api/cursor/hide',
        move: 'POST /api/cursor/move',
        click: 'POST /api/cursor/click',
      },
      label: {
        show: 'POST /api/label/show',
        hide: 'POST /api/label/hide',
      },
      websocket: 'WS /_ws',
    },
  }
})
