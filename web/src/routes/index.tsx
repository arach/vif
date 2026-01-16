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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
        <p className="text-neutral-500 mt-1">Monitor and control your vif automation server</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatusCard
          label="Connection"
          value={connected ? 'Online' : 'Offline'}
          status={connected ? 'success' : 'error'}
          icon="●"
        />
        <StatusCard
          label="Agent"
          value={status?.agent ? 'Active' : 'Inactive'}
          status={status?.agent ? 'success' : 'neutral'}
          icon="◆"
        />
        <StatusCard
          label="Scene"
          value={status?.scene ? 'Running' : 'Idle'}
          status={status?.scene ? 'warning' : 'neutral'}
          icon="▶"
        />
        <StatusCard
          label="Uptime"
          value={status ? formatUptime(status.uptime) : '—'}
          status="neutral"
          icon="◷"
        />
      </div>

      {/* Server Control Bar */}
      {connected && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-vif-accent/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                <span className="text-vif-accent">⚡</span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Server Control</p>
                <p className="text-xs font-mono text-neutral-500 truncate max-w-md">
                  {status?.cwd || 'Loading...'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirm('Restart the vif server?')) {
                    vifClient.send('restart')
                  }
                }}
                className="glow-button px-4 py-2 bg-vif-warning/10 text-vif-warning border border-vif-warning/20 rounded-lg text-sm font-medium hover:bg-vif-warning/20 transition-all"
              >
                ↻ Restart
              </button>
              <button
                onClick={() => {
                  if (confirm('Quit the vif server?')) {
                    vifClient.send('quit')
                  }
                }}
                className="px-4 py-2 bg-vif-danger/10 text-vif-danger border border-vif-danger/20 rounded-lg text-sm font-medium hover:bg-vif-danger/20 transition-all"
              >
                ⏻ Quit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Running Scene Banner */}
      {status?.scene && (
        <div className="glass-card p-4 border-vif-warning/30 bg-gradient-to-r from-vif-warning/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-vif-warning/20 flex items-center justify-center">
                <span className="text-vif-warning animate-pulse">▶</span>
              </div>
              <div>
                <p className="font-medium text-vif-warning">Scene Running</p>
                <p className="text-sm text-neutral-400">{status.scene.name}</p>
              </div>
            </div>
            <div className="text-sm text-neutral-400">
              {formatUptime(Date.now() - status.scene.startTime)} elapsed
            </div>
          </div>
        </div>
      )}

      {/* Control Sections */}
      <div className="grid grid-cols-2 gap-6">
        {/* Stage Controls */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-vif-accent">◐</span>
            <h2 className="font-semibold">Stage Controls</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ControlButton onClick={() => vifClient.send('cursor.show', {})} icon="↖" label="Show Cursor" />
            <ControlButton onClick={() => vifClient.send('cursor.hide', {})} icon="↗" label="Hide Cursor" />
            <ControlButton onClick={() => vifClient.send('backdrop.show', {})} icon="▣" label="Show Backdrop" />
            <ControlButton onClick={() => vifClient.send('backdrop.hide', {})} icon="▢" label="Hide Backdrop" />
            <ControlButton onClick={() => vifClient.send('stage.clear', {})} icon="✕" label="Clear Stage" variant="danger" />
          </div>
        </div>

        {/* Recording Controls */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-vif-danger">●</span>
            <h2 className="font-semibold">Recording</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ControlButton
              onClick={() => vifClient.send('record.start', { mode: 'draft' })}
              icon="●"
              label="Start Draft"
              variant="primary"
            />
            <ControlButton
              onClick={() => vifClient.send('record.stop', {})}
              icon="■"
              label="Stop"
              variant="danger"
            />
            <ControlButton onClick={() => vifClient.send('record.indicator', { show: true })} icon="◉" label="Show Indicator" />
            <ControlButton onClick={() => vifClient.send('record.indicator', { show: false })} icon="○" label="Hide Indicator" />
          </div>
        </div>

        {/* Label Controls */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-purple-400">◈</span>
            <h2 className="font-semibold">Labels</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ControlButton onClick={() => vifClient.send('label.show', { text: 'Hello World', position: 'top' })} icon="▲" label="Label Top" />
            <ControlButton onClick={() => vifClient.send('label.show', { text: 'Hello World', position: 'bottom' })} icon="▼" label="Label Bottom" />
            <ControlButton onClick={() => vifClient.send('label.hide', {})} icon="✕" label="Hide Label" />
          </div>
        </div>

        {/* Keys Controls */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400">⌨</span>
            <h2 className="font-semibold">Keys Overlay</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ControlButton onClick={() => vifClient.send('keys.show', { keys: ['cmd', 'shift', 'p'] })} icon="⌘" label="Cmd+Shift+P" />
            <ControlButton onClick={() => vifClient.send('keys.show', { keys: ['cmd', 's'] })} icon="⌘" label="Cmd+S" />
            <ControlButton onClick={() => vifClient.send('keys.hide', {})} icon="✕" label="Hide Keys" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusCard({
  label,
  value,
  status,
  icon,
}: {
  label: string
  value: string
  status: 'success' | 'error' | 'warning' | 'neutral'
  icon: string
}) {
  const statusColors = {
    success: 'text-vif-success',
    error: 'text-vif-danger',
    warning: 'text-vif-warning',
    neutral: 'text-neutral-400',
  }

  const bgColors = {
    success: 'from-vif-success/10',
    error: 'from-vif-danger/10',
    warning: 'from-vif-warning/10',
    neutral: 'from-neutral-500/10',
  }

  return (
    <div className={`glass-card p-4 bg-gradient-to-br ${bgColors[status]} to-transparent`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-lg ${statusColors[status]}`}>{icon}</span>
      </div>
      <p className={`text-2xl font-semibold ${statusColors[status]}`}>{value}</p>
      <p className="text-sm text-neutral-500 mt-1">{label}</p>
    </div>
  )
}

function ControlButton({
  onClick,
  icon,
  label,
  variant = 'default',
}: {
  onClick: () => void
  icon: string
  label: string
  variant?: 'default' | 'primary' | 'danger'
}) {
  const variants = {
    default: 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08] hover:border-white/20',
    primary: 'bg-vif-accent/10 border-vif-accent/30 text-vif-accent hover:bg-vif-accent/20',
    danger: 'bg-vif-danger/10 border-vif-danger/30 text-vif-danger hover:bg-vif-danger/20',
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm transition-all ${variants[variant]}`}
    >
      <span className="opacity-60">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
