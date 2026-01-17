import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { vifClient } from '@/lib/vif-client'

export const Route = createFileRoute('/sounds')({
  component: Sounds,
})

interface Sound {
  name: string
  path: string
  size: number
}

interface SfxCategory {
  name: string
  sounds: Sound[]
}

interface SfxResponse {
  ok: boolean
  categories: SfxCategory[]
  dir?: string
  error?: string
}

function Sounds() {
  const [connected, setConnected] = useState(vifClient.connected)
  const [playingSound, setPlayingSound] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return vifClient.onConnection(setConnected)
  }, [])

  const queryClient = useQueryClient()

  const { data: sfxData, isLoading } = useQuery({
    queryKey: ['sfx-list'],
    queryFn: () => vifClient.send<SfxResponse>('sfx.list', {}),
    enabled: connected,
  })

  const deleteMutation = useMutation({
    mutationFn: (path: string) => vifClient.send('sfx.delete', { path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sfx-list'] })
    },
  })

  const deleteSound = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (playingSound === path) {
      audioRef.current?.pause()
      setPlayingSound(null)
    }
    deleteMutation.mutate(path)
  }

  const categories = sfxData?.categories || []
  const totalSounds = categories.reduce((sum, cat) => sum + cat.sounds.length, 0)

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedCategories(new Set(categories.map(c => c.name)))
  }

  const collapseAll = () => {
    setExpandedCategories(new Set())
  }

  const playSound = (path: string) => {
    // Stop current sound
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (playingSound === path) {
      setPlayingSound(null)
      return
    }

    // Play new sound via HTTP endpoint
    const audio = new Audio(`http://localhost:7852/sfx/${path}`)
    audio.onended = () => setPlayingSound(null)
    audio.onerror = () => setPlayingSound(null)
    audio.play()
    audioRef.current = audio
    setPlayingSound(path)
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(`assets/sfx/${path}`)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const getCategoryIcon = (name: string) => {
    const icons: Record<string, string> = {
      clicks: 'click',
      typing: 'type',
      chimes: 'chime',
      transitions: 'trans',
      shutter: 'snap',
      errors: 'err',
    }
    return icons[name] || 'sfx'
  }

  const getCategoryDescription = (name: string) => {
    const descriptions: Record<string, string> = {
      clicks: 'Button clicks, mouse clicks, UI selections',
      typing: 'Keyboard sounds, key presses, mechanical switches',
      chimes: 'Success, confirmation, completion sounds',
      transitions: 'Whoosh, open/close, zoom effects',
      shutter: 'Camera capture, screenshot, snap sounds',
      errors: 'Error alerts, warnings, cancel sounds',
    }
    return descriptions[name] || ''
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Sound Effects</h1>
          <p className="text-neutral-500 mt-1">CC0 licensed sounds for your scenes</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            {totalSounds} sound{totalSounds !== 1 ? 's' : ''} in {categories.length} categories
          </span>
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {!connected ? (
        <div className="glass-card p-12 text-center">
          <p className="text-neutral-400">Connect to vif agent to browse sounds</p>
        </div>
      ) : isLoading ? (
        <div className="glass-card p-12 text-center">
          <p className="text-neutral-400">Loading sounds...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category.name} className="glass-card overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-neutral-400">{getCategoryIcon(category.name)}</span>
                  <div className="text-left">
                    <h2 className="font-medium capitalize">{category.name}</h2>
                    <p className="text-xs text-neutral-500">{getCategoryDescription(category.name)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-500">
                    {category.sounds.length} sounds
                  </span>
                  <span className={`text-neutral-400 transition-transform ${expandedCategories.has(category.name) ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </div>
              </button>

              {/* Sounds List */}
              {expandedCategories.has(category.name) && (
                <div className="border-t border-white/[0.06]">
                  {category.sounds.map((sound) => (
                    <div
                      key={sound.path}
                      className="px-4 py-2 flex items-center justify-between hover:bg-white/[0.02] border-b border-white/[0.04] last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => playSound(sound.path)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            playingSound === sound.path
                              ? 'bg-vif-accent text-white'
                              : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {playingSound === sound.path ? '■' : '▶'}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm truncate">{sound.name}</p>
                          <p className="text-xs text-neutral-500">{formatSize(sound.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyPath(sound.path)}
                          className="px-2 py-1 text-xs text-neutral-500 hover:text-white transition-colors"
                          title="Copy path"
                        >
                          Copy
                        </button>
                        <button
                          onClick={(e) => deleteSound(sound.path, e)}
                          disabled={deleteMutation.isPending}
                          className="px-2 py-1 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                          title="Delete sound"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {categories.length === 0 && (
            <div className="glass-card p-12 text-center">
              <p className="text-neutral-500">No sounds found</p>
              <p className="text-sm text-neutral-600 mt-1">Add sounds to assets/sfx/</p>
            </div>
          )}
        </div>
      )}

      {/* Usage hint */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-2">Usage in Scenes</h3>
        <pre className="text-xs text-neutral-500 font-mono bg-black/20 p-3 rounded overflow-x-auto">
{`sequence:
  - audio.play: assets/sfx/clicks/click1.wav
  - audio.play: assets/sfx/chimes/confirmation_001.ogg`}
        </pre>
      </div>
    </div>
  )
}
