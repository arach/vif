# Vif

**Declarative Screen Capture** — Agentic asset generation for macOS.

![Vif OG](landing/public/og-image.png)

Screen capture built for AI agents and LLMs. Declarative scenes, CLI-native, everything is a file.

## Features

- **Agent-First**: Designed for LLM tool use with predictable, parseable output
- **Declarative Scenes**: Define demo sequences in YAML with the Scene DSL
- **Agentic Control**: `vif-ctl` CLI and MCP server for AI agent integration
- **Live Control Panel**: Expandable layer viewer showing active stage elements
- **Headless Mode**: Full immersive recording without UI overlay
- **Window Discovery**: Find windows by app name with precise window IDs
- **Screenshot Capture**: Capture windows, regions, or fullscreen
- **Video Recording**: Record screen with optional audio
- **Video Processing**: Convert, optimize, and create GIFs (requires ffmpeg)

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

**MCP Server** for Claude and AI agents:
```bash
vif-mcp  # Start MCP server for native tool access
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
| **Screen Recording** | Screenshots, video capture | Add Terminal (or your IDE) |
| **Accessibility** | Mouse/keyboard automation | Add Terminal (or your IDE) |

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
vif serve &            # Start server (required for vif-ctl)
vif-ctl cursor show    # Test automation
```

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
