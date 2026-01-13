# VifTargets Integration Guide

## Overview

VifTargets is a lightweight SDK that exposes your app's UI elements to vif for automated demo recording. It provides:

- **Navigation targets**: Programmatic navigation (sidebar sections, tabs, etc.)
- **Click targets**: Coordinates for UI elements (buttons, text fields, etc.)
- **Event validation**: Optional signals to confirm actions succeeded

## Quick Start

### 1. Create VifTargets.swift

Add a new file `Services/VifTargets.swift` to your app:

```swift
import Foundation
import Network

public final class VifTargets {
    public static let shared = VifTargets()

    private var listener: NWListener?
    private let port: UInt16 = 7851

    private init() {}

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
            guard let data = data, let request = String(data: data, encoding: .utf8) else { return }
            let response = self?.handleRequest(request) ?? "HTTP/1.1 404 Not Found\r\n\r\n"
            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func handleRequest(_ request: String) -> String {
        let lines = request.components(separatedBy: "\r\n")
        guard let firstLine = lines.first else { return httpError(400) }

        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else { return httpError(400) }

        let method = String(parts[0])
        let path = String(parts[1])

        switch (method, path) {
        case ("GET", "/vif/targets"):
            return buildTargetsResponse()
        case ("POST", let p) where p.starts(with: "/vif/navigate/"):
            let section = String(p.dropFirst("/vif/navigate/".count))
            return handleNavigate(section)
        default:
            return httpError(404)
        }
    }

    // MARK: - Implement These

    private func buildTargetsResponse() -> String {
        // Return your app's targets
        var targets: [String: Any] = [:]

        // Add navigation targets
        targets["nav.home"] = ["type": "navigate", "section": "home"]
        targets["nav.settings"] = ["type": "navigate", "section": "settings"]

        // Add click targets (coordinates)
        // These could come from DemoAnchors, hardcoded values, or computed positions
        targets["save-button"] = ["x": 100, "y": 200, "type": "click"]

        return httpJson(["targets": targets])
    }

    private func handleNavigate(_ section: String) -> String {
        // Trigger navigation in your app
        DispatchQueue.main.async {
            // Post notification or call navigation method
            NotificationCenter.default.post(
                name: .navigateToSection,
                object: section
            )
        }
        return httpJson(["ok": true, "section": section])
    }

    // MARK: - HTTP Helpers

    private func httpJson(_ dict: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else {
            return httpError(500)
        }
        return "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n\(json)"
    }

    private func httpError(_ code: Int) -> String {
        "HTTP/1.1 \(code) Error\r\n\r\n"
    }
}

extension Notification.Name {
    static let navigateToSection = Notification.Name("navigateToSection")
}
```

### 2. Start VifTargets in AppDelegate

```swift
func applicationDidFinishLaunching(_ notification: Notification) {
    VifTargets.shared.start()
    // ...
}
```

### 3. Handle Navigation

In your main navigation view, observe the notification:

```swift
.onReceive(NotificationCenter.default.publisher(for: .navigateToSection)) { notification in
    if let section = notification.object as? String {
        selectedSection = section
    }
}
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/vif/targets` | GET | Returns all available targets |
| `/vif/navigate/{section}` | POST | Triggers navigation to a section |
| `/vif/state` | GET | Returns current app state (optional) |
| `/vif/events` | GET | Returns recent action events (optional) |

## Target Types

### Navigation Targets

```json
{
  "nav.home": { "type": "navigate", "section": "home" },
  "nav.settings": { "type": "navigate", "section": "settings" }
}
```

vif will use the HTTP API to navigate instead of clicking coordinates.

### Click Targets

```json
{
  "save-button": { "x": 100, "y": 200, "type": "click" },
  "text-field": { "x": 300, "y": 150, "type": "click" }
}
```

vif will move the cursor to these coordinates and click.

## DemoAnchors (Optional)

For dynamic coordinates, you can use SwiftUI's geometry reader:

```swift
struct DemoAnchorModifier: ViewModifier {
    let id: String

    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGRect.self) { proxy in
                proxy.frame(in: .global)
            } action: { frame in
                DemoAnchorRegistry.shared.register(id, frame: frame)
            }
            .onDisappear {
                DemoAnchorRegistry.shared.unregister(id)
            }
    }
}

extension View {
    func demoAnchor(_ id: String) -> some View {
        modifier(DemoAnchorModifier(id: id))
    }
}

// Usage
Button("Save") { ... }
    .demoAnchor("save-button")
```

Then expose registered anchors in `/vif/targets`:

```swift
let anchors = DemoAnchorRegistry.shared.anchors
for (id, frame) in anchors {
    let screenPoint = convertToScreenCoordinates(frame)
    targets[id] = ["x": screenPoint.x, "y": screenPoint.y, "type": "click"]
}
```

## Coordinate Systems

macOS has multiple coordinate systems:

1. **SwiftUI (.global)**: Window-relative, top-left origin
2. **Cocoa (NSWindow)**: Screen-relative, bottom-left origin
3. **vif/screencapture**: Screen-relative, top-left origin

To convert from SwiftUI global to vif coordinates:

```swift
func convertToScreenCoordinates(frame: CGRect) -> CGPoint {
    guard let window = NSApp.mainWindow else { return .zero }

    // SwiftUI global frame is window-relative, top-left origin
    let windowFrame = window.frame
    let contentRect = window.contentRect(forFrameRect: windowFrame)

    // Convert to screen coordinates (top-left origin)
    let screenX = contentRect.origin.x + frame.midX
    let screenY = contentRect.origin.y + (contentRect.height - frame.midY)

    // Convert from Cocoa (bottom-left) to vif (top-left)
    let screenHeight = NSScreen.main?.frame.height ?? 0
    let vifY = screenHeight - screenY

    return CGPoint(x: screenX, y: vifY)
}
```

## Scene YAML Usage

Once integrated, your vif scenes can use the targets:

```yaml
sequence:
  # Navigation (uses HTTP API)
  - click: sidebar.home

  # Click targets (uses coordinates)
  - click: save-button

  # Or explicit coordinates
  - click: { x: 100, y: 200 }
```

## Testing

Verify your integration:

```bash
# Check targets
curl http://localhost:7851/vif/targets | jq

# Test navigation
curl -X POST http://localhost:7851/vif/navigate/settings
```

## Best Practices

1. **Use navigation APIs** for sidebar/tab navigation - more reliable than clicking
2. **Use DemoAnchors** for buttons that may move - coordinates stay accurate
3. **Hardcode coordinates** only for stable UI elements
4. **Add logging** to help debug coordinate issues
5. **Test at different window sizes** to ensure coordinates are correct
