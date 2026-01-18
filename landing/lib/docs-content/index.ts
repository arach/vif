// Auto-generated docs content
// These would ideally be loaded from the actual markdown files at build time

export const overview = `# Overview

**vif** is a screen capture and browser automation toolkit for macOS, designed specifically for AI agents and LLMs.

## What is vif?

vif combines three capabilities:

1. **Screen Capture** - Screenshots, video recording, and GIF creation using native macOS tools
2. **Browser Automation** - Chrome automation via Chrome DevTools Protocol (CDP)
3. **Demo Automation** - Visual overlays (cursor, labels, keys) for recording polished demos

Everything is designed to work with AI agents: predictable CLI output, MCP tools for Claude Code, and a Stagehand-style API for programmatic control.

## Key Features

### Screen Capture
- Screenshot windows, regions, or fullscreen
- Video recording with optional audio
- Convert to GIF, optimize for web
- Take management (versioned screenshots)

### Browser Automation
- Navigate, click, type, scroll in Chrome
- Extract structured data from pages
- Observe DOM elements with accessibility info
- Stagehand-compatible API (\`vif.observe()\`, \`vif.act()\`)

### Demo Recording
- Animated cursor overlay
- Keyboard shortcut display
- Text labels/teleprompter
- Viewport highlighting
- Backdrop dimming

### AI Agent Integration
- MCP server for Claude Code (\`vif-mcp\`)
- CLI designed for LLM tool use (\`vif\`, \`vif-ctl\`)
- Scene DSL for declarative automation
`

export const quickstart = `# Quickstart

Get up and running with vif in under 5 minutes.

## Prerequisites

- **macOS** (uses native screencapture, Accessibility API)
- **Node.js 18+**
- **Xcode Command Line Tools**: \`xcode-select --install\`
- **ffmpeg** (optional, for video processing): \`brew install ffmpeg\`

### Required Permissions

Grant in **System Settings > Privacy & Security**:

| Permission | Required For |
|------------|--------------|
| Screen Recording | Screenshots, video capture |
| Accessibility | Mouse/keyboard automation |

## Installation

\`\`\`bash
# Install via pnpm
pnpm add @arach/vif

# Or globally for CLI access
pnpm add -g @arach/vif
\`\`\`

## Screen Capture

\`\`\`bash
# Screenshot fullscreen
vif shot screenshot.png

# Screenshot an app window
vif shot --app Safari safari.png

# Record video (Ctrl+C to stop)
vif record demo.mp4

# Convert to GIF
vif gif demo.mp4 demo.gif --width 600 --fps 15
\`\`\`

## Browser Automation

Control Chrome via CDP (Chrome DevTools Protocol):

\`\`\`typescript
import { createVif } from '@arach/vif'

const vif = createVif()

// Launch Chrome and navigate
await vif.launch('https://news.ycombinator.com')

// Find elements on the page
const elements = await vif.observe({ format: 'clickable-only' })

// Click an element
await vif.click('a.storylink:first-child')

// Type into an input
await vif.type('input[name="q"]', 'search query')

await vif.close()
\`\`\`

## Demo Overlays

\`\`\`bash
# Start the automation server (required for overlays)
vif serve

# In another terminal:
vif-ctl cursor show                     # Show animated cursor
vif-ctl cursor move 500 300 0.5         # Move with animation
vif-ctl label show "Recording demo"     # Show text label
vif-ctl backdrop on                     # Dim background
vif-ctl stage clear                     # Clear all overlays
\`\`\`

## MCP Server (Claude Code)

\`\`\`bash
vif-mcp  # Start MCP server
\`\`\`

Add to Claude Code's MCP config and ask Claude to use vif tools directly.
`

