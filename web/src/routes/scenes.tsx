import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { vifClient } from '@/lib/vif-client'

export const Route = createFileRoute('/scenes')({
  component: Scenes,
})

interface SceneFile {
  name: string
  path: string
  modified: string
}

interface ScenesResponse {
  ok: boolean
  scenes: SceneFile[]
  dir?: string
  error?: string
}

interface SceneContentResponse {
  ok: boolean
  content: string
}

function Scenes() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [connected, setConnected] = useState(vifClient.connected)
  const queryClient = useQueryClient()

  useEffect(() => {
    return vifClient.onConnection(setConnected)
  }, [])

  const { data: scenesData, isLoading } = useQuery({
    queryKey: ['scenes-list'],
    queryFn: () => vifClient.send<ScenesResponse>('scenes.list', { dir: 'demos/scenes' }),
    enabled: connected,
  })

  const { data: sceneContent } = useQuery({
    queryKey: ['scene-content', selectedPath],
    queryFn: () => vifClient.send<SceneContentResponse>('scenes.read', { path: `demos/scenes/${selectedPath}` }),
    enabled: connected && selectedPath !== null,
  })

  const runSceneMutation = useMutation({
    mutationFn: (path: string) => vifClient.send('scenes.run', { path: `demos/scenes/${path}` }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-status'] })
    },
  })

  const scenes = scenesData?.scenes || []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Scenes</h1>
          <p className="text-neutral-500 mt-1">Browse and run your automation scenes</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
          </span>
          <button className="glow-button px-4 py-2 bg-vif-accent text-white rounded-lg text-sm font-medium hover:shadow-glow transition-all">
            + New Scene
          </button>
        </div>
      </div>

      {/* Path indicator */}
      {scenesData?.dir && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">📁</span>
          <code className="font-mono text-neutral-400 bg-white/5 px-2 py-1 rounded">
            {scenesData.dir}
          </code>
          {scenesData.error && (
            <span className="text-vif-warning">⚠ {scenesData.error}</span>
          )}
        </div>
      )}

      {!connected ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-4 opacity-50">📡</div>
          <p className="text-neutral-400">Connect to vif agent to view scenes</p>
        </div>
      ) : isLoading ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p className="text-neutral-400">Loading scenes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          {/* Scene List */}
          <div className="col-span-2 space-y-3">
            {scenes.map((scene) => (
              <SceneCard
                key={scene.path}
                scene={scene}
                selected={selectedPath === scene.path}
                onSelect={() => setSelectedPath(scene.path)}
                onRun={() => runSceneMutation.mutate(scene.path)}
                isRunning={runSceneMutation.isPending}
              />
            ))}
            {scenes.length === 0 && (
              <div className="glass-card p-8 text-center">
                <div className="text-3xl mb-3 opacity-50">🎬</div>
                <p className="text-neutral-500">No scenes found</p>
                <p className="text-sm text-neutral-600 mt-1">Create a scene to get started</p>
              </div>
            )}
          </div>

          {/* Scene Preview */}
          <div className="col-span-3">
            {selectedPath ? (
              <div className="glass-card overflow-hidden sticky top-8">
                <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                  <code className="text-sm font-mono text-neutral-300">{selectedPath}</code>
                  <button
                    onClick={() => runSceneMutation.mutate(selectedPath)}
                    disabled={runSceneMutation.isPending}
                    className="px-3 py-1.5 bg-vif-accent text-white rounded text-sm font-medium hover:bg-vif-accent-bright transition-colors disabled:opacity-50"
                  >
                    ▶ Run
                  </button>
                </div>
                <pre className="p-4 text-sm font-mono text-neutral-300 overflow-auto max-h-[70vh] leading-relaxed">
                  {sceneContent?.content || 'Loading...'}
                </pre>
              </div>
            ) : (
              <div className="glass-card p-12 text-center sticky top-8">
                <div className="text-4xl mb-4 opacity-30">👈</div>
                <p className="text-neutral-500">Select a scene to preview</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SceneCard({
  scene,
  selected,
  onSelect,
  onRun,
  isRunning,
}: {
  scene: SceneFile
  selected: boolean
  onSelect: () => void
  onRun: () => void
  isRunning: boolean
}) {
  const modified = new Date(scene.modified)
  const timeAgo = getTimeAgo(modified)

  return (
    <div
      onClick={onSelect}
      className={`
        glass-card p-4 cursor-pointer transition-all duration-200
        ${selected
          ? 'border-vif-accent/50 shadow-glow-sm bg-gradient-to-br from-vif-accent/10 to-transparent'
          : 'hover:border-white/20 hover:bg-white/[0.02]'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate flex items-center gap-2">
            <span className="text-vif-accent opacity-60">▶</span>
            {scene.name.replace('.yaml', '')}
          </h3>
          <p className="text-sm text-neutral-500 mt-1">{timeAgo}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          disabled={isRunning}
          className={`
            ml-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
            ${isRunning
              ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
              : 'bg-vif-accent/20 text-vif-accent border border-vif-accent/30 hover:bg-vif-accent/30'
            }
          `}
        >
          {isRunning ? '...' : 'Run'}
        </button>
      </div>
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}
