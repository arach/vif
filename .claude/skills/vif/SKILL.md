---
name: vif
description: Integrate vif demo automation into macOS/iOS apps. Use when the user mentions vif, demo recording, VifTargets, DemoAnchors, automation targets, exposing UI elements, click coordinates, navigation targets, or integrating apps with vif. Covers HTTP API setup, coordinate conversion, SwiftUI modifiers, and scene YAML authoring.
---

# Vif Integration Guide

This skill covers everything needed to integrate vif demo automation into a macOS or iOS app.

## Overview

Vif automates demo recordings by:
1. Connecting to your app via HTTP (VifTargets SDK)
2. Querying available UI targets (navigation sections, clickable elements)
3. Executing scene sequences (click, type, navigate, voice)
4. Recording the screen

Your app needs to expose a simple HTTP server that returns target coordinates.

## VifTargets SDK Implementation

### Minimal VifTargets.swift

Add this to your app's Services folder:

```swift
import Cocoa
import Network
import SwiftUI

public class VifTargets: ObservableObject {
    public static let shared = VifTargets()

    private var clickTargets: [String: () -> NSPoint?] = [:]
    private var listener: NWListener?
    private let port: UInt16 = 7851

    @Published public var currentSection: String = "home"

    // Map your app's navigation sections
    private let navigationSections: [String: YourNavigationEnum] = [
        "home": .home,
        "settings": .settings,
        "drafts": .drafts,
        // Add your sections...
    ]

    private init() {
        // Track navigation changes
        NotificationCenter.default.addObserver(
            forName: .navigateToSection,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let section = notification.object as? YourNavigationEnum else { return }
            self.currentSection = self.sectionName(for: section)
        }
    }

    // MARK: - Target Registration

    public func register(_ identifier: String, positionProvider: @escaping () -> NSPoint?) {
        clickTargets[identifier] = positionProvider
    }

    public func unregister(_ identifier: String) {
        clickTargets.removeValue(forKey: identifier)
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

            let response: String

            if request.contains("GET /vif/targets") {
                response = self.buildTargetsResponse()
            } else if request.contains("GET /vif/state") {
                response = self.buildStateResponse()
            } else if request.contains("POST /vif/navigate") {
                if let bodyStart = request.range(of: "\r\n\r\n"),
                   let sectionData = request[bodyStart.upperBound...].data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: sectionData) as? [String: String],
                   let sectionName = json["section"] {
                    let success = self.navigate(to: sectionName)
                    response = self.httpJson(["ok": success])
                } else {
                    response = self.httpJson(["ok": false, "error": "Invalid request"])
                }
            } else {
                response = self.httpJson(["error": "Unknown endpoint"])
            }

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    // MARK: - Navigation

    @discardableResult
    public func navigate(to sectionName: String) -> Bool {
        guard let section = navigationSections[sectionName.lowercased()] else {
            return false
        }
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .navigateToSection, object: section)
        }
        return true
    }

    private func sectionName(for section: YourNavigationEnum) -> String {
        for (name, s) in navigationSections {
            if s == section { return name }
        }
        return "unknown"
    }

    // MARK: - Response Building

    private func buildTargetsResponse() -> String {
        var targets: [String: [String: Any]] = [:]

        // Click targets with coordinates
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

    private func buildStateResponse() -> String {
        httpJson(["state": ["section": currentSection]])
    }

    private func httpJson(_ dict: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else {
            return "{\"error\":\"encoding failed\"}"
        }
        return "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n\(json)"
    }
}

extension Notification.Name {
    static let navigateToSection = Notification.Name("navigateToSection")
}
```

### Start in AppDelegate

```swift
func applicationDidFinishLaunching(_ notification: Notification) {
    VifTargets.shared.start()
}
```

### Handle Navigation in Main View

```swift
.onReceive(NotificationCenter.default.publisher(for: .navigateToSection)) { notification in
    if let section = notification.object as? YourNavigationEnum {
        selectedSection = section
    }
}
```

## SwiftUI View Modifier for Click Targets

Track element positions dynamically:

