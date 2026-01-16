import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { vifClient } from '@/lib/vif-client'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    // Connect to vif agent
    vifClient.connect().catch(console.error)

    const unsub = vifClient.onConnection(setConnected)
    return () => {
      unsub()
      vifClient.disconnect()
    }
  }, [])

  return (
    <div className="min-h-screen bg-vif-bg">
      {/* Header */}
      <header className="border-b border-vif-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold">
              vif
            </Link>
            <nav className="flex gap-4">
              <NavLink to="/">Dashboard</NavLink>
              <NavLink to="/scenes">Scenes</NavLink>
              <NavLink to="/recordings">Post-Production</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-sm text-neutral-400">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-sm text-neutral-400 hover:text-white transition-colors"
      activeProps={{ className: 'text-sm text-white' }}
    >
      {children}
    </Link>
  )
}
