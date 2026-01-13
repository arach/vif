# Talkie Integration: Mic Selection for Ephemeral Capture

## Overview

This adds mic selection support to EphemeralTranscriber, allowing it to use the user's selected microphone instead of always using the system default.

## Files to Modify

### 1. `macOS/Talkie/Services/EphemeralTranscriber.swift`

Add imports at the top:
```swift
import CoreAudio
import AudioToolbox
```

Add this method to the `EphemeralTranscriber` class:

```swift
/// Configure the audio engine to use the user's selected input device
private func configureInputDevice(engine: AVAudioEngine) {
    let audioManager = AudioDeviceManager.shared
    audioManager.ensureInitialized()

    // Use the user's selected device from settings
    let selectedID = audioManager.selectedDeviceID
    guard selectedID != 0 else {
        logger.debug("Using system default audio input")
        return
    }

    // Get the audio unit from the input node
    guard let audioUnit = engine.inputNode.audioUnit else {
        logger.warning("Could not get audio unit from input node")
        return
    }

    // Set the input device to match user's selection
    var deviceID = selectedID
    let status = AudioUnitSetProperty(
        audioUnit,
        kAudioOutputUnitProperty_CurrentDevice,
        kAudioUnitScope_Global,
        0,
        &deviceID,
        UInt32(MemoryLayout<AudioDeviceID>.size)
    )

    if status == noErr {
        let deviceName = audioManager.inputDevices.first(where: { $0.id == selectedID })?.name ?? "Unknown"
        logger.info("Using selected mic: \(deviceName)")
    } else {
        logger.error("Failed to set audio input device: \(status)")
    }
}
```

In the `startCapture()` method, call `configureInputDevice` after creating the engine:

```swift
// Create audio engine
let engine = AVAudioEngine()
self.audioEngine = engine

// Configure input device (use selected mic from settings)
configureInputDevice(engine: engine)

let inputNode = engine.inputNode
// ... rest of the method
```

## How It Works

1. `AudioDeviceManager.shared.selectedDeviceID` returns the user's mic selection from settings
2. We use `AudioUnitSetProperty` to configure AVAudioEngine's input node to use that specific device
3. If no device is selected (ID = 0), we fall back to system default

## Benefits

- EphemeralTranscriber now respects the mic picker in settings
- Works with any audio input device (including virtual devices like BlackHole)
- No special demo mode code needed - just select the mic you want to use
