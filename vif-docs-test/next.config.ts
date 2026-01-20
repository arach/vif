import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@arach/dewey'],
  turbopack: {
    root: resolve(__dirname, '../..'),
  },
}

export default nextConfig
