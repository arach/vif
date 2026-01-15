# Vif Z-Layer Architecture

The scene manager uses a layered window system to compose the recording environment.

## Layer Stack

```
Z5  Control Tools       Recording controls, status - always on top
Z4  Viewport Frame      Recording boundary guide with mask filter
Z3  HUD                 Dynamic overlays (coordinates, labels, etc.)
Z2  Application         The app(s) being demoed
Z1  Backdrop            Full-bleed canvas (black, color, gradient, webview)
```

## Layers Explained

### Z1 - Backdrop
The foundation layer. First thing visible when entering record mode.
- Can be: solid color, gradient, webview with widgets, transparent
- Covers the entire screen
- Everything else appears above it

### Z2 - Application
The app being demoed. Could be one app or multiple apps (for collaboration/sync demos).
- Normal app windows at standard level
- Positioned and sized by the scene

### Z3 - HUD
Dynamic information overlays driven by the scene.
- Debug coordinates
- Labels and callouts
- Could be multiple HUDs
- Useful contextual information

### Z4 - Viewport Frame
Visual feedback showing what's being recorded.
- Draws the recording boundary
- Mask/filter outside the viewport
- Helps user understand the "physicality" of the video

### Z5 - Control Tools
Our control panel and recording tools.
- Stop recording, status indicators
- Always accessible above everything else

## Entry Sequence

Layers appear in sequence with configurable timing:
Z1 → Z2 → Z4 → Z5 (Z3 HUD shown on-demand during scene)

Quick, choreographed entrance ("pew pew").

### Configuration

```yaml
stage:
  backdrop: true
  viewport: { padding: 10 }

  # Simple: same timing for all layers (ms)
  entry: 300  # 300ms per layer = ~1.2s total

  # Or detailed per-layer control:
  entry:
    timing: 300  # default
    layers:
      backdrop: 200   # Z1 - quick fade in
      app: 400        # Z2 - let window settle
      viewport: 300   # Z4 - frame appears
      controls: 100   # Z5 - ready to go
```

### Default Timing

When no entry config is specified, each layer gets 150ms (total ~600ms for the 4 main layers). Fast and snappy.

## Design Principles

- **Backdrop first**: Black canvas appears before anything else
- **Intentional layering**: Each layer has a clear purpose
- **Composable**: Layers can be shown/hidden independently
- **Extensible**: Each layer can contain multiple elements
