import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { vifClient } from '@/lib/vif-client'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['agent-status'],
    queryFn: () => vifClient.send<AgentStatus>('status'),
    refetchInterval: 2000,
    enabled: vifClient.connected,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatusCard
          label="Agent"
          value={vifClient.connected ? 'Running' : 'Offline'}
          status={vifClient.connected ? 'success' : 'error'}
        />
        <StatusCard
          label="Recording"
          value={status?.recording ? 'Active' : 'Idle'}
          status={status?.recording ? 'warning' : 'neutral'}
        />
        <StatusCard
          label="Port"
          value="51378"
          status="neutral"
        />
      </div>

      {/* Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Quick Actions</h2>
        <div className="flex gap-3">
          <ActionButton onClick={() => vifClient.send('cursor.show', {})}>
            Show Cursor
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('cursor.hide', {})}>
            Hide Cursor
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('backdrop.show', {})}>
            Show Backdrop
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('backdrop.hide', {})}>
            Hide Backdrop
          </ActionButton>
          <ActionButton onClick={() => vifClient.send('stage.clear', {})}>
            Clear Stage
          </ActionButton>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Agent Info</h2>
        <div className="bg-vif-surface border border-vif-border rounded-lg p-4">
          {isLoading ? (
            <p className="text-neutral-400">Loading...</p>
          ) : status ? (
            <pre className="text-sm text-neutral-300 font-mono">
              {JSON.stringify(status, null, 2)}
            </pre>
          ) : (
            <p className="text-neutral-400">
              Connect to vif agent to see status
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

interface AgentStatus {
  recording: boolean
  [key: string]: unknown
}

function StatusCard({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status: 'success' | 'error' | 'warning' | 'neutral'
}) {
  const statusColors = {
    success: 'text-green-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    neutral: 'text-neutral-400',
  }

  return (
    <div className="bg-vif-surface border border-vif-border rounded-lg p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className={`text-xl font-medium ${statusColors[status]}`}>{value}</p>
    </div>
  )
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 bg-vif-surface border border-vif-border rounded-lg text-sm hover:bg-neutral-800 transition-colors"
    >
      {children}
    </button>
  )
}
