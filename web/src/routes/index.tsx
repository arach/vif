import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { vifClient } from '@/lib/vif-client'
import { useEffect, useState, useRef } from 'react'
import { TimelineOverlay } from '@/components/TimelineOverlay'

// Sample scene for timeline preview
const SAMPLE_SCENE_YAML = `
scene:
  name: Demo Scene
  mode: draft

sequence:
  - label: teleprompter
    text: "Welcome to the demo"
  - wait: 1s
  - cursor.show: {}
  - click: sidebar.home
  - wait: 500ms
  - navigate:
      through: sidebar
      items: [home, drafts, settings]
      wait: 400ms
  - label.update: "Navigating through items..."
  - wait: 800ms
  - click: content.center
  - record: start
  - wait: 2s
  - record: stop
  - cursor.hide: {}
  - label.hide: {}
`

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

      {/* Timeline Overlay Preview */}
      <TimelinePreview />

      {/* Timeline Panel (Native Overlay) */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-vif-accent">◧</span>
            <h2 className="font-semibold">Timeline Panel</h2>
            <span className="text-xs text-neutral-500">Native Overlay</span>
          </div>
        </div>
        <p className="text-sm text-neutral-500">
          Show the timeline as a real overlay on screen (via vif-agent WKWebView)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <ControlButton
            onClick={() => {
              vifClient.send('timeline.show', {})
              vifClient.send('timeline.scene', { yaml: SAMPLE_SCENE_YAML })
            }}
            icon="◧"
            label="Show Panel"
            variant="primary"
          />
          <ControlButton
            onClick={() => vifClient.send('timeline.hide', {})}
            icon="✕"
            label="Hide Panel"
          />
          <ControlButton
            onClick={() => vifClient.send('timeline.reset', {})}
            icon="↺"
            label="Reset"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              // Show panel and load scene first
              await vifClient.send('timeline.show', {})
              await vifClient.send('timeline.scene', { yaml: SAMPLE_SCENE_YAML })

              // Simulate stepping through (14 steps in sample)
              let step = 0
              const interval = setInterval(async () => {
                await vifClient.send('timeline.setstep', { index: step })
                step++
                if (step >= 14) {
                  clearInterval(interval)
                }
              }, 600)
            }}
            className="flex-1 px-3 py-2 bg-vif-success/10 text-vif-success border border-vif-success/30 rounded-lg text-sm font-medium hover:bg-vif-success/20 transition-all"
          >
            ▶ Simulate Playback
          </button>
        </div>
      </div>
    </div>
  )
}

function TimelinePreview() {
  const [currentStep, setCurrentStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [stepCount, setStepCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Count steps in sample scene
  useEffect(() => {
    const matches = SAMPLE_SCENE_YAML.match(/^\s+-\s/gm)
    setStepCount(matches?.length || 0)
  }, [])

  // Auto-play logic
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= stepCount - 1) {
            setIsPlaying(false)
            return -1 // Reset to beginning
          }
          return prev + 1
        })
      }, 800)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, stepCount])

  const handlePlay = () => {
    if (currentStep === -1) setCurrentStep(0)
    setIsPlaying(true)
  }

  const handlePause = () => {
    setIsPlaying(false)
  }

  const handleReset = () => {
    setIsPlaying(false)
    setCurrentStep(-1)
  }

  const handleStep = () => {
    setCurrentStep(prev => {
      if (prev >= stepCount - 1) return -1
      return prev + 1
    })
  }

  const handlePrevStep = () => {
    setCurrentStep(prev => {
      if (prev <= 0) return -1
      return prev - 1
    })
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-vif-accent">◧</span>
          <h2 className="font-semibold">Timeline Overlay</h2>
          <span className="text-xs text-neutral-500 ml-2">Component Preview</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Playback controls */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={handlePrevStep}
              disabled={currentStep <= 0 && currentStep !== -1}
              className="w-8 h-8 rounded flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Previous step"
            >
              ⏮
            </button>
            {isPlaying ? (
              <button
                onClick={handlePause}
                className="w-8 h-8 rounded flex items-center justify-center text-vif-warning hover:bg-white/10 transition-all"
                title="Pause"
              >
                ⏸
              </button>
            ) : (
              <button
                onClick={handlePlay}
                className="w-8 h-8 rounded flex items-center justify-center text-vif-success hover:bg-white/10 transition-all"
                title="Play"
              >
                ▶
              </button>
            )}
            <button
              onClick={handleStep}
              className="w-8 h-8 rounded flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              title="Next step"
            >
              ⏭
            </button>
            <button
              onClick={handleReset}
              className="w-8 h-8 rounded flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              title="Reset"
            >
              ↺
            </button>
          </div>
          {/* Step indicator */}
          <div className="text-xs text-neutral-500 font-mono min-w-[60px] text-right">
            {currentStep >= 0 ? `${currentStep + 1}/${stepCount}` : `0/${stepCount}`}
          </div>
        </div>
      </div>

      {/* Timeline preview */}
      <div className="flex">
        <div className="w-[280px] border-r border-white/[0.06]">
          <TimelineOverlay sceneYaml={SAMPLE_SCENE_YAML} currentStep={currentStep} />
        </div>
        <div className="flex-1 p-6 bg-gradient-to-br from-white/[0.02] to-transparent">
          <div className="text-center text-neutral-500">
            <div className="text-4xl mb-3 opacity-30">🎬</div>
            <p className="text-sm">App preview area</p>
            <p className="text-xs mt-1 opacity-60">Timeline would appear alongside your app during recording</p>
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

  const glowColors = {
    success: 'shadow-[0_0_20px_-5px_rgba(34,197,94,0.5)]',
    error: 'shadow-[0_0_20px_-5px_rgba(239,68,68,0.5)]',
    warning: 'shadow-[0_0_20px_-5px_rgba(234,179,8,0.5)]',
    neutral: '',
  }

  const dotColors = {
    success: 'bg-vif-success',
    error: 'bg-vif-danger',
    warning: 'bg-vif-warning',
    neutral: 'bg-neutral-500',
  }

  return (
    <div className={`glass-card p-4 bg-gradient-to-br ${bgColors[status]} to-transparent ${status !== 'neutral' ? glowColors[status] : ''} transition-shadow duration-500`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Animated status dot */}
          <div className="relative">
            <div className={`w-2.5 h-2.5 rounded-full ${dotColors[status]}`} />
            {status !== 'neutral' && (
              <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${dotColors[status]} animate-ping opacity-75`} />
            )}
          </div>
          <span className={`text-sm font-medium ${statusColors[status]}`}>{icon}</span>
        </div>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${statusColors[status]}`}>{value}</p>
      <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">{label}</p>
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
