import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { vifClient } from '@/lib/vif-client'
import { PageLayout } from '@/components/PageLayout'
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
  Film,
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

  // Auto-select first video if none selected
  useEffect(() => {
    if (videos.length > 0 && !selectedVideo) {
      setSelectedVideo(videos[0].name)
    }
  }, [videos, selectedVideo])

  if (!connected) {
    return (
      <PageLayout mode="contained">
        <Card variant="glass" className="p-12 text-center">
          <Radio className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Connect to vif server to view videos</p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout mode="contained">
        <Card variant="glass" className="p-12 text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-vif-accent/30 border-t-vif-accent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading videos...</p>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout mode="immersive">
      <TooltipProvider delayDuration={300}>
        <div className="flex h-full">
          {/* Video list sidebar */}
          <div className="w-56 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/30 flex flex-col">
            {/* List header */}
            <div className="p-3 border-b border-zinc-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">
                  {videos.length} video{videos.length !== 1 ? 's' : ''}
                </span>
                {videosData?.dir && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => vifClient.send('shell.open', { path: videosData.dir })}
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open folder</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Video list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {videos.map((video) => {
                const isSelected = selectedVideo === video.name
                const isDraft = video.name === 'draft.mp4'
                return (
                  <button
                    key={video.name}
                    onClick={() => setSelectedVideo(video.name)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-vif-accent/20 text-white'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Play className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-vif-accent' : ''}`} />
                      <span className="truncate">{video.name.replace('.mp4', '')}</span>
                      {isDraft && (
                        <Badge variant="glass-warning" className="text-[9px] py-0 px-1 ml-auto">
                          Draft
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 pl-5">
                      {formatSize(video.size)} • {formatDate(video.modified)}
                    </div>
                  </button>
                )
              })}
              {videos.length === 0 && (
                <div className="p-4 text-center text-zinc-500 text-sm">
                  <Film className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  No videos yet
                </div>
              )}
            </div>
          </div>

          {/* Player area */}
          <div className="flex-1 flex flex-col bg-black">
            {selectedVideo ? (
              <>
                {/* Video player */}
                <div className="flex-1 flex items-center justify-center">
                  <video
                    key={selectedVideo}
                    className="max-w-full max-h-full"
                    controls
                    autoPlay
                  >
                    <source
                      src={`http://localhost:7852/videos/${encodeURIComponent(selectedVideo)}`}
                      type="video/mp4"
                    />
                  </video>
                </div>

                {/* Bottom toolbar */}
                <div className="flex-shrink-0 px-4 py-3 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <code className="text-sm font-mono text-zinc-300">{selectedVideo}</code>
                    {(() => {
                      const video = videos.find(v => v.name === selectedVideo)
                      if (!video) return null
                      return (
                        <span className="text-xs text-zinc-500">
                          {formatSize(video.size)} • {formatDate(video.modified)}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => {
                        if (confirm(`Delete ${selectedVideo}?`)) {
                          deleteMutation.mutate(selectedVideo)
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-zinc-500">
                  <Film className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>Select a video to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </TooltipProvider>
    </PageLayout>
  )
}
