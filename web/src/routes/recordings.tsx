import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/recordings')({
  component: Recordings,
})

function Recordings() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Recordings</h1>

      <div className="text-center py-12 text-neutral-400">
        <p>Recording library coming soon</p>
        <p className="text-sm mt-1">View and manage your recorded demos</p>
      </div>
    </div>
  )
}
