import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

export const Route = createFileRoute('/scenes')({
  component: Scenes,
})

// For now, we'll scan the local demos/scenes directory
// Later this could be a proper scene library
async function fetchScenes(): Promise<SceneFile[]> {
  // TODO: Add endpoint to vif agent to list scenes
  // For now, return mock data
  return [
    { name: 'talkie-demo.yaml', path: 'demos/scenes/talkie-demo.yaml', modified: new Date().toISOString() },
    { name: 'test-audio-channels.yaml', path: 'demos/scenes/test-audio-channels.yaml', modified: new Date().toISOString() },
    { name: 'test-crossfade.yaml', path: 'demos/scenes/test-crossfade.yaml', modified: new Date().toISOString() },
  ]
}

interface SceneFile {
  name: string
  path: string
  modified: string
}

function Scenes() {
  const [selected, setSelected] = useState<string | null>(null)

  const { data: scenes, isLoading } = useQuery({
    queryKey: ['scenes'],
    queryFn: fetchScenes,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scenes</h1>
        <button className="px-4 py-2 bg-vif-accent text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
          New Scene
        </button>
      </div>

      {isLoading ? (
        <div className="text-neutral-400">Loading scenes...</div>
      ) : (
        <div className="grid gap-3">
          {scenes?.map((scene) => (
            <SceneCard
              key={scene.path}
              scene={scene}
              selected={selected === scene.path}
              onSelect={() => setSelected(scene.path)}
            />
          ))}
        </div>
      )}

      {scenes?.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <p>No scenes found</p>
          <p className="text-sm mt-1">Create a new scene to get started</p>
        </div>
      )}
    </div>
  )
}

function SceneCard({
  scene,
  selected,
  onSelect,
}: {
  scene: SceneFile
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        bg-vif-surface border rounded-lg p-4 cursor-pointer transition-colors
        ${selected ? 'border-vif-accent' : 'border-vif-border hover:border-neutral-600'}
      `}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{scene.name}</h3>
          <p className="text-sm text-neutral-400">{scene.path}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              // TODO: Run scene
            }}
            className="px-3 py-1.5 bg-vif-accent text-white rounded text-sm hover:bg-blue-600"
          >
            Run
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              // TODO: Edit scene
            }}
            className="px-3 py-1.5 bg-neutral-700 text-white rounded text-sm hover:bg-neutral-600"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}
