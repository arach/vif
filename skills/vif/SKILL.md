# vif - Demo Automation & Browser Control

Screen capture, browser automation, and visual overlays for macOS. Built for AI agents.

## When to Use This Skill

- **Recording demos** with animated cursor, labels, keyboard shortcuts
- **Browser automation** - navigate, click, type, extract data from Chrome
- **Screenshots** of apps or browser pages
- **Visual presentations** with backdrop dimming and viewport focus

## Setup

### 1. Install vif

```bash
pnpm add -g @arach/vif
```

### 2. Start the server (required for overlays)

```bash
vif serve
```

### 3. MCP tools are available via `vif-mcp`

The MCP server should already be configured. If not, add to settings:
```json
{
  "mcpServers": {
    "vif": { "command": "vif-mcp" }
  }
}
```

## Available Tools

### Cursor Overlay
- `vif_cursor_show` / `vif_cursor_hide` - Show/hide animated cursor
- `vif_cursor_move` - Move to position `{x, y, duration}`
- `vif_cursor_click` - Click animation at current position

### Labels & Captions
- `vif_label_show` - Show text label `{text, position: "top"|"bottom"}`
- `vif_label_update` - Update label text
- `vif_label_hide` - Hide label

### Camera Overlay
- `vif_camera_show` - Show presenter camera `{position, size}`
- `vif_camera_set` - Update camera position/size
- `vif_camera_hide` - Hide camera

Positions: `auto`, `top-left`, `top-right`, `bottom-left`, `bottom-right`
Sizes: `small`, `medium`, `large`, or pixel number

### Stage & Backdrop
- `vif_backdrop_show` / `vif_backdrop_hide` - Dim background
- `vif_viewport_set` - Set visible region `{x, y, width, height}`
- `vif_stage_center` - Center app window `{app, width, height}`
- `vif_stage_clear` - Clear all overlays

### Keyboard Display
- `vif_keys_show` - Show shortcut `{keys: ["cmd", "shift", "p"], press: true}`
- `vif_keys_hide` - Hide keyboard overlay

### Typing Overlay
- `vif_typer_type` - Animated typing `{text, style, delay}`
- `vif_typer_hide` - Hide typer

### Browser Automation (Chrome CDP)
- `vif_browser_launch` - Launch Chrome `{url?, headless?}`
- `vif_browser_navigate` - Go to URL
- `vif_browser_click` - Click element `{selector}`
- `vif_browser_type` - Type into element `{selector?, text, clear?, delay?}`
- `vif_browser_scroll` - Scroll `{direction, amount?, selector?}`
- `vif_browser_extract` - Extract data `{selectors: {name: "css"}}`
- `vif_browser_press` - Press key `{key}` or `{keys: ["cmd", "c"]}`
- `vif_browser_hover` - Hover element
- `vif_browser_close` - Close browser

### Observation
- `vif_observe` - Get interactive elements `{format: "clickable"|"accessibility"|"full"}`
- `vif_click_element` - Click by node ID from observe `{nodeId}` or `{label, role?}`

### Screenshots
- `vif_screenshot` - Capture browser `{fullPage?, selector?, format?}`

## Example Workflows

### Record a Demo

```
1. vif_stage_center {app: "MyApp", width: 1280, height: 800}
2. vif_backdrop_show
3. vif_cursor_show
4. vif_label_show {text: "Welcome to MyApp"}
5. vif_cursor_move {x: 500, y: 300, duration: 0.5}
6. vif_cursor_click
7. vif_label_hide
8. vif_stage_clear
```

### Automate Browser

```
1. vif_browser_launch {url: "https://example.com"}
2. vif_observe {format: "clickable"}
3. vif_browser_click {selector: "button.login"}
4. vif_browser_type {selector: "input[name=email]", text: "user@example.com"}
5. vif_browser_click {selector: "button[type=submit]"}
6. vif_screenshot {fullPage: true}
```

### Extract Data from Page

```
1. vif_browser_launch {url: "https://news.ycombinator.com"}
2. vif_browser_extract {selectors: {titles: ".titleline > a", scores: ".score"}}
```

## CLI Commands

When MCP tools aren't suitable, use the CLI:

```bash
# Screenshots
vif shot screenshot.png
vif shot --app Safari safari.png

# Video recording
vif record demo.mp4
vif record --duration 10 demo.mp4

# GIF conversion
vif gif demo.mp4 demo.gif --width 600 --fps 15

# Scene playback
vif play scene.yaml
vif play --watch scene.yaml
```

## Troubleshooting

**"Agent not running"** - Run `vif serve` first

**Overlays not visible** - Grant Accessibility permission to "Vif Agent" in System Settings

**Browser tools fail** - Ensure Chrome is installed; tools launch it automatically

**Camera not showing** - Grant Camera permission to "Vif Agent"
