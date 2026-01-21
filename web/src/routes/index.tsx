import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { vifClient } from '@/lib/vif-client'
import { useEffect, useState, useRef } from 'react'
import { TimelineOverlay } from '@/components/TimelineOverlay'
import { PageLayout } from '@/components/PageLayout'
import { Button, TooltipProvider } from '@/components/ui'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Layers,
  Monitor,
  Film,
  ChevronDown,
  ChevronRight,
  FileText,
  Volume2,
  Video,
} from 'lucide-react'

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

  const [showControls, setShowControls] = useState(false)

  return (
    <PageLayout mode="contained">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          {/* Compact Header with Status */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">vif</h1>
            <p className="text-xs text-zinc-500">Declarative demo automation</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={connected ? 'success' : 'error'} label={connected ? 'Online' : 'Offline'} />
            {status?.agent && <StatusPill status="success" label="Agent" />}
            {status?.scene && <StatusPill status="warning" label="Recording" />}
          </div>
        </div>

        {/* Quick Actions - Launchpad Style */}
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            to="/scenes"
            icon={<FileText className="w-5 h-5" />}
            label="Scenes"
            description="Create and edit YAML scenes"
            color="accent"
          />
          <QuickAction
            to="/sounds"
            icon={<Volume2 className="w-5 h-5" />}
            label="Sound Effects"
            description="Browse CC0 SFX library"
            color="purple"
          />
          <QuickAction
            to="/videos"
            icon={<Video className="w-5 h-5" />}
            label="Video Library"
            description="Manage video assets"
            color="blue"
          />
        </div>

        {/* Server Info - Minimal */}
        {connected && (
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-md text-xs">
            <span className="text-zinc-500 font-mono truncate max-w-md">{status?.cwd || '...'}</span>
            <div className="flex gap-1">
              <button
                onClick={() => confirm('Restart?') && vifClient.send('restart')}
                className="px-2 py-1 text-zinc-400 hover:text-vif-warning hover:bg-vif-warning/10 rounded transition-colors"
              >
                Restart
              </button>
              <button
                onClick={() => confirm('Quit?') && vifClient.send('quit')}
                className="px-2 py-1 text-zinc-400 hover:text-vif-danger hover:bg-vif-danger/10 rounded transition-colors"
              >
                Quit
              </button>
            </div>
          </div>
        )}

        {/* Running Scene Banner */}
        {status?.scene && (
          <div className="flex items-center gap-3 px-4 py-3 bg-vif-warning/5 border border-vif-warning/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-vif-warning animate-pulse" />
            <div className="flex-1">
              <span className="text-sm font-medium text-vif-warning">{status.scene.name}</span>
              <span className="text-xs text-zinc-500 ml-2">{formatUptime(Date.now() - status.scene.startTime)}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => vifClient.send('scene.stop', {})}>
              Stop
            </Button>
          </div>
        )}

        {/* Collapsible Stage Controls */}
        <div className="border border-zinc-800/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowControls(!showControls)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>Stage Controls</span>
            </div>
            {showControls ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {showControls && (
            <div className="border-t border-zinc-800/50 bg-zinc-900/30">
              {/* Control buttons */}
              <div className="px-4 py-3 grid grid-cols-4 gap-4">
                <ControlGroup title="Cursor">
                  <MiniButton onClick={() => vifClient.send('cursor.show', {})} label="Show" />
                  <MiniButton onClick={() => vifClient.send('cursor.hide', {})} label="Hide" />
                </ControlGroup>
                <ControlGroup title="Backdrop">
                  <MiniButton onClick={() => vifClient.send('backdrop.show', {})} label="Show" />
                  <MiniButton onClick={() => vifClient.send('backdrop.hide', {})} label="Hide" />
                </ControlGroup>
                <ControlGroup title="Recording">
                  <MiniButton onClick={() => vifClient.send('record.start', { mode: 'draft' })} label="Start" variant="primary" />
                  <MiniButton onClick={() => vifClient.send('record.stop', {})} label="Stop" variant="danger" />
                </ControlGroup>
                <ControlGroup title="Stage">
                  <MiniButton onClick={() => vifClient.send('stage.clear', {})} label="Clear" className="col-span-2" />
                </ControlGroup>
              </div>

              {/* Timeline Preview */}
              <div className="border-t border-zinc-800/50">
                <TimelinePreview />
              </div>
            </div>
          )}
        </div>
        </div>
      </TooltipProvider>
    </PageLayout>
  )
}

