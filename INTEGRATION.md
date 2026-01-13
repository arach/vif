# Vif Integration Guide

> **Single source of truth** for integrating your macOS app with vif demo automation.

## Overview

Vif automates demo recordings by:
1. Connecting to your app via HTTP (port 7851)
2. Querying available UI targets (navigation sections, clickable elements)
3. Executing scene sequences (click, type, navigate, voice)
4. Recording the screen

**Two integration paths:**

| Path | When to Use | Effort |
|------|-------------|--------|
| **Coordinate-only** | Any macOS app, no code changes | None |
| **VifTargets SDK** | Apps you control, dynamic UI | ~30 min |

## Path 1: Coordinate-Only (No SDK)

Automate **any** macOS app using explicit screen coordinates.

### Scene Example

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

### Finding Coordinates

1. Start the server: `vif serve`
2. Show the cursor: `vif-ctl cursor show`
3. Move your mouse to the target position
4. Note coordinates from the control panel

## Path 2: VifTargets SDK

For apps you control, expose UI elements programmatically.

### Quick Start

1. Add `VifTargets.swift` to your app
2. Call `VifTargets.shared.start()` in AppDelegate
3. Add `.vifTarget("id")` modifiers to track element positions
4. Handle navigation notifications

### VifTargets.swift

```swift
import Cocoa
import Network
import SwiftUI

public final class VifTargets: ObservableObject {
    public static let shared = VifTargets()

    private var clickTargets: [String: () -> NSPoint?] = [:]
    private var listener: NWListener?
    private let port: UInt16 = 7851

    @Published public var currentSection: String = "home"

    // Map your navigation sections
    private let navigationSections: [String: String] = [
        "home": "home",
        "settings": "settings",
        // Add your sections...
    ]

    private init() {}

    // MARK: - Target Registration

    public func register(_ id: String, positionProvider: @escaping () -> NSPoint?) {
        clickTargets[id] = positionProvider
    }

    public func unregister(_ id: String) {
        clickTargets.removeValue(forKey: id)
    }

    // MARK: - HTTP Server

    public func start() {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true

            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }
            listener?.start(queue: .main)
            NSLog("[VifTargets] Listening on port \(port)")
        } catch {
            NSLog("[VifTargets] Failed to start: \(error)")
        }
    }

    public func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: .main)

        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, _, _ in
            guard let self = self,
                  let data = data,
                  let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }

            let response = self.handleRequest(request)
            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func handleRequest(_ request: String) -> String {
        if request.contains("GET /vif/targets") {
            return buildTargetsResponse()
        } else if request.contains("GET /vif/state") {
            return httpJson(["state": ["section": currentSection]])
        } else if request.contains("POST /vif/navigate") {
            if let bodyStart = request.range(of: "\r\n\r\n"),
               let data = request[bodyStart.upperBound...].data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
               let section = json["section"] {
                return navigate(to: section) ? httpJson(["ok": true]) : httpJson(["ok": false])
            }
            return httpJson(["ok": false, "error": "Invalid request"])
        }
        return "HTTP/1.1 404 Not Found\r\n\r\n"
    }

    // MARK: - Navigation

    @discardableResult
    public func navigate(to section: String) -> Bool {
        guard navigationSections[section.lowercased()] != nil else { return false }
        currentSection = section
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .vifNavigate, object: section)
        }
        return true
    }

    // MARK: - Response Building

    private func buildTargetsResponse() -> String {
        var targets: [String: [String: Any]] = [:]

        // Click targets
        for (id, provider) in clickTargets {
            if let point = provider() {
                targets[id] = ["x": Int(point.x), "y": Int(point.y), "type": "click"]
            }
        }

        // Navigation targets
        for (name, _) in navigationSections {
            targets["nav.\(name)"] = ["type": "navigate", "section": name]
        }

        return httpJson(["targets": targets])
    }

    private func httpJson(_ dict: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else {
            return "HTTP/1.1 500 Error\r\n\r\n"
        }
        return "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n\(json)"
    }
}

extension Notification.Name {
    static let vifNavigate = Notification.Name("vifNavigate")
}
```

