---
title: Scene DSL
description: Declarative demo automation with YAML scenes
order: 4
---

# Scene DSL

Define demo sequences declaratively in YAML. Scenes automate cursor movement, clicks, typing, overlays, and recording.

## Quick Example

```yaml
scene:
  name: My App Demo
  mode: draft    # 'draft' = overwrite ~/.vif/draft.mp4, 'final' = timestamped

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
```

Run with:
```bash
vif play demo.yaml              # Execute scene
vif play --validate demo.yaml   # Validate without running
vif play --watch demo.yaml      # Re-run on file changes
vif play --verbose demo.yaml    # Show detailed logging
```

## Scene Structure

### `scene` - Metadata

```yaml
scene:
  name: Demo Name           # Display name
  mode: draft               # draft | final
  output: my-recording      # Custom output filename (final mode only)
```

### `app` - Target Application

```yaml
app:
  name: Safari              # macOS app name
  window:
    width: 1200             # Desired window width
    height: 800             # Desired window height
```

The app window will be centered on screen at the specified size.

### `stage` - Visual Setup

```yaml
stage:
  backdrop: true            # Dim everything outside viewport
  viewport:
    padding: 10             # Padding around app window
```

## Actions

### Cursor Actions

```yaml
# Show/hide cursor overlay
- cursor.show: {}
- cursor.hide: {}

# Move cursor (coordinates relative to app window)
- cursor.moveTo: { x: 500, y: 300, duration: 0.3 }

# Click at current position
- cursor.click: {}

# Combined click action
- click: { x: 500, y: 300 }
- click: sidebar.home       # Named target (see Views)
```

### Timing

```yaml
- wait: 500ms
- wait: 2s
- wait: 1.5s
```

### Recording

```yaml
- record: start
# ... actions ...
- record: stop
```

In `draft` mode, recording saves to `~/.vif/draft.mp4` (overwritten each run).
In `final` mode, recordings are timestamped and saved to `~/.vif/recordings/`.

### Labels

```yaml
# Show label at top/bottom of screen
- label.show: "Welcome to the demo"
- label.update: "New text"
- label.hide: {}

# With position
- label:
    text: "Caption here"
    position: bottom
```

### Keyboard

```yaml
# Show keyboard shortcut overlay
- keys.show:
    keys: ["cmd", "shift", "p"]
    press: true              # Animate keypress

- keys.hide: {}

# Actually press keys (sends to app)
- input.keys: ["cmd", "c"]
```

### Typing

```yaml
# Visual typing overlay (doesn't send keys)
- typer.type:
    text: "Hello world"
    style: default           # default | terminal | code
    delay: 0.05              # Seconds between characters

- typer.hide: {}

# Actual keyboard typing (sends to app)
- input.type:
    text: "Hello world"
    delay: 0.03
```

### Audio

```yaml
# Play audio through virtual microphone
- voice.play: audio/intro.mp3
- voice.play:
    file: audio/intro.mp3
    wait: true               # Wait for playback to finish

- voice.stop: {}

# Multi-channel audio
- audio.play:
    file: music/background.mp3
    channel: 2
    fadeIn: 1s
    loop: true

- audio.volume:
    channel: 2
    volume: 0.5
    duration: 500ms

- audio.stop:
    channel: 2
    fadeOut: 2s
```

### Navigation

```yaml
# Navigate through multiple items
- navigate:
    through: sidebar
    items: [home, settings, profile]
    wait: 400ms              # Wait between clicks
```

## Views

Define reusable click targets within your scene:

```yaml
views:
  sidebar:
    region: { x: 0, width: 200 }
    items:
      - home: { y: 100 }
      - settings: { y: 140 }
      - profile: { y: 180 }

  toolbar:
    positions:
      save: { x: 100, y: 50 }
      undo: { x: 140, y: 50 }

sequence:
  - click: sidebar.home
  - click: toolbar.save
```

## Labels Definition

Define reusable labels:

```yaml
labels:
  intro:
    text: "Welcome to the demo"
    position: top

  outro:
    text: "Thanks for watching!"
    position: bottom

sequence:
  - label: intro
  - wait: 2s
  - label: outro
```

## VifTargets SDK Integration

For first-party apps, integrate the VifTargets SDK to expose semantic targets:

```swift
// In your SwiftUI app
Button("Submit") { ... }
  .vifTarget("submit-btn")
```

Then reference in scenes:
```yaml
- click: submit-btn    # Resolved via SDK at runtime
```

The SDK exposes targets via HTTP on port 7851, which vif queries during scene execution.

## Audio Configuration

Configure multi-channel audio mixing:

```yaml
audio:
  channels:
    1:  # Voice channel
      output: virtual-mic    # Route to BlackHole for app input
      volume: 1.0
    2:  # Music channel
      output: post-mix       # Mix in post-processing
      volume: 0.3

sequence:
  - audio.play:
      file: voice/intro.mp3
      channel: 1
  - audio.play:
      file: music/background.mp3
      channel: 2
      loop: true
```

## Full Example

```yaml
scene:
  name: Talkie Demo
  mode: draft

app:
  name: Talkie
  window:
    width: 1280
    height: 800

stage:
  backdrop: true
  viewport:
    padding: 10

views:
  sidebar:
    region: { x: 0, width: 200 }
    items:
      - voices: { y: 100 }
      - settings: { y: 300 }

labels:
  intro:
    text: "Welcome to Talkie"
    position: top

sequence:
  - wait: 500ms
  - record: start
  - cursor.show: {}
  - label: intro
  - wait: 1s

  - cursor.moveTo: { x: 400, y: 300, duration: 0.4 }
  - cursor.click: {}

  - input.type:
      text: "Hello, this is a demo"
      delay: 0.03

  - keys.show:
      keys: ["cmd", "return"]
      press: true
  - input.keys: ["cmd", "return"]
  - wait: 500ms
  - keys.hide: {}

  - navigate:
      through: sidebar
      items: [voices, settings]
      wait: 800ms

  - label.hide: {}
  - cursor.hide: {}
  - record: stop
```

## CLI Reference

```bash
vif play <scene.yaml>           # Run scene
vif play --validate <scene>     # Validate only
vif play --watch <scene>        # Watch for changes
vif play --verbose <scene>      # Detailed logging
vif play --dry-run <scene>      # Show actions without executing
```