function TimelinePreview() {
  const [currentStep, setCurrentStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [stepCount, setStepCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const matches = SAMPLE_SCENE_YAML.match(/^\s+-\s/gm)
    setStepCount(matches?.length || 0)
  }, [])

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= stepCount - 1) {
            setIsPlaying(false)
            return -1
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
    <div>
      {/* Header with controls */}
      <div className="px-4 py-2 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-vif-accent" />
          <span className="text-xs font-medium text-zinc-400">Timeline Preview</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Playback controls */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handlePrevStep}
              disabled={currentStep <= 0 && currentStep !== -1}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-30"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            {isPlaying ? (
              <button onClick={handlePause} className="p-1.5 text-vif-warning hover:bg-zinc-800 rounded transition-colors">
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={handlePlay} className="p-1.5 text-vif-success hover:bg-zinc-800 rounded transition-colors">
                <Play className="w-3.5 h-3.5" />
              </button>
            )}

            <button onClick={handleStep} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors">
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button onClick={handleReset} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Step indicator */}
          <span className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 bg-zinc-800 rounded">
            {currentStep >= 0 ? `${currentStep + 1}/${stepCount}` : `0/${stepCount}`}
          </span>
        </div>
      </div>

      {/* Timeline preview */}
      <div className="flex">
        <div className="w-[240px] border-r border-zinc-800/50">
          <TimelineOverlay sceneYaml={SAMPLE_SCENE_YAML} currentStep={currentStep} />
        </div>
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="text-center text-zinc-600">
            <Monitor className="w-6 h-6 mx-auto mb-1 opacity-40" />
            <p className="text-xs">App preview</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact components for the launchpad design

function StatusPill({ status, label }: { status: 'success' | 'error' | 'warning' | 'neutral'; label: string }) {
  const colors = {
    success: 'bg-vif-success/10 text-vif-success border-vif-success/20',
    error: 'bg-vif-danger/10 text-vif-danger border-vif-danger/20',
    warning: 'bg-vif-warning/10 text-vif-warning border-vif-warning/20',
    neutral: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  }
  const dotColors = {
    success: 'bg-vif-success',
    error: 'bg-vif-danger',
    warning: 'bg-vif-warning',
    neutral: 'bg-zinc-500',
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-medium ${colors[status]}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${dotColors[status]}`} />
      {label}
    </div>
  )
}

function QuickAction({
  to,
  icon,
  label,
  description,
  color,
}: {
  to: string
  icon: React.ReactNode
  label: string
  description: string
  color: 'accent' | 'purple' | 'blue' | 'green'
}) {
  const colorClasses = {
    accent: 'text-vif-accent group-hover:bg-vif-accent/10',
    purple: 'text-purple-400 group-hover:bg-purple-500/10',
    blue: 'text-blue-400 group-hover:bg-blue-500/10',
    green: 'text-vif-success group-hover:bg-vif-success/10',
  }

  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${colorClasses[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
    </Link>
  )
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-1">
        {children}
      </div>
    </div>
  )
}

function MiniButton({
  onClick,
  label,
  variant = 'default',
  className = '',
}: {
  onClick: () => void
  label: string
  variant?: 'default' | 'primary' | 'danger'
  className?: string
}) {
  const variants = {
    default: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300',
    primary: 'bg-vif-accent/20 hover:bg-vif-accent/30 text-vif-accent-bright',
    danger: 'bg-vif-danger/20 hover:bg-vif-danger/30 text-red-400',
  }

  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 text-[11px] rounded transition-colors ${variants[variant]} ${className}`}
    >
      {label}
    </button>
  )
}
