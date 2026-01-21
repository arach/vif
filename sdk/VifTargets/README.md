# VifTargets SDK

Expose automation targets from your macOS app to vif for demo recording.

## Installation

Add to your `Package.swift`:

```swift
dependencies: [
    .package(path: "../vif/sdk/VifTargets")
    // or from git:
    // .package(url: "https://github.com/arach/vif", from: "1.0.0")
]
```

## Usage

### 1. Start the server on app launch

```swift
import VifTargets

@main
struct MyApp: App {
    init() {
        VifTargets.shared.start()
    }
    // ...
}
```

### 2. Mark views as targets

```swift
// Basic target
Button("Submit") { submit() }
    .vifTarget("submit-btn")

// Convenience modifiers
TabButton("Settings")
    .vifTab("settings")

NavigationLink("Drafts")
    .vifNavTarget("drafts")

TextField("Email", text: $email)
    .vifInput("email")
```

### 3. Use in vif scenes

```yaml
sequence:
  - click: submit-btn
  - click: tab.settings
  - click: nav.drafts
  - click: input.email
  - input.type:
      text: "user@example.com"
```

## API

### Endpoints

The SDK runs an HTTP server on port 7851:

| Endpoint | Description |
|----------|-------------|
| `GET /vif/targets` | List all registered targets with coordinates |
| `GET /vif/target/{name}` | Get coordinates for a specific target |
| `GET /vif/health` | Health check with target count |

### Response Format

```json
{
  "targets": {
    "submit-btn": { "x": 500, "y": 300, "width": 80, "height": 32 },
    "tab.settings": { "x": 200, "y": 50, "width": 60, "height": 24 }
  }
}
```

## How It Works

1. SwiftUI views with `.vifTarget()` report their screen coordinates
2. VifTargets runs an HTTP server on port 7851
3. When vif executes `click: target-name`, it queries the server for coordinates
4. Vif moves the cursor and clicks at the live position

This means targets work even when the window moves or resizes.
