import { docs } from '@/lib/docs-content'
import DocsClientPage from './client'

// Generate static params for all doc pages
export function generateStaticParams() {
  return [
    { slug: [] }, // /docs/ base route
    ...Object.keys(docs).map((slug) => ({
      slug: [slug],
    }))
  ]
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  const pageId = slug?.[0] || 'overview'

  return <DocsClientPage docs={docs} initialPage={pageId} />
}
