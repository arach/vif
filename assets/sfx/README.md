# vif SFX Library

CC0 (Public Domain) sound effects for vif demo automation.

## Sources

All sounds are from [Kenney.nl](https://kenney.nl) under CC0 license:
- UI Audio (50 sounds)
- Interface Sounds (100 sounds)
- Digital Audio (60 sounds)

**License:** Creative Commons Zero (CC0) - Free to use for any purpose, no attribution required.

## Categories

| Folder | Count | Use Case |
|--------|-------|----------|
| `clicks/` | 16 | UI button clicks, mouse clicks, selections |
| `typing/` | 13 | Keyboard typing, key presses, switches |
| `chimes/` | 15 | Success notifications, confirmations, completions |
| `transitions/` | 24 | Whoosh, open/close, maximize/minimize |
| `shutter/` | 10 | Camera capture, screenshot, snap sounds |
| `errors/` | 12 | Error notifications, warnings, back/cancel |

**Total:** 90 sound files

## Usage in Scenes

```yaml
sequence:
  # Play a click sound
  - audio.play: sfx/clicks/click1.wav

  # Simulate typing with sound
  - typer.type:
      text: "Hello world"
      sfx: sfx/typing/tick_001.ogg

  # Success chime on completion
  - audio.play: sfx/chimes/confirmation_001.ogg
```

## Formats

- `.wav` - Uncompressed, lower latency (from UI Audio pack)
- `.ogg` - Compressed, smaller files (from Interface/Digital packs)

Both formats work with vif's audio system.
