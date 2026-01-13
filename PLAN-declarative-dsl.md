# Vif Declarative DSL - Implementation Plan

## Overview

Transform vif from imperative JavaScript demos to a declarative YAML-based DSL for video production. The goal is semantic, readable scene descriptions that can drop down to explicit control when needed.

## Core Concepts

### 1. Scene
The top-level container. A scene produces one video/recording.

```yaml
scene:
  name: Talkie Walkthrough
  output: talkie-demo.mp4
  mode: draft | final
```

### 2. Stage
The visual environment - backdrop, viewport, app positioning.

```yaml
stage:
  backdrop: true | gradient | color
  viewport:
    app: Talkie           # Auto-fit to app window
    padding: 10           # Optional padding around app
    # OR explicit bounds:
    x: 100
    y: 100
    width: 1280
    height: 720
```

### 3. App
The target application being demoed. Has a type that determines how we interact with it.

```yaml
app:
  type: native           # macOS native app
  name: Talkie
  window:
    width: 1200
    height: 800
    center: true
```

Future app types:
- `native` - macOS apps (AppleScript, Accessibility API)
- `react` - Local React dev server
- `webpage` - External URLs (Puppeteer-style)
- `electron` - Electron apps

### 4. Views
Named locations/screens within an app. Define once, reference by name.

```yaml
views:
  sidebar:
    region: left 200px
    items:
      - home: { y: 120 }
      - drafts: { y: 160 }
      - all-memos: { y: 200 }
      - workflows: { y: 320 }

  content:
    region: right of sidebar

  toolbar:
    region: top 50px
```

### 5. Actions
What happens in the scene. Cursor movements, clicks, keyboard, waits.

```yaml
actions:
  # High-level semantic
  - navigate: sidebar → home → drafts → all-memos

  # Mid-level explicit
  - click: sidebar.home
  - wait: 600ms
  - click: sidebar.drafts

  # Low-level coordinates
  - cursor.moveTo: { x: 100, y: 120, duration: 0.4 }
  - cursor.click
```

### 6. Labels (Teleprompter)
Overlays rendered in the backdrop, visible during production but outside the recorded viewport.

```yaml
labels:
  scene-info:
    position: top          # top | bottom | x,y coordinates
    text: "Scene 1: Navigation"
    style:
      font: system
      size: 18px
      color: white
      background: rgba(0,0,0,0.85)

# Use in actions:
actions:
  - label: scene-info
    text: "Scene 1: Exploring the Sidebar"
  - click: sidebar.home
  - label.update: "Click each item..."
  - label.hide
```

### 7. Components
Reusable pieces defined in separate files.

```yaml
# components/intro.yaml
type: sequence
actions:
  - label: "Starting demo..."
  - wait: 1s
  - cursor.show

# main scene
actions:
  - use: ./components/intro.yaml
  - click: sidebar.home
  - use: ./components/outro.yaml
```

---

## File Structure

```
demos/
├── talkie-demo.yaml          # Scene definition
├── components/
│   ├── intro.yaml
│   └── outro.yaml
└── apps/
    └── talkie.yaml           # App definition with views
```

---

## Example: Complete Talkie Demo

```yaml
# talkie-demo.yaml
scene:
  name: Talkie Navigation Demo
  output: draft

import:
  - ./apps/talkie.yaml

stage:
  backdrop: gradient
  viewport:
    app: talkie
    padding: 10

labels:
  teleprompter:
    position: bottom
    style: { background: "rgba(0,0,0,0.9)" }

sequence:
  - label: teleprompter
    text: "Scene 1: Navigate the sidebar"

  - record: start

  - cursor.show

  - navigate:
      through: sidebar
      items: [home, drafts, all-memos, workflows]
      wait: 600ms

  - click: content.center
  - wait: 500ms

  - click: sidebar.drafts

  - cursor.hide

  - record: stop

  - label.hide
```

```yaml
# apps/talkie.yaml
app:
  type: native
  name: Talkie
  window:
    width: 1200
    height: 800
    center: true

views:
  sidebar:
    region: { x: 0, width: 200 }
    items:
      home: { y: 120 }
      drafts: { y: 160 }
      all-memos: { y: 200 }
      workflows: { y: 320 }

  content:
    region: { x: 200, width: stretch }
    positions:
      center: { x: 50%, y: 50% }
```

---

## Implementation Steps

### Phase 1: Parser Foundation
1. YAML parser with schema validation
2. Basic scene structure (stage, app, sequence)
3. Simple actions: cursor.show, cursor.hide, click, wait
4. Output: Generates WebSocket commands to vif server

### Phase 2: Views & Targets
1. App definitions with named views
2. Click targets by name (sidebar.home)
3. Region-based positioning
4. Import external app definitions

### Phase 3: Labels & Overlays
1. Label definitions with styling
2. Render to web backdrop via stage.render
3. Label actions: show, update, hide
4. Position: top, bottom, x/y

### Phase 4: High-Level Actions
1. `navigate: sidebar → home → drafts` syntax
2. Automatic wait insertion
3. Sequence grouping
4. Loops and conditionals (maybe)

### Phase 5: Components & Reuse
1. External component files
2. `use:` directive
3. Parameters/variables
4. Component library

### Phase 6: Multi-App & Advanced
1. Multiple app types (react, webpage)
2. Multi-window scenes
3. Transitions between apps
4. Audio/narration sync

---

## CLI Usage

```bash
# Run a scene
vif play demos/talkie-demo.yaml

# Run in draft mode (quick iteration)
vif play demos/talkie-demo.yaml --draft

# Validate without running
vif validate demos/talkie-demo.yaml

# Watch mode - re-run on file changes
vif play demos/talkie-demo.yaml --watch
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    YAML Scene File                       │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Scene Parser                          │
│  - Validate schema                                       │
│  - Resolve imports                                       │
│  - Expand high-level actions                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Scene Runner                           │
│  - Connect to vif server                                 │
│  - Execute action sequence                               │
│  - Handle timing/waits                                   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Vif Server                             │
│  - WebSocket JSON-RPC                                    │
│  - Routes to Swift agent                                 │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Swift Agent                            │
│  - Cursor overlay                                        │
│  - Viewport mask                                         │
│  - Web backdrop (labels)                                 │
│  - Screen recording                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Start Simple

For Phase 1, the minimum viable scene:

```yaml
scene:
  name: Simple Test

app:
  name: Finder
  window: { width: 800, height: 600, center: true }

stage:
  backdrop: true
  viewport: { app: auto, padding: 10 }

sequence:
  - record: start
  - cursor.show
  - click: { x: 100, y: 150 }
  - wait: 500ms
  - click: { x: 100, y: 200 }
  - wait: 500ms
  - cursor.hide
  - record: stop
```

This is achievable with:
1. YAML parser
2. WebSocket client (existing)
3. Command mapping to existing vif actions

Then iterate toward semantic goodness.
