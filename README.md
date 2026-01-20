# Vif

**Demo Automation Toolkit** — Screen capture, browser automation, and visual overlays for macOS.

![Vif OG](landing/public/og-image.png)

Built for AI agents and LLMs. Declarative scenes, CLI-native, MCP-ready.

## Features

- **Screen Capture**: Screenshots, video recording, GIF creation using native macOS tools
- **Browser Automation**: Chrome automation via Chrome DevTools Protocol (CDP)
- **Demo Overlays**: Animated cursor, keyboard shortcuts, labels, camera/presenter overlay
- **Declarative Scenes**: Define demo sequences in YAML with the Scene DSL
- **AI Agent Integration**: MCP server for Claude Code, predictable CLI output
- **Live Control Panel**: Layer viewer showing active stage elements
- **Headless Mode**: Full immersive recording without UI overlay

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Entry Points                             │
├─────────────────┬─────────────────┬─────────────────────────┤
│  vif            │  vif-ctl        │  vif-mcp                │
│  Main CLI       │  Control CLI    │  MCP Server             │
└────────┬────────┴────────┬────────┴────────┬────────────────┘
         │                 │                  │
         │  serve          │  WebSocket       │  MCP tools
         ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              WebSocket Server (ws://localhost:7850)          │
│  - Spawns vif-agent on start                                │
│  - Routes commands to agent via Unix socket                  │
│  - HTTP server on :7852 for video streaming                  │
└────────────────────────────┬────────────────────────────────┘
                             │ Unix socket (/tmp/vif-agent.sock)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                vif-agent (Swift macOS app)                   │
│  - Overlay windows (cursor, label, keys, typer, camera)     │
│  - Screen recording                                          │
│  - Control panel UI                                          │
│  - Requires Accessibility + Screen Recording permissions     │
└─────────────────────────────────────────────────────────────┘
```

### Ports

| Port | Service |
|------|---------|
| 7850 | WebSocket server (main commands) |
| 7851 | VifTargets SDK (app integrations) |
| 7852 | HTTP video streaming |

## Installation

```bash
pnpm install @arach/vif
```

Or globally:

```bash
pnpm install -g @arach/vif
```

## Quick Start

```bash
# Check system capabilities
vif check

# Screenshot fullscreen
vif shot screenshot.png

# Screenshot an app window
vif shot --app Safari safari.png

# Record video (Ctrl+C to stop)
vif record demo.mp4

# Play a scene (declarative demo automation)
vif play scene.yaml
```

## Agentic Control

Control vif programmatically for AI agent integration.

> **Note:** Start the server first with `vif serve` — all vif-ctl commands require it.

```bash
# Start the automation server (required for vif-ctl)
vif serve

# Control via vif-ctl CLI (in another terminal)
vif-ctl backdrop on                    # Show dark backdrop
vif-ctl cursor show                    # Show animated cursor
vif-ctl cursor move 500 300 0.5        # Move cursor with animation
vif-ctl label show "Recording demo"    # Show teleprompter label
vif-ctl stage clear                    # Clear all overlays

# Headless mode (hide control panel for immersive recording)
vif-ctl panel headless on              # Enable headless mode
vif-ctl panel headless off             # Disable headless mode
```

**Keyboard Shortcuts:**
- `Escape` — Exit headless mode + clear all overlays
- `⌃⌥⌘V` — Toggle headless mode
- `⇧⌘R` — Stop recording
- `⇧⌘X` — Clear stage

**MCP Server** for Claude Code:

Add to `~/.claude/claude_desktop_config.json` or `settings.json`:
```json
{
  "mcpServers": {
    "vif": {
      "command": "vif-mcp"
    }
  }
}
```

Available MCP tools:
- `vif_cursor_show/hide/move/click` - Cursor overlay control
- `vif_label_show/hide/update` - Label/caption overlays
- `vif_camera_show/hide/set` - Presenter camera overlay
- `vif_backdrop_show/hide` - Background dimming
- `vif_viewport_set/show/hide` - Viewport masking
- `vif_keys_show/hide` - Keyboard shortcut display
- `vif_browser_*` - Chrome automation (launch, navigate, click, type, etc.)
- `vif_observe` - Get interactive elements on page
- `vif_screenshot` - Capture screenshots

## Browser Automation

Control Chrome via Chrome DevTools Protocol (CDP):

```typescript
import { createVif } from '@arach/vif'

const vif = createVif()

// Launch Chrome and navigate
await vif.launch('https://example.com')

// Find interactive elements on the page
const elements = await vif.observe({ format: 'clickable-only' })

// Click an element
await vif.click('button.submit')

// Type into an input
await vif.type('input[name="email"]', 'user@example.com')

// Extract data
const data = await vif.extract({
  title: 'h1',
  links: 'a.nav-link'
})

await vif.close()
```

**CLI usage:**
```bash
# Via MCP tools when vif-mcp is running
vif_browser_launch --url "https://example.com"
vif_browser_click --selector "button.submit"
vif_browser_type --text "Hello world"
vif_observe --format clickable
vif_screenshot
```

## Camera Overlay

Show a presenter camera overlay during recordings:

```bash
vif-ctl camera show --position bottom-right --size 150
vif-ctl camera set --position top-left --size large
vif-ctl camera hide
```

**Positions:** `auto`, `top-left`, `top-right`, `bottom-left`, `bottom-right`
**Sizes:** `small` (100px), `medium` (150px), `large` (200px), or a number

In Scene DSL:
```yaml
sequence:
  - camera.show: { position: bottom-right, size: medium }
  - cursor.moveTo: { x: 500, y: 300 }
  - camera.hide: {}
```

## Scenes

Define demo sequences declaratively in YAML:

```yaml
scene:
  name: My App Demo
  mode: draft    # 'draft' for iteration, 'final' for production

stage:
  backdrop: true
  viewport:
    padding: 10

sequence:
  - wait: 500ms
  - record: start
  - label.show: "Welcome to the demo"
  - cursor.show: {}
  - click: sidebar.home           # Click named target
  - click: { x: 500, y: 300 }     # Or explicit coordinates
  - input.type:
      text: "Hello world"
      delay: 0.03
  - record: stop
```

Then play:

```bash
vif play demo.yaml              # Run the scene
vif play --validate demo.yaml   # Validate without running
vif play --watch demo.yaml      # Re-run on file changes
```

### Using Without SDK (Coordinate Mode)

You can automate **any** macOS app using explicit coordinates — no SDK integration required:

```yaml
scene:
  name: Finder Demo
  mode: draft

stage:
  backdrop: true

sequence:
  - wait: 500ms
  - cursor.show: {}
  - cursor.moveTo: { x: 100, y: 200, duration: 0.3 }
  - cursor.click: {}
  - input.type:
      text: "Hello"
      delay: 0.03
  - keys.show:
      keys: ["cmd", "c"]
      press: true
```

**Finding coordinates:**
1. Use `vif-ctl cursor show` to display the cursor
2. Move your mouse to the target position
3. Note the coordinates from the control panel

For apps you control, integrate the **VifTargets SDK** for semantic target names instead of coordinates. See [Integration Guide](INTEGRATION.md).

## CLI Usage

```bash
# List all visible windows
vif windows

# Screenshot fullscreen
vif shot screenshot.png

# Screenshot an app window
vif shot --app Safari safari.png

# Screenshot by window ID
vif shot --window 12345 window.png

# Record video (Ctrl+C to stop)
vif record demo.mp4

# Record for specific duration
vif record --duration 10 demo.mp4

# Convert video to GIF
vif gif demo.mp4 demo.gif --width 600 --fps 15

# Optimize video for web
vif optimize raw.mov web-ready.mp4 --width 1280

# Take management
vif take screenshot --name hero-shot
vif take list
```

## Library Usage

```typescript
import {
  getWindows,
  screenshot,
  screenshotApp,
  startRecording,
  recordVideo,
  convertVideo,
  videoToGif,
  activateApp
} from '@arach/vif';

// List windows
const windows = getWindows();
console.log(windows);

// Filter by app
const safariWindows = getWindows('Safari');

// Screenshot an app
screenshotApp('Safari', './safari.png');

// Screenshot by window ID
screenshot({
  output: './window.png',
  windowId: 12345,
  noShadow: true
});

// Record video for 10 seconds
await recordVideo({
  output: './demo.mp4',
  duration: 10,
  audio: false
});

// Start recording and stop manually
const recording = startRecording({ output: './demo.mp4' });
// ... do stuff ...
await recording.stop();

// Convert to GIF
videoToGif('./demo.mp4', './demo.gif', {
  width: 480,
  fps: 10
});

// Optimize for web
convertVideo({
  input: './raw.mov',
  output: './web.mp4',
  width: 1280,
  crf: 23,
  noAudio: true
});
```

## Prerequisites

### System Requirements
- **macOS** (uses built-in `screencapture`)
- **Node.js 18+**
- **Xcode Command Line Tools** (for Swift): `xcode-select --install`
- **ffmpeg** (optional, for video processing): `brew install ffmpeg`

### Required Permissions

Grant these in **System Settings → Privacy & Security**:

| Permission | Required For | How to Grant |
|------------|--------------|--------------|
| **Screen Recording** | Screenshots, video capture | Add Terminal + Vif Agent |
| **Accessibility** | Mouse/keyboard automation, overlays | Add Terminal + Vif Agent |
| **Camera** | Presenter camera overlay | Add Vif Agent |

### Optional Setup

For **voice injection** (playing audio through virtual mic):
```bash
brew install blackhole-2ch
```
Then set BlackHole as your app's audio input device.

### Verify Installation
```bash
vif check              # Check system capabilities
vif windows            # Verify window discovery works
vif serve              # Start server (required for vif-ctl)
# In another terminal:
vif-ctl cursor show    # Test automation
```

## Troubleshooting

**"Agent not running" error:**
```bash
# Kill stale processes
pkill -f "vif-agent"
pkill -f "node.*dist"
rm -f /tmp/vif-agent.sock

# Restart
vif serve
```

**Camera not showing:**
- Check System Settings > Privacy > Camera for "Vif Agent"

**Overlays not visible:**
- Check System Settings > Privacy > Accessibility for "Vif Agent"
- Try pressing Escape to clear and re-show

## Development

```bash
# Clone the repo
git clone https://github.com/arach/vif
cd vif

# Install dependencies
pnpm install

# Build everything (TypeScript + Swift agent)
pnpm build

# Start the server
vif serve
# or: node dist/cli.js serve

# In another terminal, test commands
vif-ctl cursor show
vif-ctl cursor move 500 300 0.5
```

### Key Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | Main CLI entry (`vif` command) |
| `src/ctl.ts` | Control CLI (`vif-ctl` command) |
| `src/server.ts` | WebSocket server, routes to agent |
| `src/agent-client.ts` | TypeScript client for vif-agent |
| `src/agent/main.swift` | Swift agent (overlays, recording) |
| `src/mcp/server.ts` | MCP server for Claude Code |
| `src/dsl/parser.ts` | Scene YAML parser |
| `src/dsl/runner.ts` | Scene executor |

## API Reference

### Window Functions

- `getWindows(appName?)` - Get all visible windows, optionally filtered by app
- `findWindow(appName)` - Find first window matching app name
- `activateApp(appName)` - Bring an app to the front

### Screenshot Functions

- `screenshot(options)` - Capture screenshot with full options
- `screenshotApp(appName, output, options?)` - Screenshot an app window
- `screenshotFullscreen(output)` - Capture entire screen
- `quickShot(prefix?)` - Quick screenshot with auto filename

### Video Functions

- `startRecording(options)` - Start recording, returns handle to stop
- `recordVideo(options)` - Record for specific duration

### Processing Functions

- `convertVideo(options)` - Convert/process video
- `optimizeForWeb(input, output, maxWidth?)` - Optimize for web delivery
- `videoToGif(input, output, options?)` - Create GIF from video
- `hasFFmpeg()` - Check if ffmpeg is available

## Built with Vif

- [Speakeasy](https://speakeasy.arach.dev) - Text-to-speech library landing page

## License

MIT
