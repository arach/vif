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
      // Refetch status to show running scene
      queryClient.invalidateQueries({ queryKey: ['server-status'] })
    },
  })

  const scenes = scenesData?.scenes || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scenes</h1>
        <span className="text-sm text-neutral-400">
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Show path being searched */}
      {scenesData?.dir && (
        <div className="text-sm text-neutral-500 font-mono bg-neutral-900 rounded px-3 py-2">
          {scenesData.dir}
          {scenesData.error && (
            <span className="text-yellow-500 ml-2">({scenesData.error})</span>
          )}
        </div>
      )}

      {!connected ? (
        <div className="text-center py-12 text-neutral-400">
          <p>Connect to vif agent to view scenes</p>
        </div>
      ) : isLoading ? (
        <div className="text-neutral-400">Loading scenes...</div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* Scene List */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">
              Available Scenes
            </h2>
            <div className="space-y-2">
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
            </div>
            {scenes.length === 0 && (
              <div className="text-center py-8 text-neutral-500">
                <p>No scenes found in demos/scenes/</p>
              </div>
            )}
          </div>

          {/* Scene Preview */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">
              Preview
            </h2>
            {selectedPath ? (
              <div className="bg-vif-surface border border-vif-border rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-vif-border bg-neutral-900/50">
                  <span className="text-sm font-mono text-neutral-300">{selectedPath}</span>
                </div>
                <pre className="p-4 text-sm font-mono text-neutral-300 overflow-auto max-h-[600px]">
                  {sceneContent?.content || 'Loading...'}
                </pre>
              </div>
            ) : (
              <div className="bg-vif-surface border border-vif-border rounded-lg p-8 text-center text-neutral-500">
                Select a scene to preview
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
        bg-vif-surface border rounded-lg p-4 cursor-pointer transition-all
        ${selected ? 'border-vif-accent ring-1 ring-vif-accent/50' : 'border-vif-border hover:border-neutral-600'}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate">{scene.name}</h3>
          <p className="text-sm text-neutral-500">{timeAgo}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          disabled={isRunning}
          className={`
            ml-3 px-3 py-1.5 rounded text-sm font-medium transition-colors
            ${isRunning
              ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
              : 'bg-vif-accent text-white hover:bg-blue-600'
            }
          `}
        >
          {isRunning ? 'Starting...' : 'Run'}
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
