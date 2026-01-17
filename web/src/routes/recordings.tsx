import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { vifClient } from '@/lib/vif-client'

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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold gradient-text">Post-Production</h1>
        <p className="text-neutral-500 mt-1">Mix audio tracks and render final output</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Video Selection & Preview */}
        <div className="col-span-2 space-y-6">
          {/* Video Selector */}
          <section className="glass-card p-5">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-4">Source Video</h2>

            <div className="flex gap-3 flex-wrap">
              {videos.map((video) => (
                <button
                  key={video.name}
                  onClick={() => setSelectedVideo(video.name)}
                  className={`
                    px-4 py-2 rounded-lg text-sm transition-all
                    ${selectedVideo === video.name
                      ? 'bg-vif-accent text-white'
                      : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  {video.name.replace('.mp4', '')}
                </button>
              ))}
              {videos.length === 0 && (
                <p className="text-neutral-500 text-sm">No videos available. Record a scene first.</p>
              )}
            </div>
          </section>

          {/* Video Preview */}
          <section className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Preview</h2>
            </div>
            {selectedVideo ? (
              <div className="bg-black">
                <VideoPlayer videoName={selectedVideo} />
              </div>
            ) : (
              <div className="aspect-video flex items-center justify-center bg-neutral-900/50">
                <p className="text-neutral-500">Select a video to preview</p>
              </div>
            )}
          </section>
        </div>

        {/* Right: Audio Mixing & Export */}
        <div className="space-y-6">
          {/* Audio Mixer */}
          <section className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Audio Mixer</h2>

            <div className="space-y-4">
              <AudioChannel
                name="Narration"
                description="Voice recording via BlackHole"
                color="blue"
                value={volumes.narration}
                onChange={(v) => setVolumes(prev => ({ ...prev, narration: v }))}
              />
              <AudioChannel
                name="Music"
                description="Background music track"
                color="purple"
                value={volumes.music}
                onChange={(v) => setVolumes(prev => ({ ...prev, music: v }))}
              />
              <AudioChannel
                name="SFX"
                description="Sound effects layer"
                color="green"
                value={volumes.sfx}
                onChange={(v) => setVolumes(prev => ({ ...prev, sfx: v }))}
              />
            </div>

            <div className="pt-4 border-t border-white/[0.06]">
              <button className="w-full px-4 py-2 bg-white/5 text-neutral-400 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all">
                + Add Audio Track
              </button>
            </div>
          </section>

          {/* Export Options */}
          <section className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Export</h2>

            <div className="space-y-3">
              <ExportFormat format="MP4" codec="H.264" description="Best compatibility" selected />
              <ExportFormat format="WebM" codec="VP9" description="Smaller size, web optimized" />
              <ExportFormat format="MOV" codec="ProRes" description="Professional editing" />
            </div>

            <div className="space-y-3 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Resolution</span>
                <select className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm">
                  <option>Original</option>
                  <option>1080p</option>
                  <option>720p</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Quality</span>
                <select className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm">
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
            </div>
          </section>

          {/* Render Button */}
          <button
            onClick={handleRender}
            disabled={!selectedVideo || isRendering}
            className={`
              w-full py-4 rounded-xl text-lg font-semibold transition-all
              ${selectedVideo && !isRendering
                ? 'bg-gradient-to-r from-vif-accent to-purple-500 text-white hover:shadow-glow'
                : 'bg-white/5 text-neutral-600 cursor-not-allowed'
              }
            `}
          >
            {isRendering ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Rendering...
              </span>
            ) : (
              'Render Final Video'
            )}
          </button>
        </div>
      </div>

      {/* Recent Renders */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-4">Recent Renders</h2>
        <div className="grid grid-cols-4 gap-4">
          {videos.filter(v => v.name.includes('final')).length > 0 ? (
            videos.filter(v => v.name.includes('final')).map((video) => (
              <RenderCard key={video.name} video={video} />
            ))
          ) : (
            <div className="col-span-4 py-8 text-center text-neutral-500">
              <p>No rendered videos yet</p>
              <p className="text-sm text-neutral-600 mt-1">Select a source video and click Render to create your first final output</p>
            </div>
          )}
        </div>
      </section>
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
          <div className="text-3xl mb-2 opacity-50">⚠️</div>
          <p className="text-neutral-500">Failed to load video</p>
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
  color,
  value,
  onChange,
}: {
  name: string
  description: string
  color: 'blue' | 'purple' | 'green'
  value: number
  onChange: (value: number) => void
}) {
  const colors = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colors[color]}`} />
          <span className="text-sm font-medium">{name}</span>
        </div>
        <span className="text-xs text-neutral-500">{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-neutral-400"
      />
      <p className="text-xs text-neutral-600">{description}</p>
    </div>
  )
}

function ExportFormat({
  format,
  codec,
  description,
  selected,
}: {
  format: string
  codec: string
  description: string
  selected?: boolean
}) {
  return (
    <div className={`
      p-3 rounded-lg cursor-pointer transition-all border
      ${selected
        ? 'border-vif-accent/50 bg-vif-accent/10'
        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20'
      }
    `}>
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-sm">{format}</span>
          <span className="text-xs text-neutral-500 ml-2">({codec})</span>
        </div>
        {selected && <span className="text-vif-accent">✓</span>}
      </div>
      <p className="text-xs text-neutral-500 mt-1">{description}</p>
    </div>
  )
}

function RenderCard({ video }: { video: VideoFile }) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer">
      <div className="aspect-video bg-neutral-800 rounded mb-2 flex items-center justify-center">
        <span className="text-neutral-600">▶</span>
      </div>
      <p className="text-sm font-medium truncate">{video.name.replace('.mp4', '')}</p>
      <p className="text-xs text-neutral-500">{formatSize(video.size)}</p>
    </div>
  )
}
