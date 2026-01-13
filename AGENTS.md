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

## Architecture

```
src/
├── cli.ts           # CLI entry point
├── server.ts        # WebSocket server for browser connection
├── agent-client.ts  # Communicates with Swift agent
├── dsl/
│   ├── parser.ts    # YAML scene parser
│   ├── runner.ts    # Executes scene sequences
│   └── targets.ts   # Target resolution
└── agent/
    └── main.swift   # macOS automation agent (AppleScript, accessibility)
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
