# Vif - Agent Instructions

Declarative screen capture and demo automation for macOS. Built for AI agents and LLMs.

> **Terminology:** "Agent" in this doc refers to AI coding agents (Claude, Cursor, etc.). The Swift process that performs macOS automation is called the "automation daemon" (`src/agent/main.swift`).

## Project Overview

Vif is a CLI tool and library for creating automated demo recordings. It provides:

- **Declarative DSL**: Define demo sequences in YAML scene files
- **App automation**: Click, type, navigate through apps
- **Screen capture**: Record video, screenshots
- **Voice injection**: Play audio through virtual microphones for voice-enabled app demos
- **VifTargets SDK**: Protocol for apps to expose their UI elements for automation

## Setup Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Build automation daemon (required for overlays/clicks)
pnpm build:agent
```

## Build and Test

```bash
# Build everything
pnpm build && pnpm build:agent

# Run the CLI
./dist/cli.js --help

# Run a demo scene
./dist/cli.js play demos/scenes/your-scene.yaml
```

## Agentic Control

For programmatic/imperative control (not YAML scenes).

> **Important:** `vif serve` must be running for vif-ctl commands to work.

```bash
# Start automation server (required - run in separate terminal)
vif serve

# Control via vif-ctl CLI
vif-ctl backdrop on                 # Show backdrop
vif-ctl cursor show                 # Show cursor
vif-ctl cursor move 500 300 0.5     # Move cursor
vif-ctl label show "Demo text"      # Show label
vif-ctl stage clear                 # Clear all

# Headless mode (hide control panel)
vif-ctl panel headless on           # Enter headless
vif-ctl panel headless off          # Exit headless

# MCP server for Claude/AI agents
vif-mcp
```

**Keyboard Shortcuts:**
- `Escape` — Exit headless + clear all
- `⌃⌥⌘V` — Toggle headless mode
- `⇧⌘R` — Stop recording
- `⇧⌘X` — Clear stage

**MCP Tools Reference:**

| Tool | Description |
|------|-------------|
| `vif_cursor_show` | Show animated cursor overlay |
| `vif_cursor_hide` | Hide cursor |
| `vif_cursor_move` | Move cursor (x, y, duration) |
| `vif_cursor_click` | Click animation at current position |
| `vif_label_show` | Show caption (text, position) |
| `vif_label_update` | Update caption text |
| `vif_label_hide` | Hide caption |
| `vif_backdrop_show` | Show dark backdrop |
| `vif_backdrop_hide` | Hide backdrop |
| `vif_stage_center` | Center app window (app, width, height) |
| `vif_stage_clear` | Clear all overlays |
| `vif_viewport_set` | Set visible region (x, y, width, height) |
| `vif_viewport_show` | Show viewport mask |
| `vif_viewport_hide` | Hide viewport mask |
| `vif_record_indicator` | Show/hide recording dot (show: bool) |
| `vif_keys_show` | Show keyboard shortcut (keys[], press) |
| `vif_keys_hide` | Hide keys overlay |
| `vif_typer_type` | Animated typing (text, style, delay) |
| `vif_typer_hide` | Hide typer |

## Architecture

```
src/
├── cli.ts           # CLI entry point
├── ctl.ts           # vif-ctl imperative CLI
├── server.ts        # WebSocket server for control commands
├── agent-client.ts  # Communicates with automation daemon
├── mcp/
│   └── server.ts    # MCP server for AI agents
├── dsl/
│   ├── parser.ts    # YAML scene parser
│   ├── runner.ts    # Executes scene sequences
│   └── targets.ts   # Target resolution
└── agent/
    └── main.swift   # Automation daemon (overlays, clicks, keyboard)
```

**Key components:**
- **Server** (`server.ts`): Hosts WebSocket for control communication
- **Automation Daemon** (`agent/main.swift`): Swift process that executes macOS automation (overlays, clicks, keyboard). Note: "agent" in file paths refers to this daemon, not AI agents.
- **Runner** (`dsl/runner.ts`): Interprets scene YAML and dispatches actions

## Scene DSL Reference

Scenes are YAML files that define automated demo sequences:

```yaml
scene:
  name: Demo Name
  mode: draft  # or 'final'

# Import app definitions
import:
  - ./apps/myapp.yaml

# Stage configuration
stage:
  backdrop: true
  viewport:
    padding: 10

# Demo sequence
sequence:
  - wait: 500ms
  - record: start
  - click: sidebar.home          # Navigation target (uses HTTP API)
  - click: save-button           # Click target (uses coordinates)
  - input.type:                  # Type text
      text: "Hello world"
      delay: 0.03
  - voice.play: ./audio/cmd.wav  # Play audio through virtual mic
  - record: stop
```

## App Integration (VifTargets)

Apps expose UI elements via HTTP on port 7851:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/vif/targets` | GET | Returns all navigation and click targets |
| `/vif/navigate` | POST | Triggers navigation (body: `{"section": "name"}`) |
| `/vif/state` | GET | Returns current app state |

**Target types:**
- `nav.*` - Navigation targets (use HTTP API, more reliable)
- Click targets - Screen coordinates for buttons/fields

## Code Style

- TypeScript with strict mode
- Use `pnpm` for package management
- Gitmoji in commit messages (e.g., `✨ Add feature`, `🐛 Fix bug`)
- No co-author footers in commits

## Key Files

- `src/dsl/parser.ts` - Scene YAML types and parser
- `src/dsl/runner.ts` - Scene execution logic
- `src/agent/main.swift` - macOS automation commands
- `demos/scenes/` - Example scene files
- `demos/scenes/apps/` - App definition files

## Integration Guide

For comprehensive integration documentation, see **[INTEGRATION.md](INTEGRATION.md)** — the single source of truth covering:

- VifTargets SDK implementation (Swift code)
- SwiftUI modifiers for click targets
- Coordinate system conversion
- Scene DSL reference
- Voice injection setup
- Troubleshooting
