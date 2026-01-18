---
title: Browser Automation
description: Chrome automation via Chrome DevTools Protocol (CDP)
order: 3
---

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
