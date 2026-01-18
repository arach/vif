import { defineNitroConfig } from 'nitro/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineNitroConfig({
  // Use rolldown bundler (no prompt)
  builder: 'rolldown',

  // Deployment preset
  preset: 'node-server',

  // Explicitly scan directories
  scanDirs: ['.'],

  // Alias for utils
  alias: {
    '~': resolve(__dirname),
  },

  // Enable experimental features
  experimental: {
    websocket: true,
  },

  // Route rules
  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
  },

  // Storage for caching and state
  storage: {
    state: {
      driver: 'memory',
    },
  },
})
