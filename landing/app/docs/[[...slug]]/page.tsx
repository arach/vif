import * as content from '@/lib/docs-content'
import DocsClientPage from './client'

const docs: Record<string, string> = {
  overview: content.overview,
  quickstart: content.quickstart,
  browser: content.browser,
  scenes: content.scenes,
  mcp: content.mcp,
}

const docPages = ['overview', 'quickstart', 'browser', 'scenes', 'mcp']

// Generate static params for all doc pages
export function generateStaticParams() {
  return [
    { slug: [] },  // /docs
    ...docPages.map(page => ({ slug: [page] }))
  ]
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const currentPage = slug?.[0] || 'overview'

  return <DocsClientPage docs={docs} initialPage={currentPage} />
}
