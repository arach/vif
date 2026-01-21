import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { vifClient } from '@/lib/vif-client'
import { PageLayout } from '@/components/PageLayout'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import {
  Play,
  Square,
  ChevronDown,
  Copy,
  Trash2,
  Volume2,
  Radio,
  Folder,
  ChevronUp,
  ChevronDownIcon,
  Music,
} from 'lucide-react'

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
    <PageLayout mode="contained">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-8">
          {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Sound Effects</h1>
            <p className="text-muted-foreground mt-1">CC0 licensed sounds for your scenes</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="glass" className="gap-1">
              <Volume2 className="w-3 h-3" />
              {totalSounds} sound{totalSounds !== 1 ? 's' : ''} in {categories.length} categories
            </Badge>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                <ChevronDownIcon className="w-4 h-4 mr-1" />
                Expand
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                <ChevronUp className="w-4 h-4 mr-1" />
                Collapse
              </Button>
            </div>
          </div>
        </div>

        {!connected ? (
          <Card variant="glass" className="p-12 text-center">
            <Radio className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Connect to vif agent to browse sounds</p>
          </Card>
        ) : isLoading ? (
          <Card variant="glass" className="p-12 text-center">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-vif-accent/30 border-t-vif-accent rounded-full animate-spin" />
            <p className="text-muted-foreground">Loading sounds...</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {categories.map((category) => (
              <Card key={category.name} variant="glass" className="overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.name)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-[10px] font-mono uppercase">
                      {getCategoryIcon(category.name)}
                    </Badge>
                    <div className="text-left">
                      <h2 className="font-medium capitalize">{category.name}</h2>
                      <p className="text-xs text-muted-foreground">{getCategoryDescription(category.name)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="glass">
                      {category.sounds.length} sounds
                    </Badge>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCategories.has(category.name) ? 'rotate-180' : ''}`} />
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
                          <Button
                            variant={playingSound === sound.path ? "glass-primary" : "glass"}
                            size="icon-sm"
                            onClick={() => playSound(sound.path)}
                            className="rounded-full"
                          >
                            {playingSound === sound.path ? (
                              <Square className="w-3 h-3 fill-current" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                          </Button>
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm truncate">{sound.name}</p>
                            <p className="text-xs text-muted-foreground">{formatSize(sound.size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyPath(sound.path)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy path to clipboard</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => deleteSound(sound.path, e)}
                                disabled={deleteMutation.isPending}
                                className="text-vif-danger/60 hover:text-vif-danger hover:bg-vif-danger/10"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete sound</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}

            {categories.length === 0 && (
              <Card variant="glass" className="p-12 text-center">
                <Music className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No sounds found</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Add sounds to assets/sfx/</p>
              </Card>
            )}
          </div>
        )}

        {/* Usage hint */}
        <Card variant="glass">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <Folder className="w-4 h-4 text-vif-accent" />
              Usage in Scenes
            </h3>
            <pre className="text-xs text-muted-foreground font-mono bg-black/20 p-3 rounded-lg overflow-x-auto border border-white/[0.06]">
{`sequence:
  - audio.play: assets/sfx/clicks/click1.wav
  - audio.play: assets/sfx/chimes/confirmation_001.ogg`}
            </pre>
          </CardContent>
        </Card>
        </div>
      </TooltipProvider>
    </PageLayout>
  )
}