### AppDelegate Setup

```swift
func applicationDidFinishLaunching(_ notification: Notification) {
    VifTargets.shared.start()
}
```

### Handle Navigation

```swift
struct ContentView: View {
    @State private var selectedSection = "home"

    var body: some View {
        NavigationView { ... }
            .onReceive(NotificationCenter.default.publisher(for: .vifNavigate)) { notification in
                if let section = notification.object as? String {
                    selectedSection = section
                }
            }
    }
}
```

### SwiftUI View Modifier

Track element positions dynamically:

```swift
struct VifTargetModifier: ViewModifier {
    let identifier: String

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geometry in
                    Color.clear.preference(
                        key: FramePreferenceKey.self,
                        value: geometry.frame(in: .global)
                    )
                }
            )
            .onPreferenceChange(FramePreferenceKey.self) { frame in
                VifTargets.shared.register(identifier) {
                    convertToScreenCoordinates(frame: frame)
                }
            }
    }
}

private struct FramePreferenceKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}

extension View {
    public func vifTarget(_ id: String) -> some View {
        modifier(VifTargetModifier(identifier: id))
    }
}
```

Usage:
```swift
Button("Save") { ... }
    .vifTarget("save-button")
```

### Coordinate System Conversion

macOS has three coordinate systems:

| System | Origin | Used By |
|--------|--------|---------|
| SwiftUI `.global` | Window top-left | GeometryReader |
| Cocoa NSWindow | Screen bottom-left | AppKit |
| vif/screencapture | Screen top-left | vif automation |

Conversion function:

```swift
func convertToScreenCoordinates(frame: CGRect) -> NSPoint? {
    guard let window = NSApp.keyWindow ?? NSApp.mainWindow,
          let screen = window.screen ?? NSScreen.main else {
        return nil
    }

    let windowFrame = window.frame

    // SwiftUI global → screen (top-left origin for vif)
    let screenX = windowFrame.origin.x + frame.midX
    let windowTopY = windowFrame.origin.y + windowFrame.height
    let cocoaY = windowTopY - frame.midY
    let vifY = screen.frame.height - cocoaY

    return NSPoint(x: screenX, y: vifY)
}
```

## HTTP API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/vif/targets` | GET | Returns all targets |
| `/vif/navigate` | POST | Navigate (body: `{"section": "name"}`) |
| `/vif/state` | GET | Current app state |

### Target Response Format

```json
{
  "targets": {
    "nav.home": { "type": "navigate", "section": "home" },
    "nav.settings": { "type": "navigate", "section": "settings" },
    "save-button": { "x": 450, "y": 320, "type": "click" },
    "text-editor": { "x": 600, "y": 400, "type": "click" }
  }
}
```

## Scene DSL Reference

### Basic Structure

```yaml
scene:
  name: My App Demo
  mode: draft          # 'draft' = fast iteration, 'final' = production quality

import:
  - ./apps/myapp.yaml  # App definitions

stage:
  backdrop: true       # Dark backdrop behind app
  viewport:
    padding: 10        # Padding around captured region

sequence:
  - wait: 500ms
  - record: start
  # ... actions ...
  - record: stop
```

### Action Reference

**Navigation & Clicks:**
```yaml
- click: nav.settings           # Navigation target (HTTP API)
- click: save-button            # Click target (coordinates)
- click: { x: 100, y: 200 }     # Explicit coordinates
```

**Cursor Control:**
```yaml
- cursor.show: {}
- cursor.hide: {}
- cursor.moveTo: { x: 500, y: 300, duration: 0.5 }
- cursor.click: {}
```

**Text Input:**
```yaml
- input.type:
    text: "Hello world"
    delay: 0.03                 # Seconds between characters
```

**Keyboard Shortcuts:**
```yaml
- keys.show:
    keys: ["cmd", "shift", "p"]
    press: true                 # Animate key press
```

**Labels:**
```yaml
- label.show: "Step description"
- label.update: "New text"
- label.hide: {}
```

**Recording:**
```yaml
- record: start
- record: stop
```

