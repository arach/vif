# vif

> Screen capture and browser automation for macOS, designed for AI agents

## Critical Context

**IMPORTANT:** Read these rules before making any changes:

- macOS only - uses screencapture, Accessibility API, and native Swift
- Requires Screen Recording and Accessibility permissions in System Settings
- Start vif server with `vif serve` before using vif-ctl commands or MCP tools
- Browser automation uses Chrome DevTools Protocol (CDP) - Chrome must be running
- Scene DSL uses YAML files - validate with `vif play --validate scene.yaml`

## Project Structure

| Component | Path | Purpose |
|-----------|------|---------|
| Main | `src/index.ts` | |
| Browser | `src/browser.ts` | |
| Cdp | `src/cdp/` | |
| Mcp | `src/mcp/` | |
| Cli | `src/cli/` | |

## Quick Navigation

- Working with **screenshot|capture|record**? → Check src/index.ts for capture functions
- Working with **browser|chrome|cdp**? → Check src/browser.ts and src/cdp/ for browser automation
- Working with **mcp|tool|claude**? → Check src/mcp/ for MCP server and tools
- Working with **scene|yaml|dsl**? → Check src/scene-runner.ts for scene execution
- Working with **cursor|label|backdrop|overlay**? → Check src/cursor.ts and src/viewport.ts

## Overview

> Screen capture and browser automation for macOS, designed for AI agents

# Overview

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
- Stagehand-compatible API (`vif.observe()`, `vif.act()`)

### Demo Recording
- Animated cursor overlay
- Keyboard shortcut display
- Text labels/teleprompter
- Viewport highlighting
- Backdrop dimming

### AI Agent Integration
- MCP server for Claude Code (`vif-mcp`)
- CLI designed for LLM tool use (`vif`, `vif-ctl`)
- Scene DSL for declarative automation

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your AI Agent                         │
│                (Claude Code, etc.)                       │
└───────────────────────┬─────────────────────────────────┘
                        │ MCP / CLI
┌───────────────────────┴─────────────────────────────────┐
│                      vif                                 │
├─────────────────┬─────────────────┬─────────────────────┤
│  Screen Capture │ Browser (CDP)   │   Demo Overlays     │
│  - screencapture│ - navigate      │   - cursor          │
│  - ffmpeg       │ - click/type    │   - labels          │
│  - native APIs  │ - extract       │   - keys            │
└─────────────────┴─────────────────┴─────────────────────┘
```

## Quick Links

- [Quickstart](./quickstart.md) - Get started in 5 minutes
- [Browser Automation](./browser.md) - Chrome automation via CDP
- [Scene DSL](./scenes.md) - Declarative demo automation
- [MCP Tools](./mcp.md) - Claude Code integration

## Quickstart

> Get started with vif in 5 minutes

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

## Browser Automation

> Chrome automation via Chrome DevTools Protocol (CDP)

# Browser Automation

vif provides Chrome automation via the Chrome DevTools Protocol (CDP). The API is inspired by Stagehand but runs locally without external AI inference costs.

## Quick Example

```typescript
import { createVif } from '@arach/vif'

const vif = createVif()
await vif.launch('https://news.ycombinator.com')

// Find elements on page
const { elements } = await vif.observe()
console.log(elements)
// [{ nodeId: 42, tag: 'a', label: 'Hacker News', text: '...', bounds: {...} }, ...]

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
```

## The Vif Class

### Constructor Options

```typescript
interface VifOptions {
  /** Chrome debugging port (default: 9222) */
  port?: number;
  /** Run in headless mode */
  headless?: boolean;
  /** Additional Chrome flags */
  chromeFlags?: string[];
}

const vif = new Vif({
  port: 9222,
  headless: true,
  chromeFlags: ['--disable-gpu']
})
```

### Lifecycle Methods

```typescript
// Launch Chrome and connect
await vif.launch('https://example.com')

// Or connect to existing Chrome
await vif.connect()

// Check connection
vif.isConnected()  // boolean

// Close browser
await vif.close()
```

### Navigation

```typescript
// Navigate to URL
await vif.navigate('https://example.com')

// History navigation
await vif.back()
await vif.forward()
await vif.reload()

// Get current URL
const currentUrl = await vif.url()
```

## Observation (Stagehand-style)

The `observe()` method returns interactive elements on the page. Unlike Stagehand, vif doesn't call an external LLM - it returns structured data that you (or Claude) can interpret.

```typescript
// Get all clickable elements
const { elements } = await vif.observe()

// Filter by selector
const { elements } = await vif.observe({ selector: 'button' })

