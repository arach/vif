# Scene DSL Reference

Define demo sequences declaratively in YAML.

## Basic Structure

```yaml
scene:
  name: Demo Name
  mode: draft           # draft | final

app:
  name: AppName
  window:
    width: 1280
    height: 800

stage:
  backdrop: true
  viewport:
    padding: 10

sequence:
  - wait: 500ms
  - cursor.show: {}
  - cursor.moveTo: { x: 500, y: 300 }
  # ... more actions
```

## Running Scenes

```bash
vif play scene.yaml              # Execute
vif play --validate scene.yaml   # Validate only
vif play --watch scene.yaml      # Re-run on changes
vif play --verbose scene.yaml    # Detailed logging
```

## Actions

### Timing
```yaml
- wait: 500ms
- wait: 2s
- wait: 1.5s
```

### Cursor
```yaml
- cursor.show: {}
- cursor.hide: {}
- cursor.moveTo: { x: 500, y: 300, duration: 0.3 }
- cursor.click: {}
- click: { x: 500, y: 300 }
- click: sidebar.home    # Named target
```

### Labels
```yaml
- label.show: "Text here"
- label.show: { text: "Text", position: bottom }
- label.update: "New text"
- label.hide: {}
```

### Camera
```yaml
- camera.show: { position: bottom-right, size: medium }
- camera.set: { position: top-left }
- camera.hide: {}
```

### Keyboard
```yaml
- keys.show: { keys: ["cmd", "shift", "p"], press: true }
- keys.hide: {}
- input.keys: ["cmd", "c"]    # Actually press keys
```

### Typing
```yaml
- typer.type: { text: "Hello", style: code, delay: 0.05 }
- typer.hide: {}
- input.type: { text: "Hello", delay: 0.03 }  # Real typing
```

### Recording
```yaml
- record: start
- record: stop
```

### Stage
```yaml
- backdrop.show: {}
- backdrop.hide: {}
- stage.clear: {}
```

### Audio
```yaml
- voice.play: audio/intro.mp3
- voice.play: { file: audio/intro.mp3, wait: true }
- voice.stop: {}
```

## Named Targets

Define reusable click targets:

```yaml
views:
  sidebar:
    region: { x: 0, width: 200 }
    items:
      - home: { y: 100 }
      - settings: { y: 140 }

sequence:
  - click: sidebar.home
  - click: sidebar.settings
```

## Full Example

```yaml
scene:
  name: App Demo
  mode: draft

app:
  name: MyApp
  window:
    width: 1280
    height: 800

stage:
  backdrop: true

views:
  nav:
    items:
      - dashboard: { x: 100, y: 50 }
      - settings: { x: 200, y: 50 }

sequence:
  - wait: 500ms
  - record: start
  - cursor.show: {}
  - camera.show: { position: bottom-right }
  - label.show: "Welcome to MyApp"
  - wait: 1s

  - cursor.moveTo: { x: 400, y: 300, duration: 0.4 }
  - cursor.click: {}

  - input.type: { text: "Hello world", delay: 0.03 }

  - keys.show: { keys: ["cmd", "return"], press: true }
  - input.keys: ["cmd", "return"]
  - keys.hide: {}

  - click: nav.dashboard
  - wait: 500ms
  - click: nav.settings

  - label.hide: {}
  - camera.hide: {}
  - cursor.hide: {}
  - record: stop
```
