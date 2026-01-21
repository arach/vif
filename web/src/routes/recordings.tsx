import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { vifClient } from '@/lib/vif-client'
import { PageLayout } from '@/components/PageLayout'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import {
  Play,
  Plus,
  Film,
  Video,
  Music,
  Volume2,
  Wand2,
  Check,
  Mic,
  Sparkles,
  HardDrive,
  Radio,
} from 'lucide-react'

export const Route = createFileRoute('/recordings')({
  component: PostProduction,
  validateSearch: (search: Record<string, unknown>) => ({
    video: (search.video as string) || null,
  }),
})

interface VideoFile {
  name: string
  size: number
  modified: string
}

interface VideosResponse {
  ok: boolean
  videos: VideoFile[]
  dir?: string
}

function PostProduction() {
  const { video: initialVideo } = useSearch({ from: '/recordings' })
  const [connected, setConnected] = useState(vifClient.connected)
  const [selectedVideo, setSelectedVideo] = useState<string | null>(initialVideo)
  const [isRendering, setIsRendering] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState('mp4')

  // Audio channel volumes
  const [volumes, setVolumes] = useState({
    narration: 80,
    music: 60,
    sfx: 70,
  })

  useEffect(() => {
    return vifClient.onConnection(setConnected)
  }, [])

  const { data: videosData } = useQuery({
    queryKey: ['videos-list'],
    queryFn: () => vifClient.send<VideosResponse>('videos.list', {}),
    enabled: connected,
  })

  const videos = videosData?.videos || []

  const handleRender = async () => {
    if (!selectedVideo) return

    setIsRendering(true)
    try {
      // TODO: Implement actual render with audio mixing
      await new Promise(resolve => setTimeout(resolve, 2000))
      alert('Render complete! (Demo)')
    } finally {
      setIsRendering(false)
    }
  }

  return (
    <PageLayout mode="full">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold gradient-text">Post-Production</h1>
          <p className="text-muted-foreground mt-1">Mix audio tracks and render final output</p>
        </div>

      {!connected ? (
        <Card variant="glass" className="p-12 text-center">
          <Radio className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Connect to vif server to edit recordings</p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Video Selection & Preview */}
          <div className="col-span-2 space-y-6">
            {/* Video Selector */}
            <Card variant="glass">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  Source Video
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2 flex-wrap">
                  {videos.map((video) => (
                    <Button
                      key={video.name}
                      variant={selectedVideo === video.name ? "glass-primary" : "glass"}
                      size="sm"
                      onClick={() => setSelectedVideo(video.name)}
                    >
                      {video.name.replace('.mp4', '')}
                    </Button>
                  ))}
                  {videos.length === 0 && (
                    <p className="text-muted-foreground text-sm">No videos available. Record a scene first.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Video Preview */}
            <Card variant="glass" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center gap-2">
                <Play className="w-4 h-4 text-vif-accent" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Preview</h2>
              </div>
              {selectedVideo ? (
                <div className="bg-black">
                  <VideoPlayer videoName={selectedVideo} />
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center bg-neutral-900/50">
                  <div className="text-center">
                    <Video className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="text-muted-foreground">Select a video to preview</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Right: Audio Mixing & Export */}
          <div className="space-y-6">
            {/* Audio Mixer */}
            <Card variant="glass">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Audio Mixer
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <AudioChannel
                  name="Narration"
                  description="Voice recording via BlackHole"
                  icon={<Mic className="w-4 h-4" />}
                  color="blue"
                  value={volumes.narration}
                  onChange={(v) => setVolumes(prev => ({ ...prev, narration: v }))}
                />
                <AudioChannel
                  name="Music"
                  description="Background music track"
                  icon={<Music className="w-4 h-4" />}
                  color="purple"
                  value={volumes.music}
                  onChange={(v) => setVolumes(prev => ({ ...prev, music: v }))}
                />
                <AudioChannel
                  name="SFX"
                  description="Sound effects layer"
                  icon={<Sparkles className="w-4 h-4" />}
                  color="green"
                  value={volumes.sfx}
                  onChange={(v) => setVolumes(prev => ({ ...prev, sfx: v }))}
                />

                <div className="pt-4 border-t border-white/[0.06]">
                  <Button variant="glass" className="w-full" disabled>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Audio Track
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Export Options */}
            <Card variant="glass">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Export
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <ExportFormat
                  format="MP4"
                  codec="H.264"
                  description="Best compatibility"
                  selected={selectedFormat === 'mp4'}
                  onClick={() => setSelectedFormat('mp4')}
                />
                <ExportFormat
                  format="WebM"
                  codec="VP9"
                  description="Smaller size, web optimized"
                  selected={selectedFormat === 'webm'}
                  onClick={() => setSelectedFormat('webm')}
                />
                <ExportFormat
                  format="MOV"
                  codec="ProRes"
                  description="Professional editing"
                  selected={selectedFormat === 'mov'}
                  onClick={() => setSelectedFormat('mov')}
                />

                <div className="space-y-3 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Resolution</span>
                    <Select defaultValue="original">
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">Original</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Quality</span>
                    <Select defaultValue="high">
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Render Button */}
            <Button
              variant={selectedVideo && !isRendering ? "default" : "glass"}
              size="xl"
              className="w-full"
              onClick={handleRender}
              disabled={!selectedVideo || isRendering}
            >
              {isRendering ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Rendering...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Render Final Video
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Recent Renders */}
      <Card variant="glass">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Film className="w-4 h-4" />
            Recent Renders
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-4 gap-4">
            {videos.filter(v => v.name.includes('final')).length > 0 ? (
              videos.filter(v => v.name.includes('final')).map((video) => (
                <RenderCard key={video.name} video={video} />
              ))
            ) : (
              <div className="col-span-4 py-8 text-center">
                <Film className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No rendered videos yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Select a source video and click Render to create your first final output</p>
              </div>
            )}
          </div>
        </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

function VideoPlayer({ videoName }: { videoName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [videoName])

  const videoUrl = `http://localhost:7852/videos/${encodeURIComponent(videoName)}`

  if (error) {
    return (
      <div className="aspect-video flex items-center justify-center bg-neutral-900">
        <div className="text-center">
          <Video className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Failed to load video</p>
        </div>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className="w-full aspect-video"
      controls
      onError={() => setError(true)}
    >
      <source src={videoUrl} type="video/mp4" />
    </video>
  )
}

function AudioChannel({
  name,
  description,
  icon,
  color,
  value,
  onChange,
}: {
  name: string
  description: string
  icon: React.ReactNode
  color: 'blue' | 'purple' | 'green'
  value: number
  onChange: (value: number) => void
}) {
  const colors = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
  }

  const trackColors = {
    blue: 'accent-blue-500',
    purple: 'accent-purple-500',
    green: 'accent-green-500',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded flex items-center justify-center ${colors[color]}/20 text-${color}-400`}>
            {icon}
          </div>
          <span className="text-sm font-medium">{name}</span>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {value}%
        </Badge>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className={`w-full ${trackColors[color]}`}
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function ExportFormat({
  format,
  codec,
  description,
  selected,
  onClick,
}: {
  format: string
  codec: string
  description: string
  selected?: boolean
  onClick: () => void
}) {
  return (
    <Card
      variant={selected ? "glass" : "glass-interactive"}
      className={`p-3 cursor-pointer ${selected ? 'border-vif-accent/50 bg-vif-accent/10' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-sm">{format}</span>
          <Badge variant="secondary" className="ml-2 text-[10px]">{codec}</Badge>
        </div>
        {selected && <Check className="w-4 h-4 text-vif-accent" />}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </Card>
  )
}

function RenderCard({ video }: { video: VideoFile }) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card variant="glass-interactive" className="p-3">
      <div className="aspect-video bg-neutral-800 rounded mb-2 flex items-center justify-center border border-white/[0.06]">
        <Play className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium truncate">{video.name.replace('.mp4', '')}</p>
      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
        <HardDrive className="w-3 h-3" />
        {formatSize(video.size)}
      </p>
    </Card>
  )
}