// Elements include:
interface ClickableElement {
  nodeId: number;      // CDP node ID (use with clickNode)
  tag: string;         // Element tag name
  role: string;        // ARIA role
  label: string;       // Accessible name
  text: string;        // Text content
  selector: string;    // CSS selector
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}
```

### Accessibility Tree

```typescript
// Get full accessibility tree
const tree = await vif.accessibility()

interface AccessibilityNode {
  nodeId: number;
  role: string;
  name: string;
  value?: string;
  description?: string;
  children?: AccessibilityNode[];
}
```

## Actions

### Click

```typescript
// Click by CSS selector
await vif.click('button.submit')

// Click by node ID (from observe)
const { elements } = await vif.observe()
await vif.clickNode(elements[0].nodeId)

// Natural language click (fuzzy match)
await vif.act('click the submit button')
await vif.act('click Login')
await vif.act('tap on Sign Up')
```

### Type

```typescript
// Type into element
await vif.type('input[name="email"]', 'user@example.com')

// With options
await vif.type('input[name="email"]', 'user@example.com', {
  clear: true,    // Clear existing text first
  delay: 50       // Delay between keystrokes (ms)
})

// Type into focused element
await vif.typeText('Hello world')
```

### Keyboard

```typescript
// Press single key
await vif.press('Enter')
await vif.press('Tab')
await vif.press('Escape')

// Keyboard shortcut
await vif.press(['Control', 'a'])  // Select all
await vif.press(['Meta', 'c'])     // Copy (Cmd+C on Mac)
```

### Mouse

```typescript
// Hover over element
await vif.hover('button.menu')

// Scroll
await vif.scroll('down')
await vif.scroll('up', { amount: 500 })
await vif.scroll('down', { selector: '.scrollable-container' })
```

## Data Extraction

```typescript
// Extract text by selectors
const data = await vif.extract({
  title: 'h1',
  description: 'meta[name="description"]',
  links: 'a.nav-link'  // Multiple matches return array
})
// { title: 'Page Title', description: '...', links: ['Home', 'About', 'Contact'] }

// Get text of single element
const heading = await vif.getText('h1')

// Get attribute value
const href = await vif.getAttribute('a.main-link', 'href')
```

## Screenshots

```typescript
// Screenshot to temp file
const path = await vif.screenshot()

// Save to specific path
await vif.screenshot({ path: './screenshot.png' })

// Full page screenshot
await vif.screenshot({ fullPage: true, path: './full.png' })

// Element screenshot
await vif.screenshot({ selector: '.hero-section', path: './hero.png' })

// Different formats
await vif.screenshot({ format: 'jpeg', path: './shot.jpg' })
await vif.screenshot({ format: 'webp', path: './shot.webp' })
```

## Waiting

```typescript
// Wait for element to appear
await vif.waitForSelector('.dynamic-content')

// With timeout
await vif.waitForSelector('.modal', 5000)  // 5 seconds

// Wait for navigation
await vif.waitForNavigation()

// Fixed delay
await vif.wait(1000)  // 1 second
```

## JavaScript Evaluation

```typescript
// Execute JS in page context
const title = await vif.evaluate('document.title')

const dimensions = await vif.evaluate(`({
  width: window.innerWidth,
  height: window.innerHeight
})`)
```

## How It Differs from Stagehand

| Feature | Stagehand | vif |
|---------|-----------|-----|
| AI inference | External API (paid) | None (local) |
| `observe()` | AI interprets instruction | Returns element list |
| `act()` | AI picks element | Fuzzy text matching |
| `extract()` | Schema-based + AI | CSS selectors |
| Use case | AI-autonomous browsing | Claude-assisted automation |

**vif's approach**: Instead of paying for AI inference on every action, vif returns structured data that Claude (already running in Claude Code) can interpret. This is "Claude-in-the-loop" automation.

## MCP Tools

The browser automation is also available as MCP tools:

- `vif_browser_launch` - Launch Chrome
- `vif_browser_navigate` - Navigate to URL
- `vif_browser_click` - Click element
- `vif_browser_type` - Type text
- `vif_browser_scroll` - Scroll page
- `vif_browser_extract` - Extract data
- `vif_browser_press` - Press key
- `vif_browser_hover` - Hover over element
- `vif_observe` - Get page elements
- `vif_click_element` - Click by node ID
- `vif_screenshot` - Take screenshot
- `vif_browser_close` - Close browser

See [MCP Tools](./mcp.md) for full documentation.

---
Generated by [Dewey](https://github.com/arach/dewey) | Last updated: 2026-01-18