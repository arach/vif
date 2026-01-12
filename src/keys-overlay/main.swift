/**
 * vif-keys: Hotkey overlay for demo recording
 *
 * Shows keyboard shortcuts visually on screen AND simulates the keypresses.
 * Controlled via stdin JSON commands.
 *
 * Commands:
 *   {"action": "show", "keys": ["cmd", "shift", "p"]}              // show only
 *   {"action": "show", "keys": ["cmd", "shift", "p"], "press": true} // show + simulate
 *   {"action": "press", "keys": ["cmd", "c"]}                      // simulate only
 *   {"action": "hide"}
 *   {"action": "quit"}
 *
 * Build: swiftc -O -o vif-keys main.swift -framework Cocoa
 */

import Cocoa
import Carbon.HIToolbox

// MARK: - Key Codes

let keyCodes: [String: UInt16] = [
    "a": 0x00, "s": 0x01, "d": 0x02, "f": 0x03, "h": 0x04, "g": 0x05, "z": 0x06, "x": 0x07,
    "c": 0x08, "v": 0x09, "b": 0x0B, "q": 0x0C, "w": 0x0D, "e": 0x0E, "r": 0x0F, "y": 0x10,
    "t": 0x11, "1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15, "6": 0x16, "5": 0x17, "=": 0x18,
    "9": 0x19, "7": 0x1A, "-": 0x1B, "8": 0x1C, "0": 0x1D, "]": 0x1E, "o": 0x1F, "u": 0x20,
    "[": 0x21, "i": 0x22, "p": 0x23, "l": 0x25, "j": 0x26, "'": 0x27, "k": 0x28, ";": 0x29,
    "\\": 0x2A, ",": 0x2B, "/": 0x2C, "n": 0x2D, "m": 0x2E, ".": 0x2F, "`": 0x32,
    "return": 0x24, "enter": 0x24, "tab": 0x30, "space": 0x31, "delete": 0x33, "backspace": 0x33,
    "escape": 0x35, "esc": 0x35,
    "f1": 0x7A, "f2": 0x78, "f3": 0x63, "f4": 0x76, "f5": 0x60, "f6": 0x61,
    "f7": 0x62, "f8": 0x64, "f9": 0x65, "f10": 0x6D, "f11": 0x67, "f12": 0x6F,
    "up": 0x7E, "down": 0x7D, "left": 0x7B, "right": 0x7C,
    "home": 0x73, "end": 0x77, "pageup": 0x74, "pagedown": 0x79,
]

func pressKeys(_ keys: [String]) {
    var modifiers: CGEventFlags = []
    var keyCode: UInt16 = 0
    var hasKey = false

    for key in keys {
        let lower = key.lowercased()
        switch lower {
        case "cmd", "command":
            modifiers.insert(.maskCommand)
        case "shift":
            modifiers.insert(.maskShift)
        case "opt", "option", "alt":
            modifiers.insert(.maskAlternate)
        case "ctrl", "control":
            modifiers.insert(.maskControl)
        default:
            if let code = keyCodes[lower] {
                keyCode = code
                hasKey = true
            } else if lower.count == 1, let code = keyCodes[lower] {
                keyCode = code
                hasKey = true
            }
        }
    }

    guard hasKey else {
        NSLog("vif-keys: no key to press in \(keys)")
        return
    }

    // Create and post key events
    let source = CGEventSource(stateID: .hidSystemState)
    if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true) {
        keyDown.flags = modifiers
        keyDown.post(tap: .cghidEventTap)
    }
    usleep(50000) // 50ms
    if let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) {
        keyUp.flags = modifiers
        keyUp.post(tap: .cghidEventTap)
    }

    NSLog("vif-keys: pressed \(keys.joined(separator: "+"))")
}

// MARK: - Key Symbols

let keySymbols: [String: String] = [
    // Modifiers
    "cmd": "⌘", "command": "⌘",
    "shift": "⇧",
    "opt": "⌥", "option": "⌥", "alt": "⌥",
    "ctrl": "⌃", "control": "⌃",
    "fn": "fn",

    // Special keys
    "return": "↵", "enter": "↵",
    "tab": "⇥",
    "space": "␣",
    "delete": "⌫", "backspace": "⌫",
    "escape": "⎋", "esc": "⎋",
    "up": "↑", "down": "↓", "left": "←", "right": "→",
    "home": "↖", "end": "↘",
    "pageup": "⇞", "pagedown": "⇟",

    // Function keys
    "f1": "F1", "f2": "F2", "f3": "F3", "f4": "F4",
    "f5": "F5", "f6": "F6", "f7": "F7", "f8": "F8",
    "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
]

func symbolFor(_ key: String) -> String {
    let lower = key.lowercased()
    return keySymbols[lower] ?? key.uppercased()
}

// MARK: - Key View

class KeyCapView: NSView {
    let label: String
    let isModifier: Bool

    init(key: String) {
        self.label = symbolFor(key)
        self.isModifier = ["⌘", "⇧", "⌥", "⌃", "fn"].contains(self.label)
        super.init(frame: .zero)
        wantsLayer = true
    }

    required init?(coder: NSCoder) { fatalError() }

