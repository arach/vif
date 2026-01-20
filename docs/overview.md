---
title: Overview
description: Screen capture and browser automation for macOS, designed for AI agents
order: 1
---

# Overview

**vif** is a screen capture and browser automation toolkit for macOS, designed specifically for AI agents and LLMs.

## What is vif?

vif combines three capabilities:

1. **Screen Capture** - Screenshots, video recording, and GIF creation using native macOS tools
2. **Browser Automation** - Chrome automation via Chrome DevTools Protocol (CDP)
3. **Demo Automation** - Visual overlays (cursor, labels, keys) for recording polished demos

Everything is designed to work with AI agents: predictable CLI output, MCP tools for Claude Code, and a Stagehand-style API for programmatic control.

## Key Features

### Screen Capture
- Screenshot windows, regions, or fullscreen
- Video recording with optional audio
- Convert to GIF, optimize for web
- Take management (versioned screenshots)

### Browser Automation
- Navigate, click, type, scroll in Chrome
- Extract structured data from pages
- Observe DOM elements with accessibility info
- Stagehand-compatible API (`vif.observe()`, `vif.act()`)

### Demo Recording
- Animated cursor overlay
- Keyboard shortcut display
- Text labels/teleprompter
- Viewport highlighting
- Backdrop dimming
- Camera/presenter overlay
- Zoom effects (crop and lens styles)
- Multi-channel audio with post-processing

### AI Agent Integration
- MCP server for Claude Code (`vif-mcp`)
- CLI designed for LLM tool use (`vif`, `vif-ctl`)
- Scene DSL for declarative automation

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your AI Agent                         │
│                (Claude Code, etc.)                       │
└───────────────────────┬─────────────────────────────────┘
                        │ MCP / CLI
┌───────────────────────┴─────────────────────────────────┐
│                      vif                                 │
├─────────────────┬─────────────────┬─────────────────────┤
│  Screen Capture │ Browser (CDP)   │   Demo Overlays     │
│  - screencapture│ - navigate      │   - cursor          │
│  - ffmpeg       │ - click/type    │   - labels          │
│  - native APIs  │ - extract       │   - keys            │
└─────────────────┴─────────────────┴─────────────────────┘
```

## Quick Links

- [Quickstart](./quickstart.md) - Get started in 5 minutes
- [Browser Automation](./browser.md) - Chrome automation via CDP
- [Scene DSL](./scenes.md) - Declarative demo automation
- [MCP Tools](./mcp.md) - Claude Code integration
