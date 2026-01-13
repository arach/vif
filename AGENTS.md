# Vif - Agent Instructions

Declarative screen capture and demo automation for macOS. Built for AI agents and LLMs.

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

# Build Swift agent (required for automation)
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

For programmatic/imperative control (not YAML scenes):

```bash
# Start automation server
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

## Architecture

```
src/
├── cli.ts           # CLI entry point
├── ctl.ts           # vif-ctl imperative CLI
├── server.ts        # WebSocket server for agent communication
├── agent-client.ts  # Communicates with Swift agent
├── mcp/
│   └── server.ts    # MCP server for AI agents
├── dsl/
│   ├── parser.ts    # YAML scene parser
│   ├── runner.ts    # Executes scene sequences
│   └── targets.ts   # Target resolution
└── agent/
    └── main.swift   # macOS automation agent (overlays, automation)
```

**Key components:**
- **Server** (`server.ts`): Hosts WebSocket for browser-based recording UI
- **Agent** (`agent/main.swift`): Swift process that executes macOS automation
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

## Detailed Integration Guide

For comprehensive VifTargets SDK implementation (Swift code, SwiftUI modifiers, coordinate conversion, voice injection setup), see:

- **Claude Code users**: `.claude/skills/vif/SKILL.md` (auto-discovered)
- **All agents**: `docs/vif-targets-integration.md`

These guides include complete Swift implementations, coordinate system conversion, and troubleshooting.
