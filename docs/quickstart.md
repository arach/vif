---
title: Quickstart
description: Get started with vif in 5 minutes
order: 2
---

# Quickstart

Get up and running with vif in under 5 minutes.

## Prerequisites

- **macOS** (uses native screencapture, Accessibility API)
- **Node.js 18+**
- **Xcode Command Line Tools**: `xcode-select --install`
- **ffmpeg** (optional, for video processing): `brew install ffmpeg`

### Required Permissions

Grant in **System Settings > Privacy & Security**:

| Permission | Required For |
|------------|--------------|
| Screen Recording | Screenshots, video capture |
| Accessibility | Mouse/keyboard automation |

## Installation

```bash
# Install via pnpm
pnpm add @arach/vif

# Or globally for CLI access
pnpm add -g @arach/vif
```

## Screen Capture

```bash
# Screenshot fullscreen
vif shot screenshot.png

# Screenshot an app window
vif shot --app Safari safari.png

# Record video (Ctrl+C to stop)
vif record demo.mp4

# Convert to GIF
vif gif demo.mp4 demo.gif --width 600 --fps 15
```

## Browser Automation

Control Chrome via CDP (Chrome DevTools Protocol):

```typescript
import { createVif } from '@arach/vif'

const vif = createVif()

// Launch Chrome and navigate
await vif.launch('https://news.ycombinator.com')

// Find elements on the page
const elements = await vif.observe({ format: 'clickable-only' })
console.log(elements)  // [{ selector: "a.storylink", text: "Show HN: ..." }, ...]

// Click an element
await vif.click('a.storylink:first-child')

// Type into an input
await vif.type('input[name="q"]', 'search query')

// Extract data
const data = await vif.extract({
  title: 'title',
  links: 'a.storylink'
})

await vif.close()
```

## Demo Overlays

Show visual overlays for demo recordings:

```bash
# Start the automation server (required for overlays)
vif serve

# In another terminal:
vif-ctl cursor show                     # Show animated cursor
vif-ctl cursor move 500 300 0.5         # Move with animation
vif-ctl label show "Recording demo"     # Show text label
vif-ctl keys show cmd shift p           # Show keyboard shortcut
vif-ctl backdrop on                     # Dim background
vif-ctl stage clear                     # Clear all overlays
```

## MCP Server (Claude Code)

Connect vif to Claude Code via MCP:

```bash
vif-mcp  # Start MCP server
```

Add to Claude Code's MCP config:
```json
{
  "mcpServers": {
    "vif": {
      "command": "vif-mcp"
    }
  }
}
```

Then ask Claude to use vif tools:
- "Take a screenshot of Safari"
- "Navigate Chrome to github.com and click Sign in"
- "Show the cursor at 500, 300"

## Scene DSL

Define demo sequences in YAML:

```yaml
scene:
  name: My Demo
  mode: draft

sequence:
  - wait: 500ms
  - cursor.show: {}
  - cursor.moveTo: { x: 500, y: 300 }
  - cursor.click: {}
  - label.show: "Welcome!"
  - wait: 2s
  - stage.clear: {}
```

Run:
```bash
vif play demo.yaml              # Execute scene
vif play --validate demo.yaml   # Validate only
vif play --watch demo.yaml      # Re-run on changes
```

## Next Steps

- [Browser Automation](./browser.md) - Full CDP API reference
- [Scene DSL](./scenes.md) - Complete scene syntax
- [MCP Tools](./mcp.md) - All available MCP tools
