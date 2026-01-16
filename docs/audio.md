# Multi-Channel Audio

Vif supports multi-channel audio with real-time playback and post-processing mixing.

## How It Works

- **Channel 1** (narration): Plays through BlackHole virtual mic in real-time, captured by screen recording
- **Other channels**: Recorded to a timeline, mixed with FFmpeg after recording completes

This means narration syncs perfectly with your demo, while music and SFX are layered in post.

## Configuration

Define channels in the `audio:` block:

```yaml
audio:
  channels:
    1:
      role: narration
      output: virtual-mic   # Real-time through BlackHole
      volume: 1.0
    2:
      role: music
      output: post-only     # Mixed in post-processing
      volume: 0.3
    3:
      role: sfx
      output: post-only
      volume: 0.7
```

### Channel Options

| Option | Values | Description |
|--------|--------|-------------|
| `role` | `narration`, `music`, `sfx`, `ambient`, `custom` | Label for the channel |
| `output` | `virtual-mic`, `post-only`, `monitor`, `both` | Where audio plays |
| `volume` | 0.0 - 1.0 | Channel volume |
| `pan` | -1.0 to 1.0 | Stereo position (left to right) |

## Actions

### audio.play

Play audio on a channel:

```yaml
- audio.play:
    file: audio/narration.mp3
    channel: 1
    wait: true          # Wait for playback to finish
    fadeIn: 500ms
    fadeOut: 1s
    loop: false
```

Playing on the same channel auto-crossfades:

```yaml
# Track A is playing on channel 2...
- audio.play:
    file: audio/track-b.mp3
    channel: 2
    fadeIn: 2s          # Track A fades out, Track B fades in
```

### audio.stop

Stop a channel (or all channels):

```yaml
# Stop specific channel with fade
- audio.stop:
    channel: 2
    fadeOut: 2s

# Stop all audio
- audio.stop: true
```

### audio.volume

Animate volume changes:

```yaml
- audio.volume:
    channel: 2
    volume: 0.1         # Duck the music
    duration: 500ms     # Animate over half a second
```

## Pre-loaded Tracks

Start tracks at specific times in the scene:

```yaml
audio:
  channels:
    2:
      role: music
      output: post-only
      volume: 0.3
  tracks:
    - file: audio/intro-music.mp3
      channel: 2
      startTime: 0
      fadeIn: 2s
      fadeOut: 3s
```

## Example: Demo with Music + Narration

```yaml
scene:
  name: Product Demo
  output: demo-final

audio:
  channels:
    1:
      role: narration
      output: virtual-mic
    2:
      role: music
      output: post-only
      volume: 0.25

sequence:
  - record: start

  # Background music starts
  - audio.play:
      file: audio/upbeat-bg.mp3
      channel: 2
      fadeIn: 1s
      loop: true

  # Narration plays through virtual mic
  - audio.play:
      file: audio/intro.mp3
      channel: 1

  # Duck music during important narration
  - audio.volume:
      channel: 2
      volume: 0.1
      duration: 300ms

  - audio.play:
      file: audio/key-feature.mp3
      channel: 1

  # Bring music back
  - audio.volume:
      channel: 2
      volume: 0.25
      duration: 300ms

  - wait: 2s

  # Fade out music
  - audio.stop:
      channel: 2
      fadeOut: 2s

  - record: stop
```

## Requirements

- **BlackHole** (2ch) for virtual mic routing
- **FFmpeg** for post-processing audio mix
- Audio files: MP3, WAV, M4A supported
