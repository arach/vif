import { ReactNode } from 'react'
import { useSidebar } from '@/routes/__root'

type LayoutMode = 'contained' | 'full' | 'immersive'

interface PageLayoutProps {
  children: ReactNode
  /**
   * Layout mode:
   * - 'contained': Centered with max-width (default, good for forms/settings)
   * - 'full': Full width with padding (good for lists/grids)
   * - 'immersive': No padding, fills entire space (good for video players, editors)
   */
  mode?: LayoutMode
  /** Additional class names */
  className?: string
}

export function PageLayout({ children, mode = 'contained', className = '' }: PageLayoutProps) {
  const { actualWidth } = useSidebar()

  if (mode === 'immersive') {
    // Takes over the entire content area
    return (
      <div
        className={`fixed inset-0 flex flex-col ${className}`}
        style={{ left: actualWidth }}
      >
        {children}
      </div>
    )
  }

  if (mode === 'full') {
    // Full width with padding
    return (
      <div className={`px-8 py-8 ${className}`}>
        {children}
      </div>
    )
  }

  // Default: contained (centered with max-width)
  return (
    <div className={`max-w-5xl mx-auto px-8 py-8 ${className}`}>
      {children}
    </div>
  )
}