    override var intrinsicContentSize: NSSize {
        let font = NSFont.systemFont(ofSize: isModifier ? 28 : 24, weight: .medium)
        let size = (label as NSString).size(withAttributes: [.font: font])
        let width = max(size.width + 24, isModifier ? 50 : 44)
        return NSSize(width: width, height: 50)
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let rect = bounds.insetBy(dx: 2, dy: 2)
        let cornerRadius: CGFloat = 8

        // Shadow
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -2), blur: 4, color: NSColor.black.withAlphaComponent(0.3).cgColor)

        // Key cap background - gradient for 3D effect
        let path = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)

        // Bottom (darker)
        NSColor(white: 0.15, alpha: 0.95).setFill()
        path.fill()

        ctx.restoreGState()

        // Top highlight
        let topRect = NSRect(x: rect.minX, y: rect.minY + rect.height * 0.4, width: rect.width, height: rect.height * 0.6)
        let topPath = NSBezierPath(roundedRect: topRect, xRadius: cornerRadius, yRadius: cornerRadius)
        NSColor(white: 0.25, alpha: 1.0).setFill()
        topPath.fill()

        // Border
        NSColor(white: 0.1, alpha: 1.0).setStroke()
        path.lineWidth = 1
        path.stroke()

        // Label
        let font = NSFont.systemFont(ofSize: isModifier ? 28 : 24, weight: .medium)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.white
        ]
        let size = (label as NSString).size(withAttributes: attrs)
        let labelRect = NSRect(
            x: bounds.midX - size.width / 2,
            y: bounds.midY - size.height / 2 + 2,
            width: size.width,
            height: size.height
        )
        (label as NSString).draw(in: labelRect, withAttributes: attrs)
    }
}

// MARK: - Hotkey Window

class HotkeyWindow: NSWindow {
    let containerView = NSView()
    var keyViews: [KeyCapView] = []
    var hideWorkItem: DispatchWorkItem?

    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 80),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

        isOpaque = false
        backgroundColor = .clear
        level = .floating
        ignoresMouseEvents = true
        hasShadow = true

        // Container with rounded background
        containerView.wantsLayer = true
        containerView.layer?.backgroundColor = NSColor(white: 0.1, alpha: 0.9).cgColor
        containerView.layer?.cornerRadius = 16
        contentView = containerView

        // Start hidden
        alphaValue = 0
    }

    func showKeys(_ keys: [String]) {
        // Remove old keys
        keyViews.forEach { $0.removeFromSuperview() }
        keyViews.removeAll()

        // Create key views
        for key in keys {
            let keyView = KeyCapView(key: key)
            keyViews.append(keyView)
            containerView.addSubview(keyView)
        }

        // Layout horizontally with spacing
        var x: CGFloat = 16
        let spacing: CGFloat = 8
        var maxHeight: CGFloat = 50

        for keyView in keyViews {
            let size = keyView.intrinsicContentSize
            keyView.frame = NSRect(x: x, y: 15, width: size.width, height: size.height)
            x += size.width + spacing
            maxHeight = max(maxHeight, size.height)
        }

        // Resize window to fit
        let totalWidth = x - spacing + 16
        let totalHeight = maxHeight + 30

        setContentSize(NSSize(width: totalWidth, height: totalHeight))

        // Position at bottom center of screen
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let x = screenFrame.midX - totalWidth / 2
            let y = screenFrame.minY + 100
            setFrameOrigin(NSPoint(x: x, y: y))
        }

        // Cancel any pending hide
        hideWorkItem?.cancel()

        // Animate in
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.15
            animator().alphaValue = 1.0
        }

        // Auto-hide after delay
        let workItem = DispatchWorkItem { [weak self] in
            self?.hideKeys()
        }
        hideWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: workItem)
    }

    func hideKeys() {
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.3
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    let window = HotkeyWindow()
    var stdinSource: DispatchSourceRead?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("vif-keys: ready")
        setupStdinReader()
    }

    func setupStdinReader() {
        let stdin = FileHandle.standardInput
        stdinSource = DispatchSource.makeReadSource(fileDescriptor: stdin.fileDescriptor, queue: .main)

        stdinSource?.setEventHandler { [weak self] in
            let data = stdin.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }

            for command in line.components(separatedBy: .newlines) {
                let trimmed = command.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty {
                    self?.handleCommand(trimmed)
                }
            }
        }

        stdinSource?.resume()
    }

    func handleCommand(_ json: String) {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = obj["action"] as? String else {
            NSLog("vif-keys: invalid command: \(json)")
            return
        }

        switch action {
        case "show":
            if let keys = obj["keys"] as? [String] {
                let shouldPress = obj["press"] as? Bool ?? false
                NSLog("vif-keys: showing \(keys.joined(separator: "+"))\(shouldPress ? " (pressing)" : "")")
                window.showKeys(keys)
                if shouldPress {
                    // Small delay so visual shows before key is pressed
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        pressKeys(keys)
                    }
                }
            }

        case "press":
            if let keys = obj["keys"] as? [String] {
                pressKeys(keys)
            }

        case "hide":
            window.hideKeys()

        case "quit":
            NSApp.terminate(nil)

        default:
            NSLog("vif-keys: unknown action: \(action)")
        }
    }
}

// MARK: - Main

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
