/** @type {import('@dewey/cli').DeweyConfig} */
export default {
  project: {
    name: 'vif',
    tagline: 'Screen capture and browser automation for macOS, designed for AI agents',
    type: 'npm-package',
  },

  agent: {
    criticalContext: [
      'macOS only - uses screencapture, Accessibility API, and native Swift',
      'Requires Screen Recording and Accessibility permissions in System Settings',
      'Start vif server with `vif serve` before using vif-ctl commands or MCP tools',
      'Browser automation uses Chrome DevTools Protocol (CDP) - Chrome must be running',
      'Scene DSL uses YAML files - validate with `vif play --validate scene.yaml`',
    ],

    entryPoints: {
      'main': 'src/index.ts',
      'browser': 'src/browser.ts',
      'cdp': 'src/cdp/',
      'mcp': 'src/mcp/',
      'cli': 'src/cli/',
    },

    rules: [
      { pattern: 'screenshot|capture|record', instruction: 'Check src/index.ts for capture functions' },
      { pattern: 'browser|chrome|cdp', instruction: 'Check src/browser.ts and src/cdp/ for browser automation' },
      { pattern: 'mcp|tool|claude', instruction: 'Check src/mcp/ for MCP server and tools' },
      { pattern: 'scene|yaml|dsl', instruction: 'Check src/scene-runner.ts for scene execution' },
      { pattern: 'cursor|label|backdrop|overlay', instruction: 'Check src/cursor.ts and src/viewport.ts' },
    ],

    sections: ['overview', 'quickstart', 'browser', 'scenes', 'mcp'],
  },

  docs: {
    path: './docs',
    output: './',
    required: ['overview', 'quickstart', 'browser'],
  },
}
