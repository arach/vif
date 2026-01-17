import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { vifClient } from '@/lib/vif-client'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    vifClient.connect().catch(console.error)

    const unsub = vifClient.onConnection(setConnected)
    return () => {
      unsub()
      vifClient.disconnect()
    }
  }, [])

  return (
    <div className="min-h-screen bg-vif-bg noise-overlay">
      {/* Gradient orbs for ambiance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-vif-accent/20 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute top-1/2 -left-40 w-60 h-60 bg-purple-500/10 rounded-full blur-[80px] animate-pulse-slow" />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/[0.06] bg-black/20 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-vif-accent to-purple-500 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-shadow">
                <span className="text-white font-bold text-sm">V</span>
              </div>
              <span className="text-lg font-semibold gradient-text">vif</span>
            </Link>
            <nav className="flex gap-1">
              <NavLink to="/">Dashboard</NavLink>
              <NavLink to="/scenes">Scenes</NavLink>
              <NavLink to="/videos">Videos</NavLink>
              <NavLink to="/recordings">Post-Production</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              {connected && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                connected ? 'bg-green-400' : 'bg-red-400'
              }`} />
            </span>
            <span className={connected ? 'text-neutral-300' : 'text-red-400'}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all"
      activeProps={{
        className: 'px-4 py-2 rounded-lg text-sm text-white bg-white/[0.08] shadow-inner-glow'
      }}
    >
      {children}
    </Link>
  )
}