**Timing:**
```yaml
- wait: 500ms
- wait: 2s
```

### App Definition File

Create `apps/myapp.yaml`:

```yaml
app:
  name: MyApp
  type: native

views:
  sidebar:
    x: 100
    y: 200
```

## Voice Injection

For apps with voice input (speech-to-text):

### Setup

1. Install BlackHole: `brew install blackhole-2ch`
2. Configure your app to use user-selected microphone
3. User selects "BlackHole 2ch" as input in app settings
4. vif plays audio through BlackHole → app receives as mic input

### Scene Usage

```yaml
- voice.play: ./audio/command.wav
- voice.play:
    file: ./audio/command.wav
    wait: true                    # Wait for playback to finish
```

## Testing Your Integration

```bash
# Check targets are exposed
curl http://localhost:7851/vif/targets | jq

# Test navigation
curl -X POST http://localhost:7851/vif/navigate \
  -H "Content-Type: application/json" \
  -d '{"section": "settings"}'

# Check state
curl http://localhost:7851/vif/state | jq
```

## Running Scenes

```bash
# Build vif (TypeScript + automation daemon)
pnpm build && pnpm build:agent

# Validate a scene
./dist/cli.js play --validate demo.yaml

# Run a scene
./dist/cli.js play demo.yaml

# Watch mode (re-run on file changes)
./dist/cli.js play --watch demo.yaml
```

## Agentic Control

Control vif programmatically without YAML scenes.

> **Important:** Start the server first: `vif serve`

### vif-ctl CLI

```bash
vif-ctl backdrop on                    # Show dark backdrop
vif-ctl cursor show                    # Show animated cursor
vif-ctl cursor move 500 300 0.5        # Move cursor
vif-ctl label show "Recording demo"    # Show label
vif-ctl stage clear                    # Clear all overlays
vif-ctl panel headless on              # Hide control panel
```

### MCP Server

For Claude and AI agents:

```bash
vif-mcp  # Start MCP server
```

Configure in `.mcp.json`:
```json
{
  "mcpServers": {
    "vif": {
      "command": "node",
      "args": ["/path/to/vif/dist/mcp/server.js"]
    }
  }
}
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Exit headless mode + clear overlays |
| `⌃⌥⌘V` | Toggle headless mode |
| `⇧⌘R` | Stop recording |
| `⇧⌘X` | Clear stage |

## Troubleshooting

### Targets not appearing

- Ensure `VifTargets.shared.start()` is called in AppDelegate
- Check port 7851 is not blocked: `lsof -i :7851`
- Views must be visible (not hidden/off-screen)

### Coordinates wrong

- Verify coordinate conversion (SwiftUI → Cocoa → vif)
- Check window frame is correct
- Test at different screen resolutions
- Use `vif-ctl cursor show` to verify positions

### Navigation not working

- Verify notification observer in main view
- Check section names match exactly
- Ensure posting on main queue

### Voice injection not working

- Verify BlackHole is installed: `brew list blackhole-2ch`
- Check app is using selected microphone (not hardcoded)
- Verify audio file exists and is playable

### Server connection issues

- Ensure `vif serve` is running
- Check WebSocket port 7850 is available
- Check HTTP port 7851 for VifTargets

## Example Scene

Complete demo scene with all features:

```yaml
scene:
  name: Complete Demo
  mode: draft

stage:
  backdrop: true
  viewport:
    padding: 20

sequence:
  - wait: 500ms
  - record: start

  # Show cursor and navigate
  - cursor.show: {}
  - click: nav.home
  - wait: 800ms

  # Click a button
  - cursor.moveTo: { x: 450, y: 320, duration: 0.3 }
  - cursor.click: {}
  - wait: 500ms

  # Type some text
  - input.type:
      text: "Hello from vif!"
      delay: 0.03

  # Show keyboard shortcut
  - keys.show:
      keys: ["cmd", "s"]
      press: true
  - wait: 1000ms

  # Voice command (if using BlackHole)
  - voice.play: ./audio/save-document.wav
  - wait: 2000ms

  - record: stop
```
