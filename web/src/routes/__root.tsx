import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect, useState, createContext, useContext, useRef, useCallback } from 'react'
import { vifClient } from '@/lib/vif-client'
import {
  LayoutDashboard,
  Film,
  Volume2,
  Video,
  Wand2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'

export const Route = createRootRoute({
  component: RootLayout,
})

// Sidebar constants
const SIDEBAR_MIN_WIDTH = 64
const SIDEBAR_MAX_WIDTH = 320
const SIDEBAR_DEFAULT_WIDTH = 224
const SIDEBAR_COLLAPSED_WIDTH = 64
const SIDEBAR_COLLAPSE_THRESHOLD = 100

// Sidebar context for collapse state
interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  width: number
  actualWidth: number // The actual rendered width (collapsed or expanded)
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  width: SIDEBAR_DEFAULT_WIDTH,
  actualWidth: SIDEBAR_DEFAULT_WIDTH,
})

export const useSidebar = () => useContext(SidebarContext)

function RootLayout() {
  const [connected, setConnected] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })
  const [width, setWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-width')
      return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
    }
    return SIDEBAR_DEFAULT_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    vifClient.connect().catch(console.error)

    const unsub = vifClient.onConnection(setConnected)
    return () => {
      unsub()
      vifClient.disconnect()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    if (!collapsed) {
      localStorage.setItem('sidebar-width', String(width))
    }
  }, [width, collapsed])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX

      // Snap to collapsed if dragged below threshold
      if (newWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
        setCollapsed(true)
        setWidth(SIDEBAR_DEFAULT_WIDTH) // Remember last width for when expanded
      } else {
        setCollapsed(false)
        setWidth(Math.min(Math.max(newWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH))
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const actualWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, width, actualWidth }}>
      <TooltipProvider delayDuration={0}>
        <div
          className="min-h-screen bg-vif-bg flex"
          style={{ '--sidebar-width': `${actualWidth}px` } as React.CSSProperties}
        >
          {/* Subtle ambient gradient */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-vif-accent/5 rounded-full blur-[120px]" />
          </div>

          {/* Sidebar */}
          <aside
            ref={sidebarRef}
            style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : width }}
            className={`relative flex-shrink-0 border-r border-zinc-800 bg-zinc-900/50 flex flex-col ${
              isResizing ? '' : 'transition-[width] duration-200 ease-out'
            }`}
          >
            {/* Resize handle */}
            <div
              onMouseDown={handleMouseDown}
              className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 transition-colors ${
                isResizing ? 'bg-vif-accent' : 'hover:bg-vif-accent/50'
              }`}
            />
            {/* Header with logo */}
            <div className={`border-b border-zinc-800/50 flex items-center ${collapsed ? 'justify-center p-2' : 'px-6 py-3'}`}>
              <Link to="/" className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-vif-accent flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xs">V</span>
                </div>
                {!collapsed && (
                  <span className="text-base font-semibold text-white whitespace-nowrap">
                    vif
                  </span>
                )}
              </Link>
              {/* Collapse button - only show in header when expanded */}
              {!collapsed && (
                <button
                  onClick={() => setCollapsed(true)}
                  className="ml-auto p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Expand button - pops out when collapsed, same height as header */}
            {collapsed && (
              <button
                onClick={() => setCollapsed(false)}
                className="absolute -right-4 top-3 z-20 w-4 h-6 flex items-center justify-center rounded-r bg-zinc-800 border border-l-0 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            )}

            {/* Navigation */}
            <nav className={`flex-1 space-y-1 ${collapsed ? 'p-2' : 'p-3'}`}>
              <NavLink to="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
              <NavLink to="/scenes" icon={<Film className="w-4 h-4" />} label="Scenes" />
              <NavLink to="/sounds" icon={<Volume2 className="w-4 h-4" />} label="Sounds" />
              <NavLink to="/videos" icon={<Video className="w-4 h-4" />} label="Videos" />
              <NavLink to="/recordings" icon={<Wand2 className="w-4 h-4" />} label="Post-Production" />
            </nav>

            {/* Connection status */}
            <div className={`border-t border-zinc-800/50 ${collapsed ? 'p-2' : 'p-3'}`}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`flex items-center justify-center p-3 rounded-md ${
                      connected ? 'text-vif-success bg-vif-success/5' : 'text-vif-danger bg-vif-danger/5'
                    }`}>
                      <span className="relative flex h-2 w-2">
                        {connected && (
                          <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 animate-ping" />
                        )}
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {connected ? 'Connected' : 'Disconnected'}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
                  connected ? 'text-vif-success bg-vif-success/5' : 'text-vif-danger bg-vif-danger/5'
                }`}>
                  <span className="relative flex h-2 w-2">
                    {connected && (
                      <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 animate-ping" />
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                  </span>
                  {connected ? 'Connected' : 'Disconnected'}
                </div>
              )}
            </div>

          </aside>

          {/* Main content - pages control their own layout */}
          <main className="relative flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const { collapsed } = useSidebar()

  const linkContent = (
    <Link
      to={to}
      className={`flex items-center rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ${
        collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2'
      }`}
      activeProps={{
        className: `flex items-center rounded-md text-sm text-white bg-zinc-800 ${
          collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2'
        }`
      }}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && (
        <span className="whitespace-nowrap overflow-hidden">
          {label}
        </span>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {linkContent}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return linkContent
}
