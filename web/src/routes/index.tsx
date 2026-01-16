import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { vifClient } from '@/lib/vif-client'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

interface ServerStatus {
  ok: boolean
  agent: boolean
  clients: number
  scene: { name: string; startTime: number } | null
  uptime: number
  cwd: string
}

function Dashboard() {
  const [connected, setConnected] = useState(vifClient.connected)

  useEffect(() => {
    return vifClient.onConnection(setConnected)
  }, [])

  const { data: status } = useQuery({
    queryKey: ['server-status'],
    queryFn: () => vifClient.send<ServerStatus>('status'),
    refetchInterval: 1000,
    enabled: connected,
  })

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatusCard
          label="Connection"
          value={connected ? 'Connected' : 'Offline'}
          status={connected ? 'success' : 'error'}
        />
        <StatusCard
          label="Agent"
          value={status?.agent ? 'Running' : 'Stopped'}
          status={status?.agent ? 'success' : 'neutral'}
        />
        <StatusCard
          label="Scene"
          value={status?.scene ? 'Running' : 'Idle'}
          status={status?.scene ? 'warning' : 'neutral'}
        />
        <StatusCard
          label="Uptime"
          value={status ? formatUptime(status.uptime) : '-'}
          status="neutral"
        />
      </div>

      {/* Server Info */}
      {status?.cwd && (
        <div className="flex items-center justify-between bg-neutral-900 rounded-lg px-4 py-3">
          <div className="text-sm font-mono text-neutral-400 truncate flex-1">
            {status.cwd}
          </div>
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => {
                if (confirm('Restart the vif server?')) {
                  vifClient.send('restart')
                }
              }}
              className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-sm hover:bg-yellow-500/30"
            >
              Restart
            </button>
            <button
              onClick={() => {
                if (confirm('Quit the vif server?')) {
                  vifClient.send('quit')
                }
              }}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-sm hover:bg-red-500/30"
            >
              Quit
            </button>
          </div>
        </div>
      )}

      {/* Running Scene */}
      {status?.scene && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Running Scene</h2>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-yellow-400">{status.scene.name}</p>
                <p className="text-sm text-neutral-400">
                  Started {formatUptime(Date.now() - status.scene.startTime)} ago
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-sm text-yellow-400">Recording</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Stage Controls</h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton onClick={() => vifClient.send('cursor.show', {})}>
            Show Cursor
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('cursor.hide', {})}>
            Hide Cursor
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('backdrop.show', {})}>
            Show Backdrop
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('backdrop.hide', {})}>
            Hide Backdrop
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('stage.clear', {})}>
            Clear Stage
          </ActionButton>
        </div>
      </section>

      {/* Label Controls */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Labels</h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton onClick={() => vifClient.send('label.show', { text: 'Hello World', position: 'top' })}>
            Show Label (Top)
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('label.show', { text: 'Hello World', position: 'bottom' })}>
            Show Label (Bottom)
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('label.hide', {})}>
            Hide Label
          </ActionButton>
        </div>
      </section>

      {/* Recording Controls */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recording</h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton
            onClick={() => vifClient.send('record.start', { mode: 'draft' })}
            variant="primary"
          >
            Start Recording (Draft)
          </ActionButton>
          <ActionButton
            onClick={() => vifClient.send('record.stop', {})}
            variant="danger"
          >
            Stop Recording
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('record.indicator', { show: true })}>
            Show Indicator
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('record.indicator', { show: false })}>
            Hide Indicator
          </ActionButton>
        </div>
      </section>
    </div>
  )
}

function StatusCard({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status: 'success' | 'error' | 'warning' | 'neutral'
}) {
  const statusColors = {
    success: 'text-green-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    neutral: 'text-neutral-400',
  }

  return (
    <div className="bg-vif-surface border border-vif-border rounded-lg p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className={`text-xl font-medium ${statusColors[status]}`}>{value}</p>
    </div>
  )
}

function ActionButton({
  onClick,
  children,
  variant = 'default',
}: {
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'danger'
}) {
  const variants = {
    default: 'bg-vif-surface border-vif-border hover:bg-neutral-800',
    primary: 'bg-vif-accent border-vif-accent hover:bg-blue-600',
    danger: 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30',
  }

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 border rounded-lg text-sm transition-colors ${variants[variant]}`}
    >
      {children}
    </button>
  )
}
