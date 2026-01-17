/**
 * Vif WebSocket Client
 * Connects to the vif agent for real-time control and status updates
 */

type MessageHandler = (event: VifEvent) => void
type ConnectionHandler = (connected: boolean) => void

export interface VifEvent {
  type: string
  id?: number
  result?: unknown
  error?: string
  [key: string]: unknown
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class VifClient {
  private ws: WebSocket | null = null
  private url: string
  private msgId = 0
  private pending = new Map<number, PendingRequest>()
  private messageHandlers = new Set<MessageHandler>()
  private connectionHandlers = new Set<ConnectionHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true

  constructor(url = 'ws://localhost:7850') {
    this.url = url
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.shouldReconnect = true
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('[vif] Connected')
        this.notifyConnection(true)
        resolve()
      }

      this.ws.onerror = (err) => {
        console.error('[vif] WebSocket error:', err)
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        console.log('[vif] Disconnected')
        this.notifyConnection(false)
        this.scheduleReconnect()
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as VifEvent
          this.handleMessage(data)
        } catch (err) {
          console.error('[vif] Failed to parse message:', err)
        }
      }
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    if (this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      console.log('[vif] Attempting reconnect...')
      this.connect().catch(() => {
        // Will retry via onclose
      })
    }, 2000)
  }

  private handleMessage(data: VifEvent): void {
    // Handle response to a request
    if (data.id !== undefined && this.pending.has(data.id)) {
      const pending = this.pending.get(data.id)!
      this.pending.delete(data.id)
      clearTimeout(pending.timeout)

      if (data.error) {
        pending.reject(new Error(data.error))
      } else {
        // Server returns data at top level, not in a 'result' property
        pending.resolve(data)
      }
      return
    }

    // Broadcast to message handlers
    this.messageHandlers.forEach(handler => handler(data))
  }

  /**
   * Send an action to the vif agent
   */
  send<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to vif agent'))
        return
      }

      const id = ++this.msgId
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timeout: ${action}`))
      }, 30000)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })

      this.ws.send(JSON.stringify({ id, action, ...params }))
    })
  }

  /**
   * Subscribe to all incoming messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * Subscribe to connection state changes
   */
  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler)
    return () => this.connectionHandlers.delete(handler)
  }

  private notifyConnection(connected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(connected))
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
export const vifClient = new VifClient()
