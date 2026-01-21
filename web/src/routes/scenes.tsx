import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { vifClient } from '@/lib/vif-client'
import { PageLayout } from '@/components/PageLayout'
import { Timeline } from '@/components/Timeline'
import { TimelineOverlay } from '@/components/TimelineOverlay'
import { SceneDiff } from '@/components/SceneDiff'
import { SceneEditor } from '@/components/SceneEditor'
import {
  Card,
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import {
  Play,
  Plus,
  FileCode,
  Clock,
  FolderOpen,
  AlertTriangle,
  Radio,
  GitCompare,
  List,
  Code,
} from 'lucide-react'

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
    <PageLayout mode="full">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Scenes</h1>
          <p className="text-muted-foreground mt-1">Browse and run your automation scenes</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="glass">
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
          </Badge>
          <Button variant="glass" size="sm" disabled title="Coming soon">
            <Plus className="w-4 h-4 mr-2" />
            New Scene
          </Button>
        </div>
      </div>

      {/* Path indicator */}
      {scenesData?.dir && (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="gap-1">
            <FolderOpen className="w-3 h-3" />
            DIR
          </Badge>
          <code className="font-mono text-muted-foreground bg-white/[0.04] px-2 py-1 rounded border border-white/[0.06]">
            {scenesData.dir}
          </code>
          {scenesData.error && (
            <Badge variant="glass-warning" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              {scenesData.error}
            </Badge>
          )}
        </div>
      )}

      {!connected ? (
        <Card variant="glass" className="p-12 text-center">
          <Radio className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Connect to vif agent to view scenes</p>
        </Card>
      ) : isLoading ? (
        <Card variant="glass" className="p-12 text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-vif-accent/30 border-t-vif-accent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading scenes...</p>
        </Card>
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
              <Card variant="glass" className="p-8 text-center">
                <FileCode className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No scenes found</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Create a scene to get started</p>
              </Card>
            )}
          </div>

          {/* Scene Preview */}
          <div className="col-span-3">
            {selectedPath ? (
              <Card variant="glass" className="overflow-hidden sticky top-8">
                <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                  <code className="text-sm font-mono text-neutral-300">{selectedPath}</code>
                  <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <Tabs value={viewMode} onValueChange={(v) => {
                      if (v === 'diff' && !previousContent && sceneContent?.content) {
                        setPreviousContent(DEMO_OLD_YAML)
                      }
                      setViewMode(v as ViewMode)
                    }}>
                      <TabsList>
                        <TabsTrigger value="timeline" className="gap-1.5">
                          <List className="w-3 h-3" />
                          Timeline
                        </TabsTrigger>
                        <TabsTrigger value="yaml" className="gap-1.5">
                          <Code className="w-3 h-3" />
                          YAML
                        </TabsTrigger>
                        <TabsTrigger value="diff" className="gap-1.5">
                          <GitCompare className="w-3 h-3" />
                          Diff
                        </TabsTrigger>
                        <TabsTrigger value="live" className="gap-1.5">
                          {isSceneRunning && <span className="w-1.5 h-1.5 rounded-full bg-vif-danger animate-pulse" />}
                          <Radio className="w-3 h-3" />
                          Live
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Button
                      variant={isSceneRunning ? "outline" : "glass-primary"}
                      size="sm"
                      onClick={() => runSceneMutation.mutate(selectedPath)}
                      disabled={runSceneMutation.isPending || isSceneRunning}
                    >
                      {isSceneRunning ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-vif-danger animate-pulse mr-2" />
                          Running
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Run
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="overflow-auto max-h-[70vh]">
                  {viewMode === 'live' ? (
                    liveYaml ? (
                      <TimelineOverlay sceneYaml={liveYaml} currentStep={liveStep} />
                    ) : (
                      <div className="p-8 text-center">
                        <Radio className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                        <p className="text-muted-foreground">Run a scene to see live timeline</p>
                        <p className="text-xs text-muted-foreground/60 mt-2">The timeline will appear here when a scene starts</p>
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
                            console.log('Accepted:', newYaml)
                            setPreviousContent(null)
                            setViewMode('timeline')
                          }}
                          onReject={() => {
                            console.log('Rejected changes')
                            setPreviousContent(null)
                            setViewMode('yaml')
                          }}
                        />
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <GitCompare className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                        <p className="text-muted-foreground">No changes to review</p>
                        <p className="text-xs text-muted-foreground/60 mt-2">
                          When an agent modifies this scene, the diff will appear here
                        </p>
                      </div>
                    )
                  ) : viewMode === 'timeline' ? (
                    sceneContent?.content ? (
                      <Timeline content={sceneContent.content} />
                    ) : (
                      <div className="p-6 text-center text-muted-foreground">Loading...</div>
                    )
                  ) : (
                    sceneContent?.content ? (
                      <SceneEditor
                        content={sceneContent.content}
                        filename={selectedPath || 'scene.yaml'}
                        showValidation={true}
                      />
                    ) : (
                      <div className="p-6 text-center text-muted-foreground">Loading...</div>
                    )
                  )}
                </div>
              </Card>
            ) : isSceneRunning || liveYaml ? (
              <Card variant="glass" className="overflow-hidden sticky top-8">
                <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-vif-danger animate-pulse" />
                    <span className="text-sm font-medium text-white">Live Preview</span>
                  </div>
                </div>
                <div className="overflow-auto max-h-[70vh]">
                  <TimelineOverlay sceneYaml={liveYaml} currentStep={liveStep} />
                </div>
              </Card>
            ) : (
              <Card variant="glass" className="p-12 text-center sticky top-8">
                <FileCode className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">Select a scene to preview</p>
              </Card>
            )}
          </div>
        </div>
        )}
      </div>
    </PageLayout>
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
    <Card
      variant={selected ? "glass" : "glass-interactive"}
      onClick={onSelect}
      className={`p-4 cursor-pointer ${
        selected
          ? 'border-vif-accent/50 shadow-glow-sm bg-gradient-to-br from-vif-accent/10 to-transparent'
          : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate flex items-center gap-2">
            <Play className="w-4 h-4 text-vif-accent opacity-60" />
            {scene.name.replace('.yaml', '')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo}
          </p>
        </div>
        <Button
          variant="glass-primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          disabled={isRunning}
        >
          {isRunning ? '...' : 'Run'}
        </Button>
      </div>
    </Card>
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