export const browser = `# Browser Automation

vif provides Chrome automation via the Chrome DevTools Protocol (CDP). The API is inspired by Stagehand but runs locally without external AI inference costs.

## Quick Example

\`\`\`typescript
import { createVif } from '@arach/vif'

const vif = createVif()
await vif.launch('https://news.ycombinator.com')

// Find elements on page
const { elements } = await vif.observe()

// Click an element
await vif.click('a.storylink:first-child')

// Type into input
await vif.type('input[name="q"]', 'search query')

// Extract data
const data = await vif.extract({
  title: 'title',
  links: 'a.storylink'
})

await vif.close()
\`\`\`

## The Vif Class

### Constructor Options

\`\`\`typescript
interface VifOptions {
  port?: number;      // Chrome debugging port (default: 9222)
  headless?: boolean; // Run in headless mode
  chromeFlags?: string[];
}
\`\`\`

### Lifecycle Methods

\`\`\`typescript
await vif.launch('https://example.com')  // Launch Chrome
await vif.connect()                       // Connect to existing
vif.isConnected()                         // Check connection
await vif.close()                         // Close browser
\`\`\`

### Navigation

\`\`\`typescript
await vif.navigate('https://example.com')
await vif.back()
await vif.forward()
await vif.reload()
const url = await vif.url()
\`\`\`

## Observation

\`\`\`typescript
const { elements } = await vif.observe()
const { elements } = await vif.observe({ selector: 'button' })
const tree = await vif.accessibility()
\`\`\`

## Actions

\`\`\`typescript
await vif.click('button.submit')
await vif.act('click the submit button')  // Natural language
await vif.type('input[name="email"]', 'user@example.com')
await vif.press('Enter')
await vif.scroll('down')
await vif.hover('button.menu')
\`\`\`

## Data Extraction

\`\`\`typescript
const data = await vif.extract({
  title: 'h1',
  links: 'a.nav-link'
})
const text = await vif.getText('h1')
const href = await vif.getAttribute('a', 'href')
\`\`\`

## Screenshots

\`\`\`typescript
const path = await vif.screenshot()
await vif.screenshot({ path: './shot.png', fullPage: true })
await vif.screenshot({ selector: '.hero' })
\`\`\`
`

export const scenes = `# Scene DSL

Define demo sequences declaratively in YAML.

## Quick Example

\`\`\`yaml
scene:
  name: My App Demo
  mode: draft

app:
  name: Safari
  window:
    width: 1200
    height: 800

stage:
  backdrop: true
  viewport:
    padding: 10

sequence:
  - wait: 500ms
  - record: start
  - cursor.show: {}
  - cursor.moveTo: { x: 500, y: 300, duration: 0.3 }
  - cursor.click: {}
  - label.show: "Welcome to the demo"
  - wait: 2s
  - record: stop
\`\`\`

Run with:
\`\`\`bash
vif play demo.yaml              # Execute scene
vif play --validate demo.yaml   # Validate only
vif play --watch demo.yaml      # Re-run on changes
\`\`\`

## Actions

### Cursor
\`\`\`yaml
- cursor.show: {}
- cursor.hide: {}
- cursor.moveTo: { x: 500, y: 300, duration: 0.3 }
- cursor.click: {}
- click: sidebar.home
\`\`\`

### Timing
\`\`\`yaml
- wait: 500ms
- wait: 2s
\`\`\`

### Recording
\`\`\`yaml
- record: start
- record: stop
\`\`\`

### Labels
\`\`\`yaml
- label.show: "Welcome"
- label.update: "New text"
- label.hide: {}
\`\`\`

### Keyboard
\`\`\`yaml
- keys.show:
    keys: ["cmd", "shift", "p"]
    press: true
- input.keys: ["cmd", "c"]
\`\`\`

### Typing
\`\`\`yaml
- typer.type:
    text: "Hello world"
    style: terminal
- input.type:
    text: "Hello"
    delay: 0.03
\`\`\`
`

export const mcp = `# MCP Tools

vif exposes all capabilities as MCP tools for Claude Code.

## Setup

\`\`\`bash
vif-mcp  # Start MCP server
\`\`\`

Add to Claude Code's MCP config:
\`\`\`json
{
  "mcpServers": {
    "vif": { "command": "vif-mcp" }
  }
}
\`\`\`

## Cursor Tools

| Tool | Description |
|------|-------------|
| \`vif_cursor_show\` | Show cursor overlay |
| \`vif_cursor_hide\` | Hide cursor |
| \`vif_cursor_move\` | Move with animation |
| \`vif_cursor_click\` | Click animation |

## Label Tools

| Tool | Description |
|------|-------------|
| \`vif_label_show\` | Show text label |
| \`vif_label_update\` | Update text |
| \`vif_label_hide\` | Hide label |

## Stage Tools

| Tool | Description |
|------|-------------|
| \`vif_backdrop_show\` | Dim outside viewport |
| \`vif_backdrop_hide\` | Remove dimming |
| \`vif_stage_center\` | Center app window |
| \`vif_stage_clear\` | Clear all overlays |

## Browser Tools

| Tool | Description |
|------|-------------|
| \`vif_browser_launch\` | Launch Chrome |
| \`vif_browser_navigate\` | Navigate to URL |
| \`vif_browser_click\` | Click element |
| \`vif_browser_type\` | Type text |
| \`vif_browser_scroll\` | Scroll page |
| \`vif_browser_extract\` | Extract data |
| \`vif_observe\` | Get page elements |
| \`vif_screenshot\` | Take screenshot |
| \`vif_browser_close\` | Close browser |
`
