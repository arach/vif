import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/recordings')({
  component: Recordings,
})

function Recordings() {

  // For now, show the draft recording location and post-production options
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Post-Production</h1>

      {/* Draft Recording */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Draft Recording</h2>
        <div className="bg-vif-surface border border-vif-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-sm text-neutral-300">~/.vif/draft.mp4</p>
              <p className="text-sm text-neutral-500 mt-1">
                Draft recordings are saved here and overwritten each run
              </p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 bg-neutral-700 text-white rounded text-sm hover:bg-neutral-600">
                Open Folder
              </button>
              <button className="px-3 py-1.5 bg-vif-accent text-white rounded text-sm hover:bg-blue-600">
                Preview
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Audio Mixing */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Audio Mixing</h2>
        <div className="bg-vif-surface border border-vif-border rounded-lg p-4 space-y-4">
          <p className="text-sm text-neutral-400">
            Mix background music, narration, and sound effects with your recording.
          </p>

          {/* Channels */}
          <div className="space-y-3">
            <AudioChannel
              id={1}
              name="Narration"
              description="Real-time audio via BlackHole"
              color="blue"
            />
            <AudioChannel
              id={2}
              name="Music"
              description="Background music track"
              color="purple"
            />
            <AudioChannel
              id={3}
              name="SFX"
              description="Sound effects"
              color="green"
            />
          </div>

          <div className="pt-4 border-t border-vif-border flex gap-3">
            <button className="px-4 py-2 bg-vif-accent text-white rounded text-sm hover:bg-blue-600">
              Render Final Mix
            </button>
            <button className="px-4 py-2 bg-neutral-700 text-white rounded text-sm hover:bg-neutral-600">
              Export Timeline
            </button>
          </div>
        </div>
      </section>

      {/* Output Options */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Export Options</h2>
        <div className="grid grid-cols-3 gap-4">
          <ExportOption
            format="MP4"
            description="H.264, best compatibility"
            recommended
          />
          <ExportOption
            format="WebM"
            description="VP9, web optimized"
          />
          <ExportOption
            format="GIF"
            description="Animated, larger file"
          />
        </div>
      </section>

      {/* Recent Exports */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent Exports</h2>
        <div className="bg-vif-surface border border-vif-border rounded-lg p-8 text-center text-neutral-500">
          <p>No exports yet</p>
          <p className="text-sm mt-1">Run a scene and render to see exports here</p>
        </div>
      </section>
    </div>
  )
}

function AudioChannel({
  id,
  name,
  description,
  color,
}: {
  id: number
  name: string
  description: string
  color: 'blue' | 'purple' | 'green'
}) {
  const colors = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
  }

  return (
    <div className="flex items-center gap-4 p-3 bg-neutral-900/50 rounded-lg">
      <div className={`w-3 h-3 rounded-full ${colors[color]}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium">Ch {id}: {name}</p>
        <p className="text-sm text-neutral-500">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="100"
          defaultValue="80"
          className="w-24 accent-neutral-400"
        />
        <span className="text-sm text-neutral-400 w-8">80%</span>
      </div>
    </div>
  )
}

function ExportOption({
  format,
  description,
  recommended,
}: {
  format: string
  description: string
  recommended?: boolean
}) {
  return (
    <div className={`
      bg-vif-surface border rounded-lg p-4 cursor-pointer transition-all
      ${recommended ? 'border-vif-accent' : 'border-vif-border hover:border-neutral-600'}
    `}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{format}</span>
        {recommended && (
          <span className="text-xs bg-vif-accent/20 text-vif-accent px-2 py-0.5 rounded">
            Recommended
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-500 mt-1">{description}</p>
    </div>
  )
}