```swift
struct VifTargetModifier: ViewModifier {
    let identifier: String
    @State private var frame: CGRect = .zero

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geometry in
                    Color.clear
                        .preference(key: FramePreferenceKey.self,
                                    value: geometry.frame(in: .global))
                }
            )
            .onPreferenceChange(FramePreferenceKey.self) { frame in
                self.frame = frame
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
    public func vifTarget(_ identifier: String) -> some View {
        modifier(VifTargetModifier(identifier: identifier))
    }
}
```

Usage:
```swift
Button("Save") { ... }
    .vifTarget("save-button")
```

## Coordinate System Conversion

macOS coordinate systems:
- **SwiftUI .global**: Window-relative, top-left origin
- **Cocoa NSWindow**: Screen-relative, bottom-left origin
- **vif/screencapture**: Screen-relative, top-left origin

Conversion function:

```swift
func convertToScreenCoordinates(frame: CGRect) -> NSPoint? {
    guard let window = NSApp.keyWindow ?? NSApp.mainWindow,
          let screen = window.screen ?? NSScreen.main else {
        return nil
    }

    let windowFrame = window.frame

    // SwiftUI global to screen (top-left origin for vif)
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

## Scene YAML Authoring

### Basic Scene Structure

```yaml
scene:
  name: My App Demo
  mode: draft

import:
  - ./apps/myapp.yaml

stage:
  backdrop: true
  viewport:
    padding: 10

labels:
  teleprompter:
    position: top
    style:
      background: "rgba(0,0,0,0.9)"

sequence:
  - wait: 500ms
  - record: start

  # Navigation (uses HTTP API)
  - click: nav.home
  - wait: 800ms

  # Click targets (uses coordinates)
  - click: save-button

  # Type text
  - input.type:
      text: "Hello world"
      delay: 0.03

  # Voice injection (requires BlackHole)
  - voice.play: ./audio/command.wav

  - record: stop
```

### App Definition File

Create `apps/myapp.yaml`:

```yaml
app:
  name: MyApp
  type: native

views:
  # Define named positions for fallback
  sidebar:
    x: 100
    y: 200
```

### Action Reference

**Navigation & Clicks:**
```yaml
- click: nav.settings        # Navigation target (HTTP API)
- click: save-button         # Click target (coordinates)
- click: { x: 100, y: 200 }  # Explicit coordinates
```

**Text Input:**
```yaml
- input.type:
    text: "Text to type"
    delay: 0.03              # Delay between chars (seconds)
```

**Voice Injection:**
```yaml
- voice.play: ./audio/cmd.wav    # Simple
- voice.play:                    # With options
    file: ./audio/cmd.wav
    wait: true                   # Wait for playback to finish
```

**Recording:**
```yaml
- record: start
- record: stop
```

**Labels:**
```yaml
- label: teleprompter
  text: "Step description"
- label.update: "New text"
- label.hide: {}
```

**Timing:**
```yaml
- wait: 500ms
- wait: 2s
- wait: 1000      # milliseconds if no unit
```

## Voice Injection Setup

For apps with voice input, use BlackHole virtual audio device:

1. Install BlackHole: `brew install blackhole-2ch`
2. Configure your app to use the user's selected microphone
3. User selects "BlackHole 2ch" as input in app settings
4. vif plays audio through BlackHole, app receives it as mic input

## Testing Integration

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
# Build vif
pnpm build && pnpm build:agent

# Run a scene
./dist/cli.js play demos/scenes/myapp-demo.yaml
```

## Troubleshooting

**Targets not appearing:**
- Ensure `VifTargets.shared.start()` is called in AppDelegate
- Check port 7851 is not blocked
- Views must be visible (not hidden/off-screen)

**Coordinates wrong:**
- Verify coordinate conversion (SwiftUI → Cocoa → vif)
- Check window frame is correct
- Test at different screen resolutions

**Navigation not working:**
- Verify notification observer in main view
- Check section names match
- Ensure posting on main queue

**Voice injection not working:**
- Verify BlackHole is installed
- Check app is using selected microphone (not system default)
- Verify audio file exists and is playable
