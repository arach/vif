'use client'

import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'

// Dynamically import DocsApp to avoid SSR issues
const DocsApp = dynamic(
  () => import('@arach/dewey').then(mod => mod.DocsApp),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Loading docs...</div>
      </div>
    )
  }
)

const navigation = [
  {
    title: 'Getting Started',
    items: [
      { id: 'overview', title: 'Overview' },
      { id: 'quickstart', title: 'Quickstart' },
    ],
  },
  {
    title: 'Features',
    items: [
      { id: 'browser', title: 'Browser Automation' },
      { id: 'scenes', title: 'Scene DSL' },
      { id: 'mcp', title: 'MCP Tools' },
    ],
  },
]

// Custom Link component for Next.js
function NextLink({ href, children, ...props }: React.ComponentProps<'a'>) {
  return (
    <Link href={href || '#'} {...props}>
      {children}
    </Link>
  )
}

interface DocsClientPageProps {
  docs: Record<string, string>
  initialPage: string
}

export default function DocsClientPage({ docs, initialPage }: DocsClientPageProps) {
  const router = useRouter()

  const handleNavigate = (pageId: string) => {
    router.push(`/docs/${pageId}/`)
  }

  return (
    <DocsApp
      config={{
        name: 'vif',
        tagline: 'Screen capture & browser automation for macOS',
        basePath: '/docs',
        homeUrl: '/',
        navigation,
        layout: {
          sidebar: true,
          toc: true,
          header: true,
          prevNext: true,
        },
      }}
      docs={docs}
      currentPage={initialPage}
      onNavigate={handleNavigate}
      providerProps={{
        theme: 'neutral',
        components: {
          Link: NextLink,
        },
      }}
    />
  )
}
