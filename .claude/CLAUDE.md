# Vif Project Guide

## Quick Start

```bash
# 1. Build everything
pnpm build

# 2. Start the automation server (REQUIRED for overlays)
vif serve
# or: node dist/cli.js serve

# 3. Control overlays (in another terminal)
vif-ctl cursor show
vif-ctl cursor move 500 300 0.5
vif-ctl camera show --position bottom-right --size 150

# 4. Start the dashboard (optional, for visual editing)
cd web && pnpm dev
# Opens at http://localhost:5180
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Entry Points                             │
├─────────────────┬─────────────────┬─────────────────────────┤
│  vif            │  vif-ctl        │  vif-mcp                │
│  (dist/cli.js)  │  (dist/ctl.js)  │  (dist/mcp/server.js)   │
│  Main CLI       │  Control CLI    │  MCP Server             │
└────────┬────────┴────────┬────────┴────────┬────────────────┘
         │                 │                  │
         │                 │                  │
┌────────┴────────────────┴──────────────────┴────────────────┐
│              vif-dashboard (React/Vite)                      │
│                   web/ → http://localhost:5180               │
│  - Scene editor with live preview                            │
│  - Sound library management                                  │
│  - Video browser and post-production                         │
│  - Real-time connection status                               │
└─────────────────────────────────────────────────────────────┘
         │                 │                  │
         │  serve          │  commands        │  MCP tools
         ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              WebSocket Server (ws://localhost:7850)          │
│                     src/server.ts                            │
│  - Spawns vif-agent on start                                │
│  - Routes commands to agent via Unix socket                  │
│  - HTTP server on :7852 for video streaming                  │
└────────────────────────────┬────────────────────────────────┘
                             │ Unix socket (/tmp/vif-agent.sock)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                vif-agent (Swift macOS app)                   │
│                 src/agent/main.swift                         │
│  - Overlay windows (cursor, label, keys, typer, camera)     │
│  - Screen recording                                          │
│  - Control panel UI                                          │
│  - Requires Accessibility + Screen Recording permissions     │
└─────────────────────────────────────────────────────────────┘
```

## Component Communication

| From | To | Protocol | Port/Path |
|------|----|----------|-----------|
| vif-ctl | Server | WebSocket | ws://localhost:7850 |
| MCP | Server | WebSocket | ws://localhost:7850 |
| Dashboard | Server | WebSocket | ws://localhost:7850 |
| Server | Agent | Unix Socket | /tmp/vif-agent.sock |
| Server | HTTP clients | HTTP | http://localhost:7852 |

## Key Files

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
| `web/` | Dashboard (React/Vite app) |
| `web/src/routes/` | Dashboard pages (scenes, sounds, videos, post-production) |
| `web/src/lib/vif-client.ts` | WebSocket client for dashboard |

## Startup Flow

1. `vif serve` starts `JsonRpcServer` in server.ts
2. Server creates `VifAgent` instance (agent-client.ts)
3. Agent client launches `Vif Agent.app` via `open -a`
4. Agent creates Unix socket at `/tmp/vif-agent.sock`
5. Server connects to socket
6. WebSocket server listens on port 7850
7. HTTP server starts on port 7852

## Troubleshooting

**"Agent not running" error:**
```bash
# Kill stale processes
pkill -f "vif-agent"
pkill -f "node.*dist"
rm -f /tmp/vif-agent.sock

# If a launchd service is auto-restarting the server, unload it first:
launchctl unload ~/Library/LaunchAgents/com.vif.server.plist 2>/dev/null

# Restart
vif serve
```

**Camera not showing:**
- Check System Settings > Privacy > Camera for "Vif Agent"
- The camera overlay requires camera permission

**Overlays not visible:**
- Check System Settings > Privacy > Accessibility for "Vif Agent"
- Try pressing Escape to clear and re-show

## Common Commands

```bash
# Server
vif serve                    # Start server (required!)

# Cursor
vif-ctl cursor show
vif-ctl cursor hide
vif-ctl cursor move X Y DURATION

# Camera (presenter overlay)
vif-ctl camera show --position bottom-right --size 150
vif-ctl camera set --position top-left --size large
vif-ctl camera hide
# Positions: auto, top-left, top-right, bottom-left, bottom-right
# Sizes: small (100px), medium (150px), large (200px), or number
# Via WebSocket: {"action":"camera.show","position":"auto","size":150}

# Labels
vif-ctl label show "Text"
vif-ctl label hide

# Stage
vif-ctl stage clear          # Clear all overlays
vif-ctl backdrop on/off

# Scenes
vif play scene.yaml          # Run a scene
vif play --watch scene.yaml  # Watch mode
```

## Scene DSL

```yaml
scene:
  name: Demo
  mode: draft
  presenter:          # NEW: Camera overlay
    enabled: true
    position: auto    # Smart positioning
    size: medium

sequence:
  - cursor.show: {}
  - camera.show: { position: bottom-right }
  - cursor.moveTo: { x: 500, y: 300 }
  - camera.hide: {}
```

## Ports

| Port | Service |
|------|---------|
| 5180 | Dashboard (vif-dashboard) |
| 7850 | WebSocket server (main) |
| 7851 | VifTargets SDK (apps) |
| 7852 | HTTP video streaming |

## Dashboard

The vif dashboard (`web/`) provides a visual interface for managing demos:

```bash
cd web && pnpm dev
# Opens at http://localhost:5180
```

**Features:**
- **Dashboard** - Overview and connection status
- **Scenes** - Edit scene YAML files with syntax highlighting and live preview
- **Sounds** - Browse and manage the sound library for demos
- **Videos** - View recorded videos and manage outputs
- **Post-Production** - Timeline editor, scene diffs, and finishing tools

The dashboard connects to the vif server via WebSocket (port 7850) and shows real-time connection status in the sidebar.
