import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { vifClient } from '@/lib/vif-client'
import { Timeline } from '@/components/Timeline'
import { TimelineOverlay } from '@/components/TimelineOverlay'
import { SceneDiff } from '@/components/SceneDiff'
import { SceneEditor } from '@/components/SceneEditor'

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

type ViewMode = 'timeline' | 'yaml' | 'live' | 'diff'

// Demo: sample "before" content for diff demonstration
const DEMO_OLD_YAML = `scene:
  name: Demo Scene
  mode: draft

sequence:
  - label: teleprompter
    text: "Welcome to the demo"
  - wait: 1s
  - cursor.show: {}
  - click: sidebar.home
  - wait: 500ms
`

function Scenes() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [connected, setConnected] = useState(vifClient.connected)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [liveYaml, setLiveYaml] = useState<string>('')
  const [liveStep, setLiveStep] = useState(-1)
  const [isSceneRunning, setIsSceneRunning] = useState(false)
  const [previousContent, setPreviousContent] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const subscribedRef = useRef(false)

  useEffect(() => {
    return vifClient.onConnection(setConnected)
  }, [])

  // Subscribe to timeline events
  useEffect(() => {
    if (!connected || subscribedRef.current) return

    subscribedRef.current = true
    vifClient.send('timeline.subscribe', {}).catch(console.error)

    const unsub = vifClient.onMessage((event) => {
      if (event.event === 'timeline.scene') {
        setLiveYaml(event.yaml as string)
        setLiveStep(-1)
        setIsSceneRunning(true)
        setViewMode('live') // Auto-switch to live view
      } else if (event.event === 'timeline.step') {
        setLiveStep(event.index as number)
      } else if (event.event === 'timeline.complete') {
        setIsSceneRunning(false)
        // Keep showing the completed state
      }
    })

    return () => {
      unsub()
      subscribedRef.current = false
    }
  }, [connected])

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
          <button
            className="px-4 py-2 bg-white/5 text-neutral-500 rounded-lg text-sm font-medium border border-white/10 cursor-not-allowed"
            title="Coming soon"
            disabled
          >
            + New Scene
          </button>
        </div>
      </div>

      {/* Path indicator */}
      {scenesData?.dir && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500 text-xs font-mono">DIR</span>
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
                    <p className="text-neutral-400">Connect to vif agent to view scenes</p>
        </div>
      ) : isLoading ? (
        <div className="glass-card p-12 text-center">
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
                  <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <div className="flex bg-white/5 rounded-lg p-0.5">
                      <button
                        onClick={() => setViewMode('timeline')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                          viewMode === 'timeline'
                            ? 'bg-vif-accent text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Timeline
                      </button>
                      <button
                        onClick={() => setViewMode('yaml')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                          viewMode === 'yaml'
                            ? 'bg-vif-accent text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        YAML
                      </button>
                      <button
                        onClick={() => {
                          // For demo, use the demo old yaml
                          if (!previousContent && sceneContent?.content) {
                            setPreviousContent(DEMO_OLD_YAML)
                          }
                          setViewMode('diff')
                        }}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                          viewMode === 'diff'
                            ? 'bg-purple-500 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Diff
                      </button>
                      <button
                        onClick={() => setViewMode('live')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                          viewMode === 'live'
                            ? 'bg-vif-danger text-white'
                            : isSceneRunning
                              ? 'text-vif-danger hover:text-white'
                              : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {isSceneRunning && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                        Live
                      </button>
                    </div>
                    <button
                      onClick={() => runSceneMutation.mutate(selectedPath)}
                      disabled={runSceneMutation.isPending || isSceneRunning}
                      className="px-3 py-1.5 bg-vif-accent text-white rounded text-sm font-medium hover:bg-vif-accent-bright transition-colors disabled:opacity-50"
                    >
                      {isSceneRunning ? '● Running' : '▶ Run'}
                    </button>
                  </div>
                </div>
                <div className="overflow-auto max-h-[70vh]">
                  {viewMode === 'live' ? (
                    liveYaml ? (
                      <TimelineOverlay sceneYaml={liveYaml} currentStep={liveStep} />
                    ) : (
                      <div className="p-8 text-center">
                                                <p className="text-neutral-500">Run a scene to see live timeline</p>
                        <p className="text-xs text-neutral-600 mt-2">The timeline will appear here when a scene starts</p>
                      </div>
                    )
                  ) : viewMode === 'diff' ? (
                    sceneContent?.content && previousContent ? (
                      <div className="p-4">
                        <SceneDiff
                          oldYaml={previousContent}
                          newYaml={sceneContent.content}
                          sceneName={selectedPath || 'scene.yaml'}
                          onAccept={(newYaml) => {
                            // TODO: Save the accepted changes
                            console.log('Accepted:', newYaml)
                            setPreviousContent(null)
                            setViewMode('timeline')
                          }}
                          onReject={() => {
                            // TODO: Revert to previous
                            console.log('Rejected changes')
                            setPreviousContent(null)
                            setViewMode('yaml')
                          }}
                        />
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                                                <p className="text-neutral-500">No changes to review</p>
                        <p className="text-xs text-neutral-600 mt-2">
                          When an agent modifies this scene, the diff will appear here
                        </p>
                      </div>
                    )
                  ) : viewMode === 'timeline' ? (
                    sceneContent?.content ? (
                      <Timeline content={sceneContent.content} />
                    ) : (
                      <div className="p-6 text-center text-neutral-500">Loading...</div>
                    )
                  ) : (
                    sceneContent?.content ? (
                      <SceneEditor
                        content={sceneContent.content}
                        filename={selectedPath || 'scene.yaml'}
                        showValidation={true}
                      />
                    ) : (
                      <div className="p-6 text-center text-neutral-500">Loading...</div>
                    )
                  )}
                </div>
              </div>
            ) : isSceneRunning || liveYaml ? (
              <div className="glass-card overflow-hidden sticky top-8">
                <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-vif-danger animate-pulse" />
                    <span className="text-sm font-medium text-white">Live Preview</span>
                  </div>
                </div>
                <div className="overflow-auto max-h-[70vh]">
                  <TimelineOverlay sceneYaml={liveYaml} currentStep={liveStep} />
                </div>
              </div>
            ) : (
              <div className="glass-card p-12 text-center sticky top-8">
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
