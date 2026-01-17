import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { vifClient } from '@/lib/vif-client'
import {
  Card,
  Button,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import {
  Play,
  FolderOpen,
  Download,
  Trash2,
  Video,
  HardDrive,
  Clock,
  Film,
  ArrowRight,
  Radio,
} from 'lucide-react'

export const Route = createFileRoute('/videos')({
  component: Videos,
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
  error?: string
}

function Videos() {
  const [connected, setConnected] = useState(vifClient.connected)
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    return vifClient.onConnection(setConnected)
  }, [])

  const { data: videosData, isLoading } = useQuery({
    queryKey: ['videos-list'],
    queryFn: () => vifClient.send<VideosResponse>('videos.list', {}),
    enabled: connected,
    refetchInterval: 5000,
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => vifClient.send('videos.delete', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos-list'] })
      setSelectedVideo(null)
    },
  })

  const videos = videosData?.videos || []

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
    return date.toLocaleDateString()
  }

  // Calculate total size
  const totalSize = videos.reduce((sum, v) => sum + v.size, 0)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Videos</h1>
            <p className="text-muted-foreground mt-1">Browse and preview your recorded videos</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <Badge variant="glass" className="mb-1">
                <Video className="w-3 h-3 mr-1" />
                {videos.length} video{videos.length !== 1 ? 's' : ''}
              </Badge>
              <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                <HardDrive className="w-3 h-3" />
                {formatSize(totalSize)} total
              </div>
            </div>
            {videosData?.dir && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => {
                      vifClient.send('shell.open', { path: videosData.dir })
                    }}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Open Folder
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{videosData.dir}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {!connected ? (
          <Card variant="glass" className="p-12 text-center">
            <Radio className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Connect to vif server to view videos</p>
          </Card>
        ) : isLoading ? (
          <Card variant="glass" className="p-12 text-center">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-vif-accent/30 border-t-vif-accent rounded-full animate-spin" />
            <p className="text-muted-foreground">Loading videos...</p>
          </Card>
        ) : (
          <div className="grid grid-cols-5 gap-6">
            {/* Video List */}
            <div className="col-span-2 space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-2">
              {videos.map((video) => (
                <VideoCard
                  key={video.name}
                  video={video}
                  selected={selectedVideo === video.name}
                  onSelect={() => setSelectedVideo(video.name)}
                  formatSize={formatSize}
                  formatDate={formatDate}
                />
              ))}
              {videos.length === 0 && (
                <Card variant="glass" className="p-8 text-center">
                  <Film className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">No videos yet</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Run a scene to create your first recording</p>
                </Card>
              )}
            </div>

            {/* Video Player */}
            <div className="col-span-3">
              {selectedVideo ? (
                <Card variant="glass" className="overflow-hidden sticky top-8">
                  <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Play className="w-4 h-4 text-vif-accent" />
                      <code className="text-sm font-mono text-neutral-300">{selectedVideo}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="glass"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = `http://localhost:7852/videos/${encodeURIComponent(selectedVideo)}`
                              link.download = selectedVideo
                              link.click()
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download video file</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="glass-danger"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Delete ${selectedVideo}?`)) {
                                deleteMutation.mutate(selectedVideo)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete video</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="bg-black">
                    <VideoPlayer videoName={selectedVideo} />
                  </div>
                  <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
                    {(() => {
                      const video = videos.find(v => v.name === selectedVideo)
                      if (!video) return null
                      return (
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="gap-1">
                              <HardDrive className="w-3 h-3" />
                              {formatSize(video.size)}
                            </Badge>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(video.modified)}
                            </span>
                          </div>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-vif-accent"
                            onClick={() => {
                              window.location.href = `/recordings?video=${encodeURIComponent(selectedVideo)}`
                            }}
                          >
                            Open in Post-Production
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      )
                    })()}
                  </div>
                </Card>
              ) : (
                <Card variant="glass" className="p-12 text-center sticky top-8">
                  <Film className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">Select a video to preview</p>
                  <p className="text-xs text-muted-foreground/60 mt-2">Videos are stored in ~/.vif</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function VideoCard({
  video,
  selected,
  onSelect,
  formatSize,
  formatDate,
}: {
  video: VideoFile
  selected: boolean
  onSelect: () => void
  formatSize: (bytes: number) => string
  formatDate: (iso: string) => string
}) {
  const isDraft = video.name === 'draft.mp4'
  const isFinal = video.name.includes('final')

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
      <div className="flex items-start gap-3">
        {/* Thumbnail placeholder */}
        <div className="w-16 h-10 rounded bg-neutral-800 flex items-center justify-center flex-shrink-0 border border-white/[0.06]">
          <Play className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate flex items-center gap-2">
            {video.name.replace('.mp4', '')}
            {isDraft && (
              <Badge variant="glass-warning" className="text-[10px] py-0">
                Draft
              </Badge>
            )}
            {isFinal && !isDraft && (
              <Badge variant="glass-success" className="text-[10px] py-0">
                Final
              </Badge>
            )}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatSize(video.size)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(video.modified)}
            </span>
          </div>
        </div>
      </div>
    </Card>
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
          <p className="text-xs text-muted-foreground/60 mt-1">Check if the HTTP server is running on port 7852</p>
        </div>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className="w-full aspect-video"
      controls
      autoPlay
      onError={() => setError(true)}
    >
      <source src={videoUrl} type="video/mp4" />
      Your browser does not support video playback.
    </video>
  )
}
