import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { vifClient } from '@/lib/vif-client'

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Videos</h1>
          <p className="text-neutral-500 mt-1">Browse and preview your recorded videos</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-neutral-400">
              {videos.length} video{videos.length !== 1 ? 's' : ''}
            </div>
            <div className="text-xs text-neutral-600">
              {formatSize(totalSize)} total
            </div>
          </div>
          {videosData?.dir && (
            <button
              onClick={() => {
                // Open folder in Finder
                vifClient.send('shell.open', { path: videosData.dir })
              }}
              className="px-3 py-1.5 bg-white/5 text-neutral-400 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all"
              title={videosData.dir}
            >
              Open Folder
            </button>
          )}
        </div>
      </div>

      {!connected ? (
        <div className="glass-card p-12 text-center">
          <p className="text-neutral-400">Connect to vif server to view videos</p>
        </div>
      ) : isLoading ? (
        <div className="glass-card p-12 text-center">
          <p className="text-neutral-400">Loading videos...</p>
        </div>
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
              <div className="glass-card p-8 text-center">
                <p className="text-neutral-500">No videos yet</p>
                <p className="text-sm text-neutral-600 mt-1">Run a scene to create your first recording</p>
              </div>
            )}
          </div>

          {/* Video Player */}
          <div className="col-span-3">
            {selectedVideo ? (
              <div className="glass-card overflow-hidden sticky top-8">
                <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-vif-accent">▶</span>
                    <code className="text-sm font-mono text-neutral-300">{selectedVideo}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const link = document.createElement('a')
                        link.href = `http://localhost:7852/videos/${encodeURIComponent(selectedVideo)}`
                        link.download = selectedVideo
                        link.click()
                      }}
                      className="px-3 py-1.5 bg-white/5 text-neutral-300 rounded text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-1.5"
                    >
                      <span>↓</span> Download
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${selectedVideo}?`)) {
                          deleteMutation.mutate(selectedVideo)
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
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
                        <div className="flex items-center gap-4">
                          <span className="text-neutral-400">{formatSize(video.size)}</span>
                          <span className="text-neutral-600">•</span>
                          <span className="text-neutral-500">{formatDate(video.modified)}</span>
                        </div>
                        <button
                          onClick={() => {
                            // Navigate to post-production with this video
                            window.location.href = `/recordings?video=${encodeURIComponent(selectedVideo)}`
                          }}
                          className="text-vif-accent text-sm hover:text-vif-accent-bright transition-colors"
                        >
                          Open in Post-Production →
                        </button>
                      </div>
                    )
                  })()}
                </div>
              </div>
            ) : (
              <div className="glass-card p-12 text-center sticky top-8">
                <p className="text-neutral-500">Select a video to preview</p>
                <p className="text-xs text-neutral-600 mt-2">Videos are stored in ~/.vif</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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
      <div className="flex items-start gap-3">
        {/* Thumbnail placeholder */}
        <div className="w-16 h-10 rounded bg-neutral-800 flex items-center justify-center flex-shrink-0">
          <span className="text-neutral-600 text-lg">▶</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate flex items-center gap-2">
            {video.name.replace('.mp4', '')}
            {isDraft && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                Draft
              </span>
            )}
            {isFinal && !isDraft && (
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                Final
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
            <span>{formatSize(video.size)}</span>
            <span>•</span>
            <span>{formatDate(video.modified)}</span>
          </div>
        </div>
      </div>
    </div>
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
          <p className="text-neutral-500">Failed to load video</p>
          <p className="text-xs text-neutral-600 mt-1">Check if the HTTP server is running on port 7852</p>
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
