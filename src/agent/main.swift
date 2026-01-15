/**
 * vif-agent: Unified automation overlay for demo recording
 *
 * Combines cursor, keyboard, typing overlays, and screen recording in one process.
 * Requests accessibility permissions on launch.
 *
 * Commands (JSON via stdin):
 *   // Cursor
 *   {"action": "cursor.show"}
 *   {"action": "cursor.hide"}
 *   {"action": "cursor.moveTo", "x": 500, "y": 300, "duration": 0.3}
 *   {"action": "cursor.click"}
 *   {"action": "cursor.doubleClick"}
 *   {"action": "cursor.rightClick"}
 *   {"action": "cursor.dragStart"}
 *   {"action": "cursor.dragEnd"}
 *
 *   // Keys
 *   {"action": "keys.show", "keys": ["cmd", "shift", "p"]}
 *   {"action": "keys.show", "keys": ["cmd", "c"], "press": true}
 *   {"action": "keys.press", "keys": ["cmd", "v"]}
 *   {"action": "keys.hide"}
 *
 *   // Typer
 *   {"action": "typer.type", "text": "hello world", "style": "terminal"}
 *   {"action": "typer.clear"}
 *   {"action": "typer.hide"}
 *
 *   // Viewport
 *   {"action": "viewport.set", "x": 100, "y": 100, "width": 1280, "height": 720}
 *   {"action": "viewport.set", "app": "Talkie"}
 *   {"action": "viewport.show"}
 *   {"action": "viewport.hide"}
 *
 *   // Recording
 *   {"action": "record.start"}                         // draft mode (default)
 *   {"action": "record.start", "mode": "final"}        // final mode
 *   {"action": "record.start", "mode": "final", "name": "feature-demo"}
 *   {"action": "record.stop"}
 *   {"action": "record.status"}
 *
 *   // System
 *   {"action": "quit"}
 *
 * Build: swiftc -O -o vif-agent main.swift -framework Cocoa -framework Carbon
 */

import Cocoa
import Carbon.HIToolbox
import ApplicationServices
import WebKit
import AVFoundation
import CoreAudio

// MARK: - Accessibility Check

func checkAccessibility() -> Bool {
    let trusted = AXIsProcessTrusted()
    if !trusted {
        print("{\"event\":\"permission_required\",\"type\":\"accessibility\"}")
        fflush(stdout)

        // Prompt for access
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)

        // Wait a moment and check again
        Thread.sleep(forTimeInterval: 0.5)
        return AXIsProcessTrusted()
    }
    return true
}

// MARK: - Key Codes & Symbols

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

let keySymbols: [String: String] = [
    "cmd": "⌘", "command": "⌘", "shift": "⇧",
    "opt": "⌥", "option": "⌥", "alt": "⌥",
    "ctrl": "⌃", "control": "⌃", "fn": "fn",
    "return": "↵", "enter": "↵", "tab": "⇥", "space": "␣",
    "delete": "⌫", "backspace": "⌫", "escape": "⎋", "esc": "⎋",
    "up": "↑", "down": "↓", "left": "←", "right": "→",
    "f1": "F1", "f2": "F2", "f3": "F3", "f4": "F4", "f5": "F5", "f6": "F6",
    "f7": "F7", "f8": "F8", "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
]

func symbolFor(_ key: String) -> String {
    keySymbols[key.lowercased()] ?? key.uppercased()
}

func pressKeys(_ keys: [String]) {
    var modifiers: CGEventFlags = []
    var keyCode: UInt16 = 0
    var hasKey = false

    for key in keys {
        let lower = key.lowercased()
        switch lower {
        case "cmd", "command": modifiers.insert(.maskCommand)
        case "shift": modifiers.insert(.maskShift)
        case "opt", "option", "alt": modifiers.insert(.maskAlternate)
        case "ctrl", "control": modifiers.insert(.maskControl)
        default:
            if let code = keyCodes[lower] {
                keyCode = code
                hasKey = true
            }
        }
    }

    guard hasKey else { return }

    let source = CGEventSource(stateID: .hidSystemState)
    if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true) {
        keyDown.flags = modifiers
        keyDown.post(tap: .cghidEventTap)
    }
    usleep(50000)
    if let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) {
        keyUp.flags = modifiers
        keyUp.post(tap: .cghidEventTap)
    }
}

/// Type a string character by character using CGEvents
func typeString(_ text: String, delay: UInt32 = 30000) {
    let source = CGEventSource(stateID: .hidSystemState)

    for char in text {
        // Create key event for the character
        if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true) {
            // Use UniChar for the character
            var unichar = UniChar(char.utf16.first ?? 0)
            keyDown.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unichar)
            keyDown.post(tap: .cghidEventTap)
        }

        usleep(delay / 2)

        if let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) {
            var unichar = UniChar(char.utf16.first ?? 0)
            keyUp.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unichar)
            keyUp.post(tap: .cghidEventTap)
        }

        usleep(delay / 2)
    }
}

// MARK: - Cursor View

class CursorView: NSView {
    var ripplePhase: CGFloat = 0
    var showRipple = false
    var isDragging = false

    // Use flipped coordinates (y=0 at top, like screen coords)
    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Tip is at (0, 0) - top-left corner of view
        let tipX: CGFloat = 0
        let tipY: CGFloat = 0

        // Ripple effect at cursor tip
        if showRipple && ripplePhase > 0 {
            let size: CGFloat = 50 * ripplePhase
            let rect = CGRect(x: tipX - size/2, y: tipY - size/2, width: size, height: size)
            ctx.setFillColor(NSColor.systemBlue.withAlphaComponent(0.5 * (1.0 - ripplePhase)).cgColor)
            ctx.fillEllipse(in: rect)
        }

        // Drag indicator at cursor tip
        if isDragging {
            let size: CGFloat = 30
            let rect = CGRect(x: tipX - size/2, y: tipY - size/2, width: size, height: size)
            ctx.setFillColor(NSColor.systemOrange.withAlphaComponent(0.4).cgColor)
            ctx.fillEllipse(in: rect)
        }

        // Cursor - tip at (0, 0)
        ctx.saveGState()

        // Shadow
        ctx.saveGState()
        ctx.translateBy(x: 2, y: 2)
        drawCursor(ctx, fill: NSColor.black.withAlphaComponent(0.25))
        ctx.restoreGState()

        drawCursor(ctx, fill: .white)
        ctx.beginPath()
        cursorPath(ctx)
        ctx.setStrokeColor(NSColor.black.cgColor)
        ctx.setLineWidth(1.2)
        ctx.strokePath()
        ctx.restoreGState()
    }

    func drawCursor(_ ctx: CGContext, fill: NSColor) {
        ctx.beginPath()
        cursorPath(ctx)
        ctx.setFillColor(fill.cgColor)
        ctx.fillPath()
    }

    func cursorPath(_ ctx: CGContext) {
        // macOS-style pointer cursor with tip at (0,0)
        // In flipped coords: y increases downward
        ctx.move(to: CGPoint(x: 0, y: 0))       // Tip at origin
        ctx.addLine(to: CGPoint(x: 0, y: 26))   // Down left edge
        ctx.addLine(to: CGPoint(x: 6, y: 20))   // Notch
        ctx.addLine(to: CGPoint(x: 10, y: 30))  // Down to tail
        ctx.addLine(to: CGPoint(x: 15, y: 27))  // Tail right
        ctx.addLine(to: CGPoint(x: 11, y: 17))  // Back up
        ctx.addLine(to: CGPoint(x: 18, y: 17))  // Right arrow part
        ctx.closePath()
    }

    func animateClick() {
        showRipple = true
        ripplePhase = 0.1
        for i in 1...15 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.025) {
                self.ripplePhase = CGFloat(i) / 15.0
                self.needsDisplay = true
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            self.showRipple = false
            self.ripplePhase = 0
            self.needsDisplay = true
        }
    }
}

// MARK: - KeyCap View

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
        return NSSize(width: max(size.width + 24, isModifier ? 50 : 44), height: 50)
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let rect = bounds.insetBy(dx: 2, dy: 2)
        let path = NSBezierPath(roundedRect: rect, xRadius: 8, yRadius: 8)

        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -2), blur: 4, color: NSColor.black.withAlphaComponent(0.3).cgColor)
        NSColor(white: 0.15, alpha: 0.95).setFill()
        path.fill()
        ctx.restoreGState()

        let topRect = NSRect(x: rect.minX, y: rect.minY + rect.height * 0.4, width: rect.width, height: rect.height * 0.6)
        NSColor(white: 0.25, alpha: 1.0).setFill()
        NSBezierPath(roundedRect: topRect, xRadius: 8, yRadius: 8).fill()

        NSColor(white: 0.1, alpha: 1.0).setStroke()
        path.lineWidth = 1
        path.stroke()

        let font = NSFont.systemFont(ofSize: isModifier ? 28 : 24, weight: .medium)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
        let size = (label as NSString).size(withAttributes: attrs)
        (label as NSString).draw(at: NSPoint(x: bounds.midX - size.width/2, y: bounds.midY - size.height/2 + 2), withAttributes: attrs)
    }
}

// MARK: - Typing View

class TypingView: NSView {
    var displayedText: String = ""
    var style: String = "default"
    var cursorVisible: Bool = true
    var cursorTimer: Timer?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        cursorTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.cursorVisible.toggle()
            self?.needsDisplay = true
        }
    }

    required init?(coder: NSCoder) { fatalError() }
    deinit { cursorTimer?.invalidate() }

    override func draw(_ dirtyRect: NSRect) {
        let padding: CGFloat = 20
        let (bgColor, textColor, font): (NSColor, NSColor, NSFont) = {
            switch style {
            case "terminal":
                return (NSColor(red: 0.1, green: 0.1, blue: 0.12, alpha: 0.95),
                        NSColor(red: 0.3, green: 0.9, blue: 0.4, alpha: 1.0),
                        NSFont.monospacedSystemFont(ofSize: 18, weight: .regular))
            case "code":
                return (NSColor(red: 0.15, green: 0.16, blue: 0.18, alpha: 0.95),
                        NSColor(red: 0.9, green: 0.9, blue: 0.85, alpha: 1.0),
                        NSFont.monospacedSystemFont(ofSize: 16, weight: .regular))
            default:
                return (NSColor(white: 0.15, alpha: 0.95), .white, NSFont.systemFont(ofSize: 20, weight: .medium))
            }
        }()

        let path = NSBezierPath(roundedRect: bounds, xRadius: 12, yRadius: 12)
        bgColor.setFill()
        path.fill()
        NSColor(white: 0.3, alpha: 0.5).setStroke()
        path.lineWidth = 1
        path.stroke()

        var text = style == "terminal" ? "$ " + displayedText : displayedText
        if cursorVisible { text += "▌" }

        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: textColor]
        let attrStr = NSAttributedString(string: text, attributes: attrs)
        let size = attrStr.size()
        attrStr.draw(at: NSPoint(x: padding, y: bounds.midY - size.height/2))
    }
}

// MARK: - Cursor Window

class CursorWindow: NSWindow {
    let cursorView = CursorView()
    var logicalPosition: CGPoint = CGPoint(x: 400, y: 400)
    var isDragging = false
    var originalMousePosition: CGPoint?  // Store real cursor position on show

    // Invisible 1x1 cursor as fallback when CGDisplayHideCursor doesn't work
    static let invisibleCursor: NSCursor = {
        let image = NSImage(size: NSSize(width: 1, height: 1))
        image.lockFocus()
        NSColor.clear.set()
        NSRect(x: 0, y: 0, width: 1, height: 1).fill()
        image.unlockFocus()
        return NSCursor(image: image, hotSpot: NSPoint(x: 0, y: 0))
    }()

    init() {
        super.init(contentRect: NSRect(x: 400, y: 400, width: 80, height: 80), styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)  // Above everything including screen savers
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        cursorView.frame = NSRect(x: 0, y: 0, width: 80, height: 80)
        cursorView.wantsLayer = true
        contentView = cursorView
    }

    func moveTo(x: CGFloat, y: CGFloat, duration: Double) {
        guard let screen = NSScreen.main else {
            fputs("cursor: no screen\n", stderr)
            return
        }
        let oldPos = logicalPosition
        logicalPosition = CGPoint(x: x, y: y)

        // Position window so cursor tip (at top-left of window) aligns with screen coord (x, y)
        // - Screen coords: y=0 at top, increases downward
        // - Cocoa coords: y=0 at bottom, increases upward
        // - setFrameOrigin sets the BOTTOM-LEFT corner of window
        // - Cursor tip is at TOP-LEFT (0,0 in flipped view)
        // Formula: tipCocoaY = screenHeight - y, windowOriginY = tipCocoaY - windowHeight
        let realMouseTarget = CGPoint(x: x, y: y)
        let windowHeight: CGFloat = 80
        let cocoaY = screen.frame.height - y - windowHeight
        let origin = CGPoint(x: x, y: cocoaY)

        if duration > 0 {
            // Use timer-based animation for reliable cursor movement
            let startOrigin = frame.origin
            let steps = max(Int(duration * 60), 1)
            let stepDuration = duration / Double(steps)

            for i in 0...steps {
                let t = Double(i) / Double(steps)
                // Ease-out cubic for smooth deceleration
                let eased = 1.0 - pow(1.0 - t, 3)
                let newX = startOrigin.x + (origin.x - startOrigin.x) * eased
                let newY = startOrigin.y + (origin.y - startOrigin.y) * eased

                // Interpolate real mouse position
                let mouseX = oldPos.x + (x - oldPos.x) * eased
                let mouseY = oldPos.y + (y - oldPos.y) * eased

                DispatchQueue.main.asyncAfter(deadline: .now() + stepDuration * Double(i)) {
                    // Move overlay window
                    self.setFrameOrigin(CGPoint(x: newX, y: newY))
                    // Move real mouse (source of truth for clicks)
                    CGWarpMouseCursorPosition(CGPoint(x: mouseX, y: mouseY))

                    if self.isDragging {
                        self.postDrag(at: CGPoint(x: mouseX, y: mouseY))
                    }
                }
            }
        } else {
            setFrameOrigin(origin)
            CGWarpMouseCursorPosition(realMouseTarget)
            if isDragging { postDrag(at: realMouseTarget) }
        }
    }

    func postDrag(at p: CGPoint) {
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    }

    // Get current mouse position (the source of truth)
    var mousePosition: CGPoint {
        let event = CGEvent(source: nil)
        return event?.location ?? .zero
    }

    func click() {
        cursorView.animateClick()
        // Click at current mouse position (source of truth)
        DispatchQueue.global().async {
            let p = self.mousePosition
            CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
            usleep(50000)
            CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        }
    }

    func doubleClick() {
        cursorView.animateClick()
        DispatchQueue.global().async {
            let p = self.mousePosition
            for n in 1...2 {
                let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)
                down?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
                down?.post(tap: .cghidEventTap)
                usleep(30000)
                let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)
                up?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
                up?.post(tap: .cghidEventTap)
                usleep(30000)
            }
        }
    }

    func rightClick() {
        cursorView.animateClick()
        DispatchQueue.global().async {
            let p = self.mousePosition
            CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: p, mouseButton: .right)?.post(tap: .cghidEventTap)
            usleep(50000)
            CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: p, mouseButton: .right)?.post(tap: .cghidEventTap)
        }
    }

    func dragStart() {
        isDragging = true
        cursorView.isDragging = true
        cursorView.needsDisplay = true
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: mousePosition, mouseButton: .left)?.post(tap: .cghidEventTap)
    }

    func dragEnd() {
        isDragging = false
        cursorView.isDragging = false
        cursorView.needsDisplay = true
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: logicalPosition, mouseButton: .left)?.post(tap: .cghidEventTap)
    }

    func showCursor() {
        // Store the current mouse position so we can restore it later
        originalMousePosition = NSEvent.mouseLocation

        // Hide system cursor BEFORE showing our window (multiple methods for reliability)
        // 1. Dissociate mouse from cursor - prevents CGWarpMouseCursorPosition from re-showing cursor
        CGAssociateMouseAndMouseCursorPosition(0)
        // 2. Hide via CoreGraphics (system-wide)
        CGDisplayHideCursor(CGMainDisplayID())
        // 3. Hide via AppKit
        NSCursor.hide()
        // 4. Push invisible cursor as fallback (in case other methods fail)
        CursorWindow.invisibleCursor.push()

        // Now show our synthetic cursor window
        orderFrontRegardless()
    }

    func hideCursor() {
        orderOut(nil)

        // Pop the invisible cursor
        NSCursor.pop()
        // Re-associate mouse and cursor
        CGAssociateMouseAndMouseCursorPosition(1)
        // Show system cursor again
        NSCursor.unhide()
        CGDisplayShowCursor(CGMainDisplayID())

        // Restore mouse to original position
        if let original = originalMousePosition, let screen = NSScreen.main {
            // Convert from Cocoa (bottom-left) to CG (top-left)
            let cgY = screen.frame.height - original.y
            CGWarpMouseCursorPosition(CGPoint(x: original.x, y: cgY))
            originalMousePosition = nil
        }
    }
}

// MARK: - Keys Window

class KeysWindow: NSWindow {
    let containerView = NSView()
    var keyViews: [KeyCapView] = []
    var hideWorkItem: DispatchWorkItem?

    init() {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 400, height: 80), styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = .floating
        ignoresMouseEvents = true
        hasShadow = true
        containerView.wantsLayer = true
        containerView.layer?.backgroundColor = NSColor(white: 0.1, alpha: 0.9).cgColor
        containerView.layer?.cornerRadius = 16
        contentView = containerView
        alphaValue = 0
    }

    func showKeys(_ keys: [String]) {
        keyViews.forEach { $0.removeFromSuperview() }
        keyViews.removeAll()

        for key in keys {
            let kv = KeyCapView(key: key)
            keyViews.append(kv)
            containerView.addSubview(kv)
        }

        var x: CGFloat = 16
        for kv in keyViews {
            let size = kv.intrinsicContentSize
            kv.frame = NSRect(x: x, y: 15, width: size.width, height: size.height)
            x += size.width + 8
        }

        let totalWidth = x + 8
        setContentSize(NSSize(width: totalWidth, height: 80))

        if let screen = NSScreen.main {
            let sx = screen.visibleFrame.midX - totalWidth/2
            let sy = screen.visibleFrame.minY + 100
            setFrameOrigin(NSPoint(x: sx, y: sy))
        }

        hideWorkItem?.cancel()
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { $0.duration = 0.15; animator().alphaValue = 1.0 }

        let item = DispatchWorkItem { [weak self] in self?.hideKeys() }
        hideWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: item)
    }

    func hideKeys() {
        NSAnimationContext.runAnimationGroup({ $0.duration = 0.3; animator().alphaValue = 0 }) { self.orderOut(nil) }
    }
}

// MARK: - Typer Window

class TyperWindow: NSWindow {
    let typingView = TypingView()
    var typeTimer: Timer?

    init() {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 500, height: 60), styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = .floating
        ignoresMouseEvents = true
        hasShadow = true
        typingView.frame = NSRect(x: 0, y: 0, width: 500, height: 60)
        contentView = typingView
        alphaValue = 0
    }

    func typeText(_ text: String, style: String = "default", delay: Double = 0.05) {
        typeTimer?.invalidate()
        typingView.style = style
        typingView.displayedText = ""
        typingView.needsDisplay = true

        let font = style == "terminal" || style == "code" ? NSFont.monospacedSystemFont(ofSize: 18, weight: .regular) : NSFont.systemFont(ofSize: 20, weight: .medium)
        let prefix = style == "terminal" ? "$ " : ""
        let size = ((prefix + text + "▌") as NSString).size(withAttributes: [.font: font])
        let width = min(max(size.width + 60, 200), 800)

        setContentSize(NSSize(width: width, height: 60))
        typingView.frame = NSRect(x: 0, y: 0, width: width, height: 60)

        if let screen = NSScreen.main {
            setFrameOrigin(NSPoint(x: screen.visibleFrame.midX - width/2, y: screen.visibleFrame.minY + 180))
        }

        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { $0.duration = 0.15; animator().alphaValue = 1.0 }

        var i = 0
        let chars = Array(text)
        typeTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: true) { [weak self] timer in
            guard let self = self, i < chars.count else { timer.invalidate(); return }
            self.typingView.displayedText.append(chars[i])
            self.typingView.needsDisplay = true
            i += 1
        }
    }

    func clearText() {
        typeTimer?.invalidate()
        typingView.displayedText = ""
        typingView.needsDisplay = true
    }

    func hideTyper() {
        typeTimer?.invalidate()
        NSAnimationContext.runAnimationGroup({ $0.duration = 0.3; animator().alphaValue = 0 }) { self.orderOut(nil) }
    }
}

// MARK: - Label Window (scene info, storyboard notes)

class LabelWindow: NSWindow {
    let label = NSTextField(labelWithString: "")

    init() {
        let screen = NSScreen.main ?? NSScreen.screens[0]
        super.init(contentRect: NSRect(x: 0, y: 0, width: screen.frame.width, height: 60),
                   styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = NSColor.black.withAlphaComponent(0.85)
        level = .floating  // Above normal windows but below viewport mask
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        // Style the label
        label.font = NSFont.systemFont(ofSize: 18, weight: .medium)
        label.textColor = .white
        label.alignment = .center
        label.lineBreakMode = .byWordWrapping
        label.maximumNumberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false

        contentView?.addSubview(label)
        if let contentView = contentView {
            NSLayoutConstraint.activate([
                label.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
                label.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
                label.leadingAnchor.constraint(greaterThanOrEqualTo: contentView.leadingAnchor, constant: 20),
                label.trailingAnchor.constraint(lessThanOrEqualTo: contentView.trailingAnchor, constant: -20)
            ])
        }

        alphaValue = 0
    }

    func showLabel(text: String, position: String = "top", x: CGFloat? = nil, y: CGFloat? = nil, width: CGFloat? = nil) {
        guard let screen = NSScreen.main else {
            fputs("label: no screen!\n", stderr)
            return
        }

        label.stringValue = text

        // Calculate position
        let labelWidth = width ?? screen.frame.width
        let labelX: CGFloat
        let labelY: CGFloat

        if let customX = x, let customY = y {
            // Custom x, y positioning (vif coords: top-left origin)
            labelX = customX
            labelY = screen.frame.height - customY - 60  // Convert to Cocoa coords
            fputs("label: showing '\(text)' at custom (\(customX), \(customY))\n", stderr)
        } else {
            // Named position
            labelX = 0
            switch position {
            case "bottom":
                labelY = 20
            case "top":
                labelY = screen.frame.height - 80
            default:
                labelY = screen.frame.height - 80
            }
            fputs("label: showing '\(text)' at \(position)\n", stderr)
        }

        setFrame(NSRect(x: labelX, y: labelY, width: labelWidth, height: 60), display: true)
        alphaValue = 1.0
        makeKeyAndOrderFront(nil)
    }

    func hideLabel() {
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.3
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }

    func updateText(_ text: String) {
        label.stringValue = text
    }
}

// MARK: - Countdown Window

/// Full-screen countdown overlay (3, 2, 1, GO!)
class CountdownWindow: NSWindow {
    private let countLabel = NSTextField(labelWithString: "")
    private var countdownTimer: Timer?
    private var completionHandler: (() -> Void)?
    private var tickHandler: (() -> Void)?  // Called on each tick

    init() {
        let screen = NSScreen.main ?? NSScreen.screens[0]
        super.init(contentRect: screen.frame,
                   styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = NSColor.black.withAlphaComponent(0.7)
        level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)  // Above everything
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        // Style the count label - large centered number
        countLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 200, weight: .bold)
        countLabel.textColor = .white
        countLabel.alignment = .center
        countLabel.translatesAutoresizingMaskIntoConstraints = false

        contentView?.addSubview(countLabel)
        if let contentView = contentView {
            NSLayoutConstraint.activate([
                countLabel.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
                countLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            ])
        }

        alphaValue = 0
    }

    func startCountdown(from count: Int = 3, onTick: (() -> Void)? = nil, completion: @escaping () -> Void) {
        self.completionHandler = completion
        self.tickHandler = onTick
        var remaining = count

        // Position on screen
        if let screen = NSScreen.main {
            setFrame(screen.frame, display: true)
        }

        alphaValue = 1.0
        makeKeyAndOrderFront(nil)

        // Show initial count and play first tick
        showCount(remaining)
        tickHandler?()

        // Start countdown timer
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }

            remaining -= 1

            if remaining > 0 {
                self.showCount(remaining)
                self.tickHandler?()
            } else if remaining == 0 {
                self.showGo()
            } else {
                timer.invalidate()
                self.hideCountdown()
            }
        }
    }

    private func showCount(_ count: Int) {
        countLabel.stringValue = "\(count)"
        countLabel.textColor = .white

        // Pulse animation
        countLabel.alphaValue = 0.3
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.15
            countLabel.animator().alphaValue = 1.0
        }

        // Scale animation (shrink slightly then grow)
        let transform = CATransform3DMakeScale(0.8, 0.8, 1.0)
        countLabel.layer?.transform = transform
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.2
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            countLabel.layer?.transform = CATransform3DIdentity
        }
    }

    private func showGo() {
        countLabel.stringValue = "●"
        countLabel.textColor = NSColor.systemRed
        countLabel.font = NSFont.systemFont(ofSize: 120, weight: .heavy)

        // Flash animation
        countLabel.alphaValue = 1.0
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.3
            countLabel.animator().alphaValue = 0.5
        }
    }

    func hideCountdown() {
        countdownTimer?.invalidate()
        countdownTimer = nil

        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            animator().alphaValue = 0
        }) { [weak self] in
            self?.orderOut(nil)
            self?.countLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 200, weight: .bold)
            self?.completionHandler?()
            self?.completionHandler = nil
        }
    }

    func cancelCountdown() {
        countdownTimer?.invalidate()
        countdownTimer = nil
        completionHandler = nil
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.1
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }
}

// MARK: - Debug HUD Window

/// Debug HUD shelf - horizontal bar below viewport showing coordinate debug info and action log
class DebugHUDWindow: NSWindow {
    static let shelfHeight: CGFloat = 150  // Taller to fit action log with timestamps

    private var fields: [String: NSTextField] = [:]
    private var actionLog: [(time: String, entry: String)] = []
    private var logLabels: [NSTextField] = []
    private let maxLogLines = 5
    private var modeLabel: NSTextField?
    private var startTime: Date = Date()

    init() {
        // Start with a default size, will be repositioned by show(x:y:width:)
        super.init(contentRect: NSRect(x: 0, y: 0, width: 800, height: DebugHUDWindow.shelfHeight),
                   styleMask: .borderless, backing: .buffered, defer: false)

        isOpaque = false
        backgroundColor = NSColor.black.withAlphaComponent(0.9)
        // Use floating level so HUD is captured by screencapture
        // CGShieldingWindowLevel is too high and gets excluded from recordings
        level = .floating
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        setupUI()
        alphaValue = 0
    }

    private func setupUI() {
        guard let contentView = contentView else { return }

        // Main vertical stack: header + current action + action log
        let mainVerticalStack = NSStackView()
        mainVerticalStack.orientation = .vertical
        mainVerticalStack.spacing = 6
        mainVerticalStack.alignment = .leading
        mainVerticalStack.translatesAutoresizingMaskIntoConstraints = false

        // Header row with title and mode badge
        let headerRow = NSStackView()
        headerRow.orientation = .horizontal
        headerRow.spacing = 12
        headerRow.alignment = .centerY

        let title = NSTextField(labelWithString: "🔧 VIF DEBUG")
        title.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .bold)
        title.textColor = NSColor(calibratedRed: 0.4, green: 0.8, blue: 1.0, alpha: 1.0)
        headerRow.addArrangedSubview(title)

        // Mode badge
        let modeBadge = NSTextField(labelWithString: "STANDALONE")
        modeBadge.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .bold)
        modeBadge.textColor = NSColor.black
        modeBadge.backgroundColor = NSColor(calibratedRed: 1.0, green: 0.6, blue: 0.2, alpha: 1.0)
        modeBadge.isBordered = false
        modeBadge.drawsBackground = true
        modeBadge.alignment = .center
        modeLabel = modeBadge
        headerRow.addArrangedSubview(modeBadge)

        mainVerticalStack.addArrangedSubview(headerRow)

        // Current action row
        let actionRow = NSStackView()
        actionRow.orientation = .horizontal
        actionRow.spacing = 16
        actionRow.alignment = .centerY

        let fieldDefs: [(key: String, label: String)] = [
            ("action", "Action"),
            ("target", "Target"),
            ("screen", "Screen"),
            ("offset", "App"),
        ]

        for def in fieldDefs {
            let pair = createFieldPair(label: def.label, key: def.key)
            actionRow.addArrangedSubview(pair)
        }

        mainVerticalStack.addArrangedSubview(actionRow)

        // Separator line
        let divider = NSBox()
        divider.boxType = .separator
        divider.translatesAutoresizingMaskIntoConstraints = false
        mainVerticalStack.addArrangedSubview(divider)
        divider.widthAnchor.constraint(equalToConstant: 800).isActive = true

        // Log header
        let logHeader = NSTextField(labelWithString: "📋 Action Log")
        logHeader.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .medium)
        logHeader.textColor = NSColor.gray
        mainVerticalStack.addArrangedSubview(logHeader)

        // Action log area
        let logStack = NSStackView()
        logStack.orientation = .vertical
        logStack.spacing = 1
        logStack.alignment = .leading

        // Create 5 log line labels
        for _ in 0..<maxLogLines {
            let logLabel = NSTextField(labelWithString: "")
            logLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
            logLabel.textColor = NSColor(white: 0.6, alpha: 1.0)
            logLabel.lineBreakMode = .byTruncatingTail
            logLabels.append(logLabel)
            logStack.addArrangedSubview(logLabel)
        }

        mainVerticalStack.addArrangedSubview(logStack)

        contentView.addSubview(mainVerticalStack)
        NSLayoutConstraint.activate([
            mainVerticalStack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            mainVerticalStack.trailingAnchor.constraint(lessThanOrEqualTo: contentView.trailingAnchor, constant: -16),
            mainVerticalStack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            mainVerticalStack.bottomAnchor.constraint(lessThanOrEqualTo: contentView.bottomAnchor, constant: -6)
        ])
    }

    private func createFieldPair(label: String, key: String) -> NSView {
        let labelField = NSTextField(labelWithString: "\(label):")
        labelField.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .medium)
        labelField.textColor = NSColor.gray

        let valueField = NSTextField(labelWithString: "—")
        valueField.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        valueField.textColor = NSColor.white
        valueField.lineBreakMode = .byTruncatingTail
        fields[key] = valueField

        let pair = NSStackView(views: [labelField, valueField])
        pair.spacing = 4
        pair.alignment = .firstBaseline

        return pair
    }

    /// Show the HUD at a specific position (vif coordinates: top-left origin)
    func show(x: CGFloat, y: CGFloat, width: CGFloat) {
        guard let screen = NSScreen.main else { return }

        // Convert from vif coords (top-left origin) to Cocoa coords (bottom-left origin)
        let cocoaY = screen.frame.height - y - DebugHUDWindow.shelfHeight

        setFrame(NSRect(x: x, y: cocoaY, width: width, height: DebugHUDWindow.shelfHeight), display: true)
        fputs("[debug] HUD showing at (\(x), \(y)) size \(width)x\(DebugHUDWindow.shelfHeight)\n", stderr)
        alphaValue = 1.0
        makeKeyAndOrderFront(nil)
    }

    /// Show the HUD with default position (bottom of screen)
    func show() {
        guard let screen = NSScreen.main else { return }
        show(x: 0, y: screen.frame.height - DebugHUDWindow.shelfHeight, width: screen.frame.width)
    }

    func hide() {
        fputs("[debug] HUD hiding\n", stderr)
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }

    private func addToLog(_ entry: String) {
        let elapsed = Date().timeIntervalSince(startTime)
        let timestamp = String(format: "%05.2fs", elapsed)
        actionLog.append((time: timestamp, entry: entry))
        // Keep only last maxLogLines
        if actionLog.count > maxLogLines {
            actionLog.removeFirst()
        }
        updateLogDisplay()
    }

    private func updateLogDisplay() {
        DispatchQueue.main.async {
            for (i, label) in self.logLabels.enumerated() {
                if i < self.actionLog.count {
                    let logIndex = self.actionLog.count - 1 - i  // Show newest at top
                    let log = self.actionLog[logIndex]
                    label.stringValue = "[\(log.time)] \(log.entry)"
                    // Fade older entries
                    let alpha = 1.0 - (Double(i) * 0.12)
                    label.textColor = NSColor(white: CGFloat(0.5 + alpha * 0.5), alpha: CGFloat(alpha))
                } else {
                    label.stringValue = ""
                }
            }
        }
    }

    func setMode(_ mode: String) {
        DispatchQueue.main.async {
            let isConnected = mode.lowercased().contains("connected")
            self.modeLabel?.stringValue = isConnected ? " CONNECTED " : " STANDALONE "
            self.modeLabel?.backgroundColor = isConnected
                ? NSColor(calibratedRed: 0.2, green: 0.8, blue: 0.4, alpha: 1.0)
                : NSColor(calibratedRed: 1.0, green: 0.6, blue: 0.2, alpha: 1.0)
        }
    }

    func resetLog() {
        startTime = Date()
        actionLog.removeAll()
        updateLogDisplay()
    }

    func update(_ data: [String: Any]) {
        DispatchQueue.main.async {
            var logEntry = ""

            if let actionText = data["actionText"] as? String {
                self.fields["action"]?.stringValue = actionText
                self.fields["action"]?.textColor = NSColor(calibratedRed: 1.0, green: 0.8, blue: 0.2, alpha: 1.0)
                logEntry = actionText
            }

            if let source = data["source"] as? String {
                // Update mode badge based on source
                self.setMode(source)
            }

            if let target = data["target"] as? String {
                self.fields["target"]?.stringValue = target
                if !logEntry.isEmpty { logEntry += " → " + target }
            }

            if let screen = data["screen"] as? String {
                self.fields["screen"]?.stringValue = screen
                if !logEntry.isEmpty && !logEntry.contains("→") {
                    logEntry += " @ " + screen
                }
            }

            if let offset = data["offset"] as? String {
                self.fields["offset"]?.stringValue = offset
            }

            // Add to action log if we have a meaningful entry
            if !logEntry.isEmpty && !logEntry.hasPrefix("Starting") {
                self.addToLog(logEntry)
            }
        }
    }

    func clear() {
        DispatchQueue.main.async {
            for (_, field) in self.fields {
                field.stringValue = "—"
                field.textColor = NSColor.white
            }
        }
    }
}

// MARK: - Stage Utilities (clean recording environment)

/// Saved state for restoration
var savedVisibleApps: [String] = []
var savedAppPositions: [String: (x: Int, y: Int, w: Int, h: Int)] = [:]

/// Get list of currently visible apps
func getVisibleApps() -> [String] {
    let script = """
    tell application "System Events"
        set visibleApps to {}
        repeat with p in (every process whose visible is true)
            set end of visibleApps to name of p
        end repeat
        return visibleApps
    end tell
    """
    var error: NSDictionary?
    if let scriptObj = NSAppleScript(source: script),
       let result = scriptObj.executeAndReturnError(&error).coerce(toDescriptorType: typeAEList) {
        var apps: [String] = []
        for i in 1...result.numberOfItems {
            if let item = result.atIndex(i)?.stringValue {
                apps.append(item)
            }
        }
        return apps
    }
    return []
}

/// Save current app visibility state
func saveAppState() {
    savedVisibleApps = getVisibleApps()
}

/// Restore app visibility to saved state
func restoreAppState() {
    for appName in savedVisibleApps {
        let script = """
        tell application "System Events"
            try
                set visible of process "\(appName)" to true
            end try
        end tell
        """
        var error: NSDictionary?
        if let scriptObj = NSAppleScript(source: script) {
            scriptObj.executeAndReturnError(&error)
        }
    }
    savedVisibleApps = []
}

/// Hide all apps except the specified one (saves state first)
func hideOtherApps(_ keepApp: String, saveState: Bool = true) -> Bool {
    if saveState {
        saveAppState()
    }
    let script = """
    tell application "System Events"
        set visible of every process whose name is not "\(keepApp)" and name is not "Finder" to false
    end tell
    """
    var error: NSDictionary?
    if let scriptObj = NSAppleScript(source: script) {
        scriptObj.executeAndReturnError(&error)
        return error == nil
    }
    return false
}

/// Hide desktop icons
func hideDesktopIcons() -> Bool {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/defaults")
    task.arguments = ["write", "com.apple.finder", "CreateDesktop", "-bool", "false"]
    try? task.run()
    task.waitUntilExit()

    // Restart Finder to apply
    let killTask = Process()
    killTask.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
    killTask.arguments = ["Finder"]
    try? killTask.run()
    killTask.waitUntilExit()
    return true
}

/// Show desktop icons
func showDesktopIcons() -> Bool {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/defaults")
    task.arguments = ["write", "com.apple.finder", "CreateDesktop", "-bool", "true"]
    try? task.run()
    task.waitUntilExit()

    // Restart Finder to apply
    let killTask = Process()
    killTask.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
    killTask.arguments = ["Finder"]
    try? killTask.run()
    killTask.waitUntilExit()
    return true
}

// MARK: - Backdrop Window (web view behind target app)

class BackdropWindow: NSWindow {
    let webView: WKWebView
    let solidView: NSView  // Solid color view for black backdrop

    init() {
        let screen = NSScreen.main ?? NSScreen.screens[0]

        // Configure web view
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: screen.frame, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")  // Transparent background

        // Create solid black view
        solidView = NSView(frame: screen.frame)
        solidView.wantsLayer = true
        solidView.layer?.backgroundColor = NSColor.black.cgColor

        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = true  // Fully opaque for solid black
        backgroundColor = .black
        // Same level as apps, but we'll order it behind the target app
        level = .normal
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = webView
        setFrameOrigin(screen.frame.origin)
        alphaValue = 0  // Start hidden for fade-in animation

        // Load the backdrop HTML
        loadBackdropHTML()
    }

    func loadBackdropHTML() {
        let html = """
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body {
                    width: 100vw;
                    height: 100vh;
                    background: linear-gradient(135deg, #1e3a5f 0%, #2d1b4e 50%, #1a1a2e 100%);
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    color: white;
                    overflow: hidden;
                }
                #root { width: 100%; height: 100%; position: relative; }

                /* Label styles */
                .label {
                    position: absolute;
                    padding: 12px 24px;
                    background: rgba(0, 0, 0, 0.85);
                    border-radius: 8px;
                    font-size: 18px;
                    font-weight: 500;
                    transition: all 0.3s ease;
                    opacity: 0;
                }
                .label.visible { opacity: 1; }

                /* Callout styles */
                .callout {
                    position: absolute;
                    padding: 16px 20px;
                    background: rgba(59, 130, 246, 0.9);
                    border-radius: 12px;
                    font-size: 16px;
                    max-width: 300px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    transition: all 0.3s ease;
                    opacity: 0;
                }
                .callout.visible { opacity: 1; }
                .callout::before {
                    content: '';
                    position: absolute;
                    width: 12px;
                    height: 12px;
                    background: inherit;
                    transform: rotate(45deg);
                }
                .callout.arrow-left::before { left: -6px; top: 50%; margin-top: -6px; }
                .callout.arrow-right::before { right: -6px; top: 50%; margin-top: -6px; }
                .callout.arrow-top::before { top: -6px; left: 50%; margin-left: -6px; }
                .callout.arrow-bottom::before { bottom: -6px; left: 50%; margin-left: -6px; }
            </style>
        </head>
        <body>
            <div id="root">
                <div style="position:absolute; bottom:20px; right:20px; font-size:14px; opacity:0.5;">vif web backdrop</div>
            </div>
            <script>
                const root = document.getElementById('root');
                const elements = {};

                // Connect to vif server
                const ws = new WebSocket('ws://localhost:7850');

                ws.onopen = () => {
                    console.log('Backdrop connected to vif server');
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.backdrop) handleBackdropCommand(msg.backdrop);
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                };

                function handleBackdropCommand(cmd) {
                    console.log('backdrop cmd:', cmd);
                    const type = cmd.type || cmd.action;  // Support both
                    switch (type) {
                        case 'label':
                            showLabel(cmd);
                            break;
                        case 'callout':
                            showCallout(cmd);
                            break;
                        case 'hide':
                            hideElement(cmd.elementId || cmd.id);
                            break;
                        case 'clear':
                            clearAll();
                            break;
                        case 'html':
                            renderHTML(cmd);
                            break;
                        case 'background':
                            setBackground(cmd);
                            break;
                    }
                }

                function showLabel(cmd) {
                    const elemId = cmd.elementId || cmd.id || 'label-' + Date.now();
                    let el = elements[elemId];
                    if (!el) {
                        el = document.createElement('div');
                        el.className = 'label';
                        el.id = elemId;
                        root.appendChild(el);
                        elements[elemId] = el;
                    }
                    el.textContent = cmd.text || '';
                    el.style.left = (cmd.x || 0) + 'px';
                    el.style.top = (cmd.y || 0) + 'px';
                    if (cmd.width) el.style.width = cmd.width + 'px';
                    if (cmd.fontSize) el.style.fontSize = cmd.fontSize + 'px';
                    if (cmd.color) el.style.color = cmd.color;
                    if (cmd.background) el.style.background = cmd.background;
                    requestAnimationFrame(() => el.classList.add('visible'));
                }

                function showCallout(cmd) {
                    const elemId = cmd.elementId || cmd.id || 'callout-' + Date.now();
                    let el = elements[elemId];
                    if (!el) {
                        el = document.createElement('div');
                        el.className = 'callout';
                        el.id = elemId;
                        root.appendChild(el);
                        elements[elemId] = el;
                    }
                    el.textContent = cmd.text || '';
                    el.style.left = (cmd.x || 0) + 'px';
                    el.style.top = (cmd.y || 0) + 'px';
                    if (cmd.arrow) el.classList.add('arrow-' + cmd.arrow);
                    requestAnimationFrame(() => el.classList.add('visible'));
                }

                function hideElement(elemId) {
                    const el = elements[elemId];
                    if (el) {
                        el.classList.remove('visible');
                        setTimeout(() => el.remove(), 300);
                        delete elements[elemId];
                    }
                }

                function clearAll() {
                    Object.keys(elements).forEach(hideElement);
                    root.innerHTML = '';
                }

                function renderHTML(cmd) {
                    if (cmd.id && cmd.html) {
                        let el = elements[cmd.id];
                        if (!el) {
                            el = document.createElement('div');
                            el.id = cmd.id;
                            root.appendChild(el);
                            elements[cmd.id] = el;
                        }
                        el.innerHTML = cmd.html;
                        if (cmd.style) Object.assign(el.style, cmd.style);
                    }
                }

                function setBackground(cmd) {
                    if (cmd.color) document.body.style.background = cmd.color;
                    if (cmd.gradient) document.body.style.background = cmd.gradient;
                    if (cmd.image) document.body.style.backgroundImage = 'url(' + cmd.image + ')';
                }
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func showBackdrop(type: String = "gradient", behindApp: String? = nil) {
        fputs("backdrop: showing (\(type)), behindApp: \(behindApp ?? "none")\n", stderr)

        // Ensure we cover all screens
        if let screen = NSScreen.main {
            setFrame(screen.frame, display: true)
            solidView.frame = NSRect(origin: .zero, size: screen.frame.size)
            webView.frame = NSRect(origin: .zero, size: screen.frame.size)
        }

        // Set the background based on type
        switch type {
        case "black":
            // Solid black - swap to solid view
            isOpaque = true
            backgroundColor = .black
            contentView = solidView
        case "gradient":
            // Use webview with gradient
            isOpaque = false
            backgroundColor = .clear
            contentView = webView
            // Ensure gradient is set
            sendCommand(["type": "show", "gradient": "linear-gradient(135deg, #1e3a5f 0%, #2d1b4e 50%, #1a1a2e 100%)"])
        default:
            // Custom color or value
            isOpaque = false
            backgroundColor = .clear
            contentView = webView
            sendCommand(["type": "show", "color": type])
        }

        // Show the window
        orderBack(nil)

        // If we have a target app, order ourselves below its window
        if let appName = behindApp, let runningApp = findRunningApp(appName) {
            let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
            if let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
                for winInfo in windowList {
                    if let ownerPID = winInfo[kCGWindowOwnerPID as String] as? Int,
                       ownerPID == runningApp.processIdentifier,
                       let windowNumber = winInfo[kCGWindowNumber as String] as? Int {
                        // Order backdrop below this window
                        order(.below, relativeTo: windowNumber)
                        fputs("[backdrop] ordered below \(appName) window \(windowNumber)\n", stderr)
                        break
                    }
                }
            }
        }

        // Fade in animation
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.15
            animator().alphaValue = 1.0
        }

        fputs("[backdrop] shown at level \(level.rawValue)\n", stderr)
    }

    // Legacy overload for compatibility
    func showBackdrop(color: NSColor) {
        fputs("backdrop: showing (color)\n", stderr)
        isOpaque = true
        backgroundColor = color
        solidView.layer?.backgroundColor = color.cgColor
        contentView = solidView
        makeKeyAndOrderFront(nil)
    }

    func hideBackdrop() {
        fputs("backdrop: hiding\n", stderr)
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.15
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }

    // Send a command to the web view
    func sendCommand(_ cmd: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: cmd),
           let json = String(data: data, encoding: .utf8) {
            let js = "handleBackdropCommand(\(json))"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

/// Find running app by name (supports partial matching, e.g., "Talkie" matches "Talkie Live")
func findRunningApp(_ appName: String) -> NSRunningApplication? {
    let runningApps = NSWorkspace.shared.runningApplications
    // Exact match first
    if let app = runningApps.first(where: { $0.localizedName == appName }) {
        return app
    }
    // Partial match (case-insensitive, name contains search term)
    let lower = appName.lowercased()
    if let app = runningApps.first(where: {
        $0.localizedName?.lowercased().contains(lower) == true ||
        $0.bundleIdentifier?.lowercased().contains(lower) == true
    }) {
        return app
    }
    return nil
}

/// Get window bounds for an app via CGWindow API
func getWindowBounds(forApp appName: String) -> NSRect? {
    guard let app = findRunningApp(appName),
          let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return nil
    }

    for window in windows {
        guard let ownerPID = window[kCGWindowOwnerPID as String] as? Int32,
              ownerPID == app.processIdentifier,
              let layer = window[kCGWindowLayer as String] as? Int32,
              layer == 0,  // Normal window layer
              let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
              let x = bounds["X"], let y = bounds["Y"],
              let w = bounds["Width"], let h = bounds["Height"] else { continue }

        return NSRect(x: x, y: y, width: w, height: h)
    }
    return nil
}

/// Move and resize window using Accessibility API (AXUIElement)
func moveWindowWithAccessibility(appName: String, pid: pid_t, x: CGFloat, y: CGFloat, width: CGFloat?, height: CGFloat?) -> Bool {
    let appElement = AXUIElementCreateApplication(pid)

    var windowsRef: CFTypeRef?
    let windowsResult = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)

    guard windowsResult == .success,
          let windows = windowsRef as? [AXUIElement],
          let frontWindow = windows.first else {
        fputs("[agent] stage.center: AX couldn't get windows for \(appName)\n", stderr)
        return false
    }

    // Set position
    var point = CGPoint(x: x, y: y)
    if let positionValue = AXValueCreate(.cgPoint, &point) {
        let posResult = AXUIElementSetAttributeValue(frontWindow, kAXPositionAttribute as CFString, positionValue)
        if posResult != .success {
            fputs("[agent] stage.center: AX position failed: \(posResult.rawValue)\n", stderr)
        }
    }

    // Set size if specified
    if let w = width, let h = height {
        var size = CGSize(width: w, height: h)
        if let sizeValue = AXValueCreate(.cgSize, &size) {
            let sizeResult = AXUIElementSetAttributeValue(frontWindow, kAXSizeAttribute as CFString, sizeValue)
            if sizeResult != .success {
                fputs("[agent] stage.center: AX size failed: \(sizeResult.rawValue)\n", stderr)
            }
        }
    }

    return true
}

/// Center an app window on screen and return the actual bounds
func centerAppWindow(_ appName: String, width: CGFloat? = nil, height: CGFloat? = nil) -> (success: Bool, bounds: NSRect?) {
    guard let screen = NSScreen.main else { return (false, nil) }

    // Get current window bounds via CGWindow API
    let currentBounds = getWindowBounds(forApp: appName)

    // Calculate target position
    let targetWidth = width ?? currentBounds?.width ?? 800
    let targetHeight = height ?? currentBounds?.height ?? 600
    let targetX = (screen.frame.width - targetWidth) / 2
    let targetY = (screen.frame.height - targetHeight) / 2
    let targetBounds = NSRect(x: targetX, y: targetY, width: targetWidth, height: targetHeight)

    // Check if already at target position (within 5px tolerance)
    if let current = currentBounds {
        let tolerance: CGFloat = 5
        let positionOK = abs(current.origin.x - targetX) < tolerance && abs(current.origin.y - targetY) < tolerance
        let sizeOK = (width == nil && height == nil) ||
                     (abs(current.width - targetWidth) < tolerance && abs(current.height - targetHeight) < tolerance)

        if positionOK && sizeOK {
            fputs("[agent] stage.center: \(appName) already at target position\n", stderr)
            // Still activate it
            let activateScript = "tell application \"\(appName)\" to activate"
            if let scriptObj = NSAppleScript(source: activateScript) {
                var error: NSDictionary?
                scriptObj.executeAndReturnError(&error)
            }
            return (true, current)
        }
    }

    // First activate the app (idempotent - won't launch duplicates)
    let activateScript = "tell application \"\(appName)\" to activate"
    if let scriptObj = NSAppleScript(source: activateScript) {
        var error: NSDictionary?
        scriptObj.executeAndReturnError(&error)
        // Small delay to let app come to front
        Thread.sleep(forTimeInterval: 0.2)
    }

    // Try AppleScript first (use actual app name for System Events process)
    let script: String
    if let w = width, let h = height {
        let x = Int(targetX)
        let y = Int(targetY)
        script = """
        tell application "System Events"
            tell process "\(appName)"
                set frontmost to true
                set w to front window
                set position of w to {\(x), \(y)}
                set size of w to {\(Int(w)), \(Int(h))}
            end tell
        end tell
        """
    } else {
        // Just center at current size
        script = """
        tell application "System Events"
            tell process "\(appName)"
                set frontmost to true
                set w to front window
                set s to size of w
                set wWidth to item 1 of s
                set wHeight to item 2 of s
                set screenWidth to \(Int(screen.frame.width))
                set screenHeight to \(Int(screen.frame.height))
                set newX to (screenWidth - wWidth) / 2
                set newY to (screenHeight - wHeight) / 2
                set position of w to {newX, newY}
            end tell
        end tell
        """
    }

    var appleScriptError: NSDictionary?
    if let scriptObj = NSAppleScript(source: script) {
        scriptObj.executeAndReturnError(&appleScriptError)
        if appleScriptError == nil {
            fputs("[agent] stage.center: AppleScript succeeded for \(appName)\n", stderr)
            return (true, targetBounds)
        }
    }

    // AppleScript failed - try Accessibility API
    fputs("[agent] stage.center: AppleScript failed for \(appName), trying Accessibility API\n", stderr)

    if let app = findRunningApp(appName) {
        let axSuccess = moveWindowWithAccessibility(
            appName: appName,
            pid: app.processIdentifier,
            x: targetX,
            y: targetY,
            width: width,
            height: height
        )

        if axSuccess {
            // Verify the move worked by checking bounds again
            Thread.sleep(forTimeInterval: 0.1)
            if let newBounds = getWindowBounds(forApp: appName) {
                fputs("[agent] stage.center: AX succeeded, bounds: \(newBounds)\n", stderr)
                return (true, newBounds)
            }
            return (true, targetBounds)
        }
    }

    // Both methods failed - but if window exists, return soft success with current bounds
    if let current = currentBounds {
        fputs("[agent] stage.center: positioning failed but window exists at \(current)\n", stderr)
        return (true, current)  // Soft success - window exists, just couldn't move it
    }

    fputs("[agent] stage.center: all methods failed for \(appName)\n", stderr)
    return (false, nil)
}

// MARK: - Viewport Mask Window

class ViewportMaskWindow: NSWindow {
    let maskView: ViewportMaskView

    init() {
        let screen = NSScreen.main ?? NSScreen.screens[0]
        maskView = ViewportMaskView(frame: screen.frame)

        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        // Viewport mask at floating level - ABOVE apps
        // The transparent center shows the app below, dark regions dim everything else
        level = .floating
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = maskView
        alphaValue = 0

        // Position at screen origin (Cocoa coordinates)
        setFrameOrigin(screen.frame.origin)
    }

    /// Set viewport region (vif coordinates: top-left origin)
    func setViewport(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) {
        guard let screen = NSScreen.main else { return }
        // Convert from vif (top-left) to Cocoa (bottom-left)
        let cocoaY = screen.frame.height - y - height
        maskView.viewportRect = NSRect(x: x, y: cocoaY, width: width, height: height)
        maskView.needsDisplay = true
    }

    /// Set viewport to match an app window
    func setViewportToApp(_ appName: String) -> Bool {
        let runningApps = NSWorkspace.shared.runningApplications
        guard let app = runningApps.first(where: { $0.localizedName == appName }),
              let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
            return false
        }

        for window in windows {
            guard let ownerPID = window[kCGWindowOwnerPID as String] as? Int32,
                  ownerPID == app.processIdentifier,
                  let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
                  let x = bounds["X"], let y = bounds["Y"],
                  let w = bounds["Width"], let h = bounds["Height"] else { continue }

            // CGWindow coordinates are already top-left origin like vif
            setViewport(x: x, y: y, width: w, height: h)
            return true
        }
        return false
    }

    func showMask() {
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.3
            animator().alphaValue = 1.0
        }
    }

    func hideMask() {
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.3
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }

    /// Set solid black mode (100% black edges) vs dim mode (70% black edges)
    func setSolidBlack(_ solid: Bool) {
        maskView.setSolidBlack(solid)
        // When solid black, window itself should be opaque for proper rendering
        isOpaque = solid
        backgroundColor = solid ? .black : .clear
    }
}

class ViewportMaskView: NSView {
    var viewportRect: NSRect = .zero
    var maskColor = NSColor.black.withAlphaComponent(0.7)
    var borderColor = NSColor.white.withAlphaComponent(0.8)
    var borderWidth: CGFloat = 2
    var solidBlackMode = false  // When true, edges are 100% black (for backdrop: true)

    func setSolidBlack(_ solid: Bool) {
        solidBlackMode = solid
        maskColor = solid ? NSColor.black : NSColor.black.withAlphaComponent(0.7)
        fputs("[viewport] setSolidBlack(\(solid)) - maskColor alpha: \(maskColor.alphaComponent)\n", stderr)
        needsDisplay = true
        display()  // Force immediate redraw
    }

    override func draw(_ dirtyRect: NSRect) {
        guard viewportRect != .zero else {
            fputs("[viewport] draw: skipped (viewportRect is zero)\n", stderr)
            return
        }

        fputs("[viewport] draw: maskColor alpha=\(maskColor.alphaComponent), solidBlack=\(solidBlackMode)\n", stderr)

        // Draw dark overlay everywhere except viewport
        maskColor.setFill()

        // Top region
        NSRect(x: 0, y: viewportRect.maxY, width: bounds.width, height: bounds.height - viewportRect.maxY).fill()
        // Bottom region
        NSRect(x: 0, y: 0, width: bounds.width, height: viewportRect.minY).fill()
        // Left region
        NSRect(x: 0, y: viewportRect.minY, width: viewportRect.minX, height: viewportRect.height).fill()
        // Right region
        NSRect(x: viewportRect.maxX, y: viewportRect.minY, width: bounds.width - viewportRect.maxX, height: viewportRect.height).fill()

        // Draw border around viewport
        borderColor.setStroke()
        let borderPath = NSBezierPath(rect: viewportRect.insetBy(dx: -borderWidth/2, dy: -borderWidth/2))
        borderPath.lineWidth = borderWidth
        borderPath.stroke()

        // Corner markers for precision
        let markerSize: CGFloat = 20
        let corners = [
            (viewportRect.minX, viewportRect.maxY), // top-left
            (viewportRect.maxX, viewportRect.maxY), // top-right
            (viewportRect.minX, viewportRect.minY), // bottom-left
            (viewportRect.maxX, viewportRect.minY), // bottom-right
        ]

        for (cx, cy) in corners {
            let path = NSBezierPath()
            // Horizontal line
            path.move(to: NSPoint(x: cx - markerSize/2, y: cy))
            path.line(to: NSPoint(x: cx + markerSize/2, y: cy))
            // Vertical line
            path.move(to: NSPoint(x: cx, y: cy - markerSize/2))
            path.line(to: NSPoint(x: cx, y: cy + markerSize/2))
            path.lineWidth = 2
            path.stroke()
        }
    }
}

// MARK: - Control Panel Window

enum PanelPosition: String {
    case topRight = "top-right"
    case topLeft = "top-left"
    case bottomRight = "bottom-right"
    case bottomLeft = "bottom-left"
}

class ControlPanelWindow: NSWindow {
    let panelView = ControlPanelView()
    var onDismiss: (() -> Void)?
    var onStopRecording: (() -> Void)?  // Emits event to stop TS recorder
    var onClearStage: (() -> Void)?     // Clears stage overlays
    var onToggleEventLog: (() -> Void)? // Toggle event log window

    let panelWidth: CGFloat = 200
    var position: PanelPosition = .topRight
    let margin: CGFloat = 10

    init() {
        let initialHeight = ControlPanelView().collapsedHeight
        super.init(contentRect: NSRect(x: 0, y: 0, width: 200, height: initialHeight), styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        // High level - just below cursor, above everything else including backdrop
        level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()))
        ignoresMouseEvents = false  // Allow clicks
        hasShadow = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panelView.frame = NSRect(x: 0, y: 0, width: panelWidth, height: initialHeight)
        panelView.onCloseClick = { [weak self] in
            self?.onDismiss?()
        }
        panelView.onStopRecordingClick = { [weak self] in
            self?.onStopRecording?()
        }
        panelView.onClearStageClick = { [weak self] in
            self?.onClearStage?()
        }
        panelView.onExpandedChanged = { [weak self] expanded in
            self?.animateResize()
        }
        panelView.onToggleEventLog = { [weak self] in
            self?.onToggleEventLog?()
        }
        contentView = panelView
        alphaValue = 0

        // Position in default corner
        updatePosition()
    }

    func setPosition(_ pos: PanelPosition) {
        position = pos
        updatePosition()
        fputs("[panel] position set to \(pos.rawValue)\n", stderr)
    }

    func updatePosition() {
        guard let screen = NSScreen.main else { return }
        let height = panelView.currentHeight
        let frame = screen.visibleFrame

        var x: CGFloat
        var y: CGFloat

        switch position {
        case .topRight:
            x = frame.maxX - panelWidth - margin
            y = frame.maxY - height - margin
        case .topLeft:
            x = frame.minX + margin
            y = frame.maxY - height - margin
        case .bottomRight:
            x = frame.maxX - panelWidth - margin
            y = frame.minY + margin
        case .bottomLeft:
            x = frame.minX + margin
            y = frame.minY + margin
        }

        setFrameOrigin(NSPoint(x: x, y: y))
    }

    // Legacy method for compatibility
    func positionInTopRight() {
        position = .topRight
        updatePosition()
    }

    func updateSize() {
        animateResize()
    }

    func animateResize() {
        let newHeight = panelView.currentHeight
        guard let screen = NSScreen.main else { return }
        let frame = screen.visibleFrame

        var x: CGFloat
        var y: CGFloat

        switch position {
        case .topRight:
            x = frame.maxX - panelWidth - margin
            y = frame.maxY - newHeight - margin
        case .topLeft:
            x = frame.minX + margin
            y = frame.maxY - newHeight - margin
        case .bottomRight:
            x = frame.maxX - panelWidth - margin
            y = frame.minY + margin
        case .bottomLeft:
            x = frame.minX + margin
            y = frame.minY + margin
        }

        let newFrame = NSRect(x: x, y: y, width: panelWidth, height: newHeight)

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.2
            ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            animator().setFrame(newFrame, display: true)
            panelView.animator().frame = NSRect(x: 0, y: 0, width: panelWidth, height: newHeight)
        }
    }

    func showPanel() {
        updatePosition()
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.2
            animator().alphaValue = 1.0
        }
    }

    func hidePanel() {
        panelView.setRecording(false)
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
        }
    }

    func setRecording(_ recording: Bool) {
        panelView.setRecording(recording)
    }

    func setOverlaysVisible(_ visible: Bool) {
        panelView.setOverlaysVisible(visible)
    }

    func updateLayer(_ layer: String, visible: Bool, details: [String: Any] = [:]) {
        panelView.updateLayer(layer, visible: visible, details: details)
        // Auto-show panel when layers become visible
        if visible && panelView.hasStageActive {
            showPanel()
        }
    }

    func clearLayers() {
        panelView.clearLayers()
    }

    func setState(_ state: ControlPanelView.State) {
        panelView.setState(state)
    }

    func setScene(name: String) {
        panelView.setScene(name: name)
        animateResize()
    }

    func clearScene() {
        panelView.clearScene()
        animateResize()
    }

    func setCurrentAction(_ action: String) {
        panelView.setCurrentAction(action)
        animateResize()
    }

    func setProgress(current: Int, total: Int) {
        panelView.setProgress(current: current, total: total)
    }

    func setRecordingPath(_ path: String) {
        panelView.setRecordingPath(path)
    }

    func setTargetMode(_ mode: ControlPanelView.TargetMode) {
        panelView.targetMode = mode
        panelView.needsDisplay = true
    }
}

class ControlPanelView: NSView {
    enum State {
        case idle      // Listening, nothing active
        case active    // Overlays visible
        case recording // Recording in progress
    }

    // Target resolution mode
    enum TargetMode: String {
        case connected = "connected"
        case standalone = "standalone"
        case none = "none"  // No scene running
    }

    // ─── Layer State Tracking ───────────────────────────────────────
    struct LayerState {
        var backdropVisible = false
        var cursorVisible = false
        var cursorPosition: NSPoint = .zero
        var labelVisible = false
        var labelText: String = ""
        var viewportVisible = false
        var viewportRect: NSRect = .zero
        var keysVisible = false
        var keysShown: [String] = []
        var typerVisible = false
        var zoomVisible = false
        var zoomLevel: Double = 1.0
        var zoomType: String = "crop"
        var zoomStartTime: Date? = nil

        var hasAnyVisible: Bool {
            backdropVisible || cursorVisible || labelVisible ||
            viewportVisible || keysVisible || typerVisible || zoomVisible
        }

        var visibleCount: Int {
            [backdropVisible, cursorVisible, labelVisible,
             viewportVisible, keysVisible, typerVisible, zoomVisible].filter { $0 }.count
        }
    }

    var layers = LayerState()
    var stageExpanded = false  // Whether layer list is expanded
    var targetMode: TargetMode = .none  // Current target resolution mode

    // Scene execution state
    var sceneName: String = ""           // Current scene name
    var currentAction: String = ""       // Current action being executed
    var recordingPath: String = ""       // Output path for recording
    var stepProgress: (current: Int, total: Int) = (0, 0)  // Step x of y

    // Separate state tracking
    var isRecording = false
    var hasStageActive: Bool { layers.hasAnyVisible }
    var hasSceneRunning: Bool { !sceneName.isEmpty }

    var state: State = .idle  // Legacy - computed from above
    var pulseTimer: Timer?
    var dotAlpha: CGFloat = 1.0
    var pulseTickCount: Int = 0

    // Callbacks
    var onCloseClick: (() -> Void)?
    var onStopRecordingClick: (() -> Void)?
    var onClearStageClick: (() -> Void)?
    var onToggleLayer: ((String) -> Void)?  // Toggle individual layer
    var onExpandedChanged: ((Bool) -> Void)?  // Notify when expanded changes
    var onToggleEventLog: (() -> Void)?  // Toggle event log visibility
    var eventLogVisible = false  // Track event log state

    // Hover states
    var closeButtonHovered = false
    var stopRecordingHovered = false
    var clearStageHovered = false
    var stageRowHovered = false
    var hoveredLayerIndex: Int? = nil
    var logButtonHovered = false

    // Layout constants
    let rowHeight: CGFloat = 22
    let layerRowHeight: CGFloat = 18
    let actionRowHeight: CGFloat = 20  // Smaller row for current action
    let buttonWidth: CGFloat = 50
    let leftMargin: CGFloat = 14
    let headerHeight: CGFloat = 32
    let footerHeight: CGFloat = 24
    let sceneHeaderHeight: CGFloat = 28  // Scene name header

    // Computed heights
    let zoomRowHeight: CGFloat = 28  // Height for zoom indicator row

    var baseHeight: CGFloat {
        var h = headerHeight + rowHeight * 2 + footerHeight + 16
        if hasSceneRunning {
            h += sceneHeaderHeight  // Scene name row
            if !currentAction.isEmpty {
                h += actionRowHeight  // Current action row
            }
        }
        if layers.zoomVisible {
            h += zoomRowHeight  // Zoom indicator row
        }
        return h
    }
    var collapsedHeight: CGFloat { baseHeight }
    var expandedHeight: CGFloat {
        baseHeight + CGFloat(7) * layerRowHeight + 8  // 7 possible layers (including zoom) + padding
    }
    var currentHeight: CGFloat {
        stageExpanded && hasStageActive ? expandedHeight : collapsedHeight
    }

    var closeButtonRect: NSRect {
        NSRect(x: bounds.width - 28, y: bounds.height - 26, width: 20, height: 20)
    }

    // Row positions (from top)
    var sceneRowY: CGFloat { bounds.height - headerHeight - sceneHeaderHeight }
    var actionRowY: CGFloat { sceneRowY - actionRowHeight }
    var recordingRowY: CGFloat {
        var y = bounds.height - headerHeight - rowHeight - 4
        if hasSceneRunning {
            y -= sceneHeaderHeight
            if !currentAction.isEmpty {
                y -= actionRowHeight
            }
        }
        return y
    }
    var stageRowY: CGFloat { recordingRowY - rowHeight - 4 }

    var stopRecordingRect: NSRect {
        NSRect(x: bounds.width - buttonWidth - 14, y: recordingRowY, width: buttonWidth, height: 20)
    }

    var clearStageRect: NSRect {
        NSRect(x: bounds.width - buttonWidth - 14, y: stageRowY, width: buttonWidth, height: 20)
    }

    var stageExpandRect: NSRect {
        // Clickable area for expanding (the row minus the clear button)
        NSRect(x: leftMargin, y: stageRowY, width: bounds.width - buttonWidth - leftMargin - 20, height: 20)
    }

    override func draw(_ dirtyRect: NSRect) {
        // Background rounded rect with subtle border
        let bgPath = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 12, yRadius: 12)
        NSColor(white: 0.08, alpha: 0.95).setFill()
        bgPath.fill()
        NSColor(white: 0.25, alpha: 0.5).setStroke()
        bgPath.lineWidth = 0.5
        bgPath.stroke()

        // Header: "vif" brand + mode badge + close button
        let brandFont = NSFont.systemFont(ofSize: 16, weight: .bold)
        let brandAttrs: [NSAttributedString.Key: Any] = [
            .font: brandFont,
            .foregroundColor: NSColor.white
        ]
        ("vif" as NSString).draw(at: NSPoint(x: leftMargin, y: bounds.height - 28), withAttributes: brandAttrs)

        // Target mode badge (next to brand)
        if targetMode != .none {
            let badgeFont = NSFont.systemFont(ofSize: 9, weight: .medium)
            let (badgeIcon, badgeText, badgeColor): (String, String, NSColor) = {
                switch targetMode {
                case .connected:
                    return ("📡", "Connected", NSColor.systemGreen)
                case .standalone:
                    return ("📍", "Standalone", NSColor.systemOrange)
                case .none:
                    return ("", "", NSColor.clear)
                }
            }()

            let badgeStr = "\(badgeIcon) \(badgeText)"
            let badgeAttrs: [NSAttributedString.Key: Any] = [
                .font: badgeFont,
                .foregroundColor: badgeColor
            ]
            let badgeSize = (badgeStr as NSString).size(withAttributes: badgeAttrs)

            // Draw badge background
            let badgeRect = NSRect(x: leftMargin + 32, y: bounds.height - 26, width: badgeSize.width + 10, height: 16)
            NSColor(white: 0.15, alpha: 1.0).setFill()
            NSBezierPath(roundedRect: badgeRect, xRadius: 8, yRadius: 8).fill()
            badgeColor.withAlphaComponent(0.3).setStroke()
            NSBezierPath(roundedRect: badgeRect, xRadius: 8, yRadius: 8).stroke()

            // Draw badge text
            (badgeStr as NSString).draw(at: NSPoint(x: badgeRect.minX + 5, y: bounds.height - 25), withAttributes: badgeAttrs)
        }

        // X close button (top-right)
        let xColor = closeButtonHovered ? NSColor.white : NSColor(white: 0.4, alpha: 1.0)
        let xFont = NSFont.systemFont(ofSize: 14, weight: .medium)
        let xAttrs: [NSAttributedString.Key: Any] = [.font: xFont, .foregroundColor: xColor]
        let xStr = "✕"
        let xSize = (xStr as NSString).size(withAttributes: xAttrs)
        (xStr as NSString).draw(at: NSPoint(
            x: closeButtonRect.midX - xSize.width / 2,
            y: closeButtonRect.midY - xSize.height / 2
        ), withAttributes: xAttrs)

        let labelFont = NSFont.systemFont(ofSize: 11, weight: .medium)
        let buttonFont = NSFont.systemFont(ofSize: 10, weight: .medium)

        // ─── Scene Info Section ──────────────────────────────────────
        if hasSceneRunning {
            // Scene name with film icon
            let sceneFont = NSFont.systemFont(ofSize: 11, weight: .semibold)
            let sceneAttrs: [NSAttributedString.Key: Any] = [
                .font: sceneFont,
                .foregroundColor: NSColor.white
            ]
            let displayName = sceneName.count > 18 ? String(sceneName.prefix(15)) + "..." : sceneName
            ("🎬 " + displayName as NSString).draw(at: NSPoint(x: leftMargin, y: sceneRowY + 6), withAttributes: sceneAttrs)

            // Progress indicator (step x of y)
            if stepProgress.total > 0 {
                let progressFont = NSFont.monospacedDigitSystemFont(ofSize: 9, weight: .medium)
                let progressAttrs: [NSAttributedString.Key: Any] = [
                    .font: progressFont,
                    .foregroundColor: NSColor(white: 0.5, alpha: 1.0)
                ]
                let progressStr = "\(stepProgress.current)/\(stepProgress.total)"
                let progressSize = (progressStr as NSString).size(withAttributes: progressAttrs)
                (progressStr as NSString).draw(at: NSPoint(x: bounds.width - progressSize.width - 14, y: sceneRowY + 8), withAttributes: progressAttrs)
            }

            // Current action (if any)
            if !currentAction.isEmpty {
                let actionFont = NSFont.systemFont(ofSize: 10, weight: .regular)
                let actionAttrs: [NSAttributedString.Key: Any] = [
                    .font: actionFont,
                    .foregroundColor: NSColor.systemCyan
                ]
                let displayAction = currentAction.count > 24 ? String(currentAction.prefix(21)) + "..." : currentAction
                ("→ " + displayAction as NSString).draw(at: NSPoint(x: leftMargin + 8, y: actionRowY + 4), withAttributes: actionAttrs)
            }

            // Subtle separator line
            let sepY = recordingRowY + rowHeight + 6
            NSColor(white: 0.2, alpha: 1.0).setStroke()
            let sepPath = NSBezierPath()
            sepPath.move(to: NSPoint(x: leftMargin, y: sepY))
            sepPath.line(to: NSPoint(x: bounds.width - leftMargin, y: sepY))
            sepPath.lineWidth = 0.5
            sepPath.stroke()
        }

        // ─── Zoom Indicator (appears when zoom is active) ───────────
        if layers.zoomVisible {
            let zoomRowY = recordingRowY + rowHeight + 8

            // Zoom icon and level - prominent display
            let zoomFont = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .bold)
            let zoomAttrs: [NSAttributedString.Key: Any] = [
                .font: zoomFont,
                .foregroundColor: NSColor.systemYellow
            ]
            let zoomText = String(format: "🔍 %.1fx %@", layers.zoomLevel, layers.zoomType.uppercased())
            (zoomText as NSString).draw(at: NSPoint(x: leftMargin, y: zoomRowY + 2), withAttributes: zoomAttrs)

            // Duration indicator (time since zoom started)
            if let startTime = layers.zoomStartTime {
                let elapsed = Date().timeIntervalSince(startTime)
                let durationFont = NSFont.monospacedDigitSystemFont(ofSize: 9, weight: .medium)
                let durationAttrs: [NSAttributedString.Key: Any] = [
                    .font: durationFont,
                    .foregroundColor: NSColor.systemYellow.withAlphaComponent(0.7)
                ]
                let durationStr = String(format: "%.1fs", elapsed)
                let durationSize = (durationStr as NSString).size(withAttributes: durationAttrs)
                (durationStr as NSString).draw(at: NSPoint(x: bounds.width - durationSize.width - 14, y: zoomRowY + 4), withAttributes: durationAttrs)
            }

            // Subtle separator below zoom indicator
            let zoomSepY = zoomRowY - 4
            NSColor(white: 0.2, alpha: 1.0).setStroke()
            let zoomSepPath = NSBezierPath()
            zoomSepPath.move(to: NSPoint(x: leftMargin, y: zoomSepY))
            zoomSepPath.line(to: NSPoint(x: bounds.width - leftMargin, y: zoomSepY))
            zoomSepPath.lineWidth = 0.5
            zoomSepPath.stroke()
        }

        // ─── Row 1: Recording ───────────────────────────────────────
        let recDotRect = NSRect(x: leftMargin, y: recordingRowY + 6, width: 8, height: 8)
        if isRecording {
            NSColor.systemRed.withAlphaComponent(dotAlpha).setFill()
        } else {
            NSColor(white: 0.35, alpha: 1.0).setFill()
        }
        NSBezierPath(ovalIn: recDotRect).fill()

        let recLabelColor = isRecording ? NSColor.systemRed : NSColor(white: 0.5, alpha: 1.0)
        let recLabelAttrs: [NSAttributedString.Key: Any] = [.font: labelFont, .foregroundColor: recLabelColor]
        ("Recording" as NSString).draw(at: NSPoint(x: leftMargin + 14, y: recordingRowY + 3), withAttributes: recLabelAttrs)

        // Stop button
        let stopBg = stopRecordingHovered && isRecording ? NSColor(white: 0.25, alpha: 1.0) : NSColor(white: 0.15, alpha: 1.0)
        let stopPath = NSBezierPath(roundedRect: stopRecordingRect, xRadius: 5, yRadius: 5)
        stopBg.setFill()
        stopPath.fill()
        let stopColor = isRecording ? NSColor.systemRed : NSColor(white: 0.35, alpha: 1.0)
        let stopAttrs: [NSAttributedString.Key: Any] = [.font: buttonFont, .foregroundColor: stopColor]
        let stopStr = "Stop"
        let stopSize = (stopStr as NSString).size(withAttributes: stopAttrs)
        (stopStr as NSString).draw(at: NSPoint(
            x: stopRecordingRect.midX - stopSize.width / 2,
            y: stopRecordingRect.midY - stopSize.height / 2
        ), withAttributes: stopAttrs)

        // ─── Row 2: Stage ───────────────────────────────────────────
        let stageDotRect = NSRect(x: leftMargin, y: stageRowY + 6, width: 8, height: 8)
        if hasStageActive {
            NSColor.systemGreen.setFill()
        } else {
            NSColor(white: 0.35, alpha: 1.0).setFill()
        }
        NSBezierPath(ovalIn: stageDotRect).fill()

        // Stage label with expand/collapse indicator
        let stageLabelColor = hasStageActive ? NSColor.systemGreen : NSColor(white: 0.5, alpha: 1.0)
        let stageLabelAttrs: [NSAttributedString.Key: Any] = [.font: labelFont, .foregroundColor: stageLabelColor]
        let expandIcon = (stageExpanded && hasStageActive) ? "▼" : "▶"
        let stageLabel = hasStageActive ? "Stage \(expandIcon)" : "Stage"
        (stageLabel as NSString).draw(at: NSPoint(x: leftMargin + 14, y: stageRowY + 3), withAttributes: stageLabelAttrs)

        // Layer count badge (when collapsed and has layers)
        if hasStageActive && !stageExpanded {
            let countStr = "\(layers.visibleCount)"
            let countFont = NSFont.systemFont(ofSize: 9, weight: .semibold)
            let countAttrs: [NSAttributedString.Key: Any] = [.font: countFont, .foregroundColor: NSColor.white]
            let countSize = (countStr as NSString).size(withAttributes: countAttrs)
            let badgeRect = NSRect(x: leftMargin + 70, y: stageRowY + 4, width: countSize.width + 8, height: 14)
            NSColor(white: 0.3, alpha: 1.0).setFill()
            NSBezierPath(roundedRect: badgeRect, xRadius: 7, yRadius: 7).fill()
            (countStr as NSString).draw(at: NSPoint(x: badgeRect.midX - countSize.width / 2, y: stageRowY + 5), withAttributes: countAttrs)
        }

        // Clear button
        let clearBg = clearStageHovered && hasStageActive ? NSColor(white: 0.25, alpha: 1.0) : NSColor(white: 0.15, alpha: 1.0)
        let clearPath = NSBezierPath(roundedRect: clearStageRect, xRadius: 5, yRadius: 5)
        clearBg.setFill()
        clearPath.fill()
        let clearColor = hasStageActive ? NSColor.white : NSColor(white: 0.35, alpha: 1.0)
        let clearAttrs: [NSAttributedString.Key: Any] = [.font: buttonFont, .foregroundColor: clearColor]
        let clearStr = "Clear"
        let clearSize = (clearStr as NSString).size(withAttributes: clearAttrs)
        (clearStr as NSString).draw(at: NSPoint(
            x: clearStageRect.midX - clearSize.width / 2,
            y: clearStageRect.midY - clearSize.height / 2
        ), withAttributes: clearAttrs)

        // ─── Expanded Layer List ────────────────────────────────────
        if stageExpanded && hasStageActive {
            drawLayerList()
        }

        // ─── Footer: Recording path or keyboard hints + Log button ────────────────
        let smallFont = NSFont.systemFont(ofSize: 9, weight: .regular)
        if isRecording && !recordingPath.isEmpty {
            // Show recording path
            let pathAttrs: [NSAttributedString.Key: Any] = [
                .font: smallFont,
                .foregroundColor: NSColor.systemRed.withAlphaComponent(0.8)
            ]
            let fileName = (recordingPath as NSString).lastPathComponent
            let displayPath = fileName.count > 20 ? "..." + String(fileName.suffix(17)) : fileName
            ("📼 " + displayPath as NSString).draw(at: NSPoint(x: leftMargin - 4, y: 8), withAttributes: pathAttrs)
        } else {
            let hintAttrs: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: NSColor(white: 0.4, alpha: 1.0)]
            ("ESC dismiss" as NSString).draw(at: NSPoint(x: leftMargin - 4, y: 8), withAttributes: hintAttrs)
        }

        // Log toggle button (right side of footer)
        let logBg = logButtonHovered ? NSColor(white: 0.25, alpha: 1.0) : NSColor(white: 0.15, alpha: 1.0)
        let logPath = NSBezierPath(roundedRect: logButtonRect, xRadius: 4, yRadius: 4)
        logBg.setFill()
        logPath.fill()
        let logColor = eventLogVisible ? NSColor.systemCyan : NSColor(white: 0.5, alpha: 1.0)
        let logAttrs: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: logColor]
        let logStr = eventLogVisible ? "📋 Log ●" : "📋 Log"
        let logSize = (logStr as NSString).size(withAttributes: logAttrs)
        (logStr as NSString).draw(at: NSPoint(
            x: logButtonRect.midX - logSize.width / 2,
            y: logButtonRect.midY - logSize.height / 2
        ), withAttributes: logAttrs)
    }

    var logButtonRect: NSRect {
        NSRect(x: bounds.width - 55, y: 4, width: 48, height: 18)
    }

    func drawLayerList() {
        let layerFont = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        let layerIndent: CGFloat = leftMargin + 12
        var yPos = stageRowY - 6

        // Define layers to show
        let layerDefs: [(String, Bool, String)] = [
            ("Backdrop", layers.backdropVisible, ""),
            ("Cursor", layers.cursorVisible, layers.cursorVisible ? String(format: "(%.0f, %.0f)", layers.cursorPosition.x, layers.cursorPosition.y) : ""),
            ("Label", layers.labelVisible, layers.labelVisible ? "\"\(String(layers.labelText.prefix(16)))\(layers.labelText.count > 16 ? "..." : "")\"" : ""),
            ("Viewport", layers.viewportVisible, layers.viewportVisible ? String(format: "%.0fx%.0f", layers.viewportRect.width, layers.viewportRect.height) : ""),
            ("Keys", layers.keysVisible, layers.keysVisible ? layers.keysShown.joined(separator: "+") : ""),
            ("Typer", layers.typerVisible, ""),
            ("Zoom", layers.zoomVisible, layers.zoomVisible ? String(format: "%.1fx %@", layers.zoomLevel, layers.zoomType) : ""),
        ]

        for (index, (name, visible, detail)) in layerDefs.enumerated() {
            yPos -= layerRowHeight

            // Dot indicator
            let dotRect = NSRect(x: layerIndent, y: yPos + 5, width: 6, height: 6)
            if visible {
                NSColor.systemGreen.withAlphaComponent(0.8).setFill()
            } else {
                NSColor(white: 0.25, alpha: 1.0).setFill()
            }
            NSBezierPath(ovalIn: dotRect).fill()

            // Layer name
            let nameColor = visible ? NSColor(white: 0.8, alpha: 1.0) : NSColor(white: 0.4, alpha: 1.0)
            let isHovered = hoveredLayerIndex == index
            let nameAttrs: [NSAttributedString.Key: Any] = [
                .font: layerFont,
                .foregroundColor: isHovered ? NSColor.white : nameColor
            ]
            (name as NSString).draw(at: NSPoint(x: layerIndent + 12, y: yPos + 2), withAttributes: nameAttrs)

            // Detail (position, text preview, etc.)
            if !detail.isEmpty {
                let detailAttrs: [NSAttributedString.Key: Any] = [
                    .font: layerFont,
                    .foregroundColor: NSColor(white: 0.5, alpha: 1.0)
                ]
                (detail as NSString).draw(at: NSPoint(x: layerIndent + 70, y: yPos + 2), withAttributes: detailAttrs)
            }
        }
    }

    // Track dragging state
    private var isDragging = false
    private var dragStartPoint: NSPoint = .zero

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)

        if closeButtonRect.contains(point) {
            onCloseClick?()
        } else if stopRecordingRect.contains(point) && isRecording {
            onStopRecordingClick?()
        } else if clearStageRect.contains(point) && hasStageActive {
            onClearStageClick?()
        } else if stageExpandRect.contains(point) && hasStageActive {
            // Toggle stage expansion
            stageExpanded = !stageExpanded
            onExpandedChanged?(stageExpanded)
            needsDisplay = true
        } else if logButtonRect.contains(point) {
            // Toggle event log
            eventLogVisible = !eventLogVisible
            onToggleEventLog?()
            needsDisplay = true
        } else {
            // Start dragging if clicking in empty area
            isDragging = true
            dragStartPoint = event.locationInWindow
        }
    }

    override func mouseDragged(with event: NSEvent) {
        guard isDragging, let window = window else { return }

        let currentPoint = event.locationInWindow
        let deltaX = currentPoint.x - dragStartPoint.x
        let deltaY = currentPoint.y - dragStartPoint.y

        var newOrigin = window.frame.origin
        newOrigin.x += deltaX
        newOrigin.y += deltaY

        window.setFrameOrigin(newOrigin)
    }

    override func mouseUp(with event: NSEvent) {
        isDragging = false
    }

    override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let wasCloseHovered = closeButtonHovered
        let wasStopHovered = stopRecordingHovered
        let wasClearHovered = clearStageHovered
        let wasStageHovered = stageRowHovered
        let wasLogHovered = logButtonHovered

        closeButtonHovered = closeButtonRect.contains(point)
        stopRecordingHovered = stopRecordingRect.contains(point)
        clearStageHovered = clearStageRect.contains(point)
        stageRowHovered = stageExpandRect.contains(point)
        logButtonHovered = logButtonRect.contains(point)

        // Check layer hover (when expanded)
        let oldHoveredLayer = hoveredLayerIndex
        hoveredLayerIndex = nil
        if stageExpanded && hasStageActive {
            var yPos = stageRowY - 6
            for i in 0..<7 {  // 7 layers including zoom
                yPos -= layerRowHeight
                let layerRect = NSRect(x: leftMargin + 12, y: yPos, width: bounds.width - 40, height: layerRowHeight)
                if layerRect.contains(point) {
                    hoveredLayerIndex = i
                    break
                }
            }
        }

        if wasCloseHovered != closeButtonHovered ||
           wasStopHovered != stopRecordingHovered ||
           wasClearHovered != clearStageHovered ||
           wasStageHovered != stageRowHovered ||
           wasLogHovered != logButtonHovered ||
           oldHoveredLayer != hoveredLayerIndex {
            needsDisplay = true
        }
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas {
            removeTrackingArea(area)
        }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseMoved, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    // ─── State Management ───────────────────────────────────────────

    func setRecording(_ recording: Bool) {
        isRecording = recording
        if recording {
            startPulsing()
        } else {
            stopPulsing()
        }
        needsDisplay = true
    }

    func setOverlaysVisible(_ visible: Bool) {
        // Legacy - now handled via layer state
        needsDisplay = true
    }

    func updateLayer(_ layer: String, visible: Bool, details: [String: Any] = [:]) {
        switch layer {
        case "backdrop":
            layers.backdropVisible = visible
        case "cursor":
            layers.cursorVisible = visible
            if let x = details["x"] as? Double, let y = details["y"] as? Double {
                layers.cursorPosition = NSPoint(x: x, y: y)
            }
        case "label":
            layers.labelVisible = visible
            if let text = details["text"] as? String {
                layers.labelText = text
            }
        case "viewport":
            layers.viewportVisible = visible
            if let rect = details["rect"] as? NSRect {
                layers.viewportRect = rect
            }
        case "keys":
            layers.keysVisible = visible
            if let keys = details["keys"] as? [String] {
                layers.keysShown = keys
            }
        case "typer":
            layers.typerVisible = visible
        case "zoom":
            layers.zoomVisible = visible
            if visible {
                layers.zoomStartTime = Date()
                startPulsing()  // Start refresh timer for elapsed time display
            } else {
                layers.zoomStartTime = nil
                if !isRecording {
                    stopPulsing()  // Stop timer if not recording
                }
            }
            if let level = details["level"] as? Double {
                layers.zoomLevel = level
            }
            if let type = details["type"] as? String {
                layers.zoomType = type
            }
            // Update panel size to accommodate zoom row
            if let window = window as? ControlPanelWindow {
                window.updateSize()
            }
        default:
            break
        }
        needsDisplay = true
    }

    func clearLayers() {
        layers = LayerState()
        stageExpanded = false
        needsDisplay = true
    }

    func setScene(name: String) {
        sceneName = name
        currentAction = ""
        stepProgress = (0, 0)
        onExpandedChanged?(false)  // Trigger resize
        needsDisplay = true
    }

    func clearScene() {
        sceneName = ""
        currentAction = ""
        recordingPath = ""
        stepProgress = (0, 0)
        onExpandedChanged?(false)  // Trigger resize
        needsDisplay = true
    }

    func setCurrentAction(_ action: String) {
        currentAction = action
        onExpandedChanged?(false)  // Trigger resize for action row
        needsDisplay = true
    }

    func setProgress(current: Int, total: Int) {
        stepProgress = (current, total)
        needsDisplay = true
    }

    func setRecordingPath(_ path: String) {
        recordingPath = path
        needsDisplay = true
    }

    // Legacy method for compatibility
    func setState(_ newState: State) {
        state = newState
        switch newState {
        case .recording:
            isRecording = true
        case .active:
            isRecording = false
        case .idle:
            isRecording = false
            clearLayers()
        }
        if isRecording {
            startPulsing()
        } else {
            stopPulsing()
        }
        needsDisplay = true
    }

    func startPulsing() {
        pulseTimer?.invalidate()
        pulseTickCount = 0
        pulseTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            // Pulse recording dot
            if self.isRecording {
                // Slower pulse for recording (every 5 ticks = 0.5s)
                self.pulseTickCount += 1
                if self.pulseTickCount >= 5 {
                    self.dotAlpha = self.dotAlpha > 0.5 ? 0.3 : 1.0
                    self.pulseTickCount = 0
                }
            }
            // Refresh display for zoom elapsed time
            if self.layers.zoomVisible || self.isRecording {
                self.needsDisplay = true
            }
        }
    }

    func stopPulsing() {
        pulseTimer?.invalidate()
        pulseTimer = nil
        dotAlpha = 1.0
        needsDisplay = true
    }
}

// MARK: - Event Log Window (Producer's Timeline)

struct LogEntry {
    let timestamp: Date
    let icon: String
    let action: String
    let details: String

    var relativeTime: String {
        // Will be computed relative to scene start
        return ""
    }
}

class EventLogView: NSView {
    var entries: [LogEntry] = []
    var sceneStartTime: Date? = nil
    var onCopyClick: (() -> Void)?

    private let rowHeight: CGFloat = 18
    private let leftMargin: CGFloat = 10
    private let maxVisibleEntries = 20

    var scrollOffset: Int = 0  // How many entries to skip from the end

    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        // Background
        let bgPath = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 10, yRadius: 10)
        NSColor(white: 0.05, alpha: 0.92).setFill()
        bgPath.fill()
        NSColor(white: 0.25, alpha: 0.4).setStroke()
        bgPath.lineWidth = 0.5
        bgPath.stroke()

        // Header
        let headerFont = NSFont.systemFont(ofSize: 11, weight: .semibold)
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: headerFont,
            .foregroundColor: NSColor.white
        ]
        ("📋 Event Log" as NSString).draw(at: NSPoint(x: leftMargin, y: 8), withAttributes: headerAttrs)

        // Copy button
        let copyFont = NSFont.systemFont(ofSize: 9, weight: .medium)
        let copyAttrs: [NSAttributedString.Key: Any] = [
            .font: copyFont,
            .foregroundColor: NSColor.systemBlue
        ]
        let copyStr = "Copy"
        let copySize = (copyStr as NSString).size(withAttributes: copyAttrs)
        (copyStr as NSString).draw(at: NSPoint(x: bounds.width - copySize.width - 12, y: 10), withAttributes: copyAttrs)

        // Separator
        NSColor(white: 0.2, alpha: 1.0).setStroke()
        let sepPath = NSBezierPath()
        sepPath.move(to: NSPoint(x: leftMargin, y: 28))
        sepPath.line(to: NSPoint(x: bounds.width - leftMargin, y: 28))
        sepPath.lineWidth = 0.5
        sepPath.stroke()

        // Entries
        let entryFont = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        let timeFont = NSFont.monospacedDigitSystemFont(ofSize: 9, weight: .medium)

        let startY: CGFloat = 34
        let visibleCount = min(entries.count, maxVisibleEntries)
        let startIndex = max(0, entries.count - visibleCount - scrollOffset)
        let endIndex = min(entries.count, startIndex + visibleCount)

        for (displayIndex, entryIndex) in (startIndex..<endIndex).enumerated() {
            let entry = entries[entryIndex]
            let y = startY + CGFloat(displayIndex) * rowHeight

            // Timestamp
            let relTime = formatRelativeTime(entry.timestamp)
            let timeAttrs: [NSAttributedString.Key: Any] = [
                .font: timeFont,
                .foregroundColor: NSColor(white: 0.5, alpha: 1.0)
            ]
            (relTime as NSString).draw(at: NSPoint(x: leftMargin, y: y), withAttributes: timeAttrs)

            // Icon + Action
            let iconAttrs: [NSAttributedString.Key: Any] = [
                .font: entryFont,
                .foregroundColor: NSColor.white
            ]
            let actionText = "\(entry.icon) \(entry.action)"
            (actionText as NSString).draw(at: NSPoint(x: leftMargin + 52, y: y), withAttributes: iconAttrs)

            // Details (if any, truncated)
            if !entry.details.isEmpty {
                let detailAttrs: [NSAttributedString.Key: Any] = [
                    .font: entryFont,
                    .foregroundColor: NSColor(white: 0.6, alpha: 1.0)
                ]
                let truncated = entry.details.count > 20 ? String(entry.details.prefix(17)) + "..." : entry.details
                (truncated as NSString).draw(at: NSPoint(x: bounds.width - 100, y: y), withAttributes: detailAttrs)
            }
        }

        // Scroll indicators if needed
        if entries.count > maxVisibleEntries {
            let indicatorAttrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 8),
                .foregroundColor: NSColor(white: 0.4, alpha: 1.0)
            ]
            if startIndex > 0 {
                ("▲ more" as NSString).draw(at: NSPoint(x: bounds.width / 2 - 15, y: 30), withAttributes: indicatorAttrs)
            }
            if endIndex < entries.count {
                ("▼ more" as NSString).draw(at: NSPoint(x: bounds.width / 2 - 15, y: bounds.height - 14), withAttributes: indicatorAttrs)
            }
        }

        // Empty state
        if entries.isEmpty {
            let emptyAttrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 10),
                .foregroundColor: NSColor(white: 0.4, alpha: 1.0)
            ]
            ("No events yet..." as NSString).draw(at: NSPoint(x: leftMargin, y: startY), withAttributes: emptyAttrs)
        }
    }

    func formatRelativeTime(_ date: Date) -> String {
        guard let start = sceneStartTime else {
            return "00:00.0"
        }
        let elapsed = date.timeIntervalSince(start)
        let minutes = Int(elapsed) / 60
        let seconds = Int(elapsed) % 60
        let tenths = Int((elapsed - floor(elapsed)) * 10)
        return String(format: "%02d:%02d.%d", minutes, seconds, tenths)
    }

    func addEntry(icon: String, action: String, details: String = "") {
        let entry = LogEntry(timestamp: Date(), icon: icon, action: action, details: details)
        entries.append(entry)
        scrollOffset = 0  // Auto-scroll to bottom
        needsDisplay = true
    }

    func clearLog() {
        entries.removeAll()
        sceneStartTime = nil
        scrollOffset = 0
        needsDisplay = true
    }

    func startScene(_ name: String) {
        sceneStartTime = Date()
        addEntry(icon: "▶", action: "Scene started", details: name)
    }

    func copyToClipboard() {
        var text = "vif Event Log\n"
        text += "═════════════════════════════════════════\n"
        for entry in entries {
            let time = formatRelativeTime(entry.timestamp)
            let line = "\(time)  \(entry.icon) \(entry.action)"
            if !entry.details.isEmpty {
                text += "\(line) - \(entry.details)\n"
            } else {
                text += "\(line)\n"
            }
        }
        text += "═════════════════════════════════════════\n"

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    // Mouse handling for copy button and scrolling
    private var copyButtonRect: NSRect {
        NSRect(x: bounds.width - 50, y: 4, width: 45, height: 20)
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if copyButtonRect.contains(point) {
            copyToClipboard()
            onCopyClick?()
        }
    }

    override func scrollWheel(with event: NSEvent) {
        if event.deltaY > 0 {
            scrollOffset = min(scrollOffset + 1, max(0, entries.count - maxVisibleEntries))
        } else if event.deltaY < 0 {
            scrollOffset = max(0, scrollOffset - 1)
        }
        needsDisplay = true
    }
}

class EventLogWindow: NSWindow {
    let logView: EventLogView
    private let logWidth: CGFloat = 280
    private let logHeight: CGFloat = 400
    private let margin: CGFloat = 20

    // Position relative to control panel
    var panelPosition: PanelPosition = .topRight

    init() {
        logView = EventLogView(frame: NSRect(x: 0, y: 0, width: 280, height: 400))

        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 280, height: 400),
            styleMask: .borderless,
            backing: .buffered,
            defer: true
        )

        isOpaque = false
        backgroundColor = .clear
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .stationary]
        isMovableByWindowBackground = true

        contentView = logView

        logView.onCopyClick = { [weak self] in
            self?.flashCopyConfirmation()
        }
    }

    func updatePosition() {
        guard let screen = NSScreen.main else { return }
        let frame = screen.visibleFrame
        let panelWidth: CGFloat = 200  // Approximate control panel width

        var x: CGFloat
        var y: CGFloat

        // Position to the left of the control panel (or right if panel is on left)
        switch panelPosition {
        case .topRight:
            x = frame.maxX - panelWidth - logWidth - margin * 2
            y = frame.maxY - logHeight - margin
        case .topLeft:
            x = frame.minX + panelWidth + margin * 2
            y = frame.maxY - logHeight - margin
        case .bottomRight:
            x = frame.maxX - panelWidth - logWidth - margin * 2
            y = frame.minY + margin
        case .bottomLeft:
            x = frame.minX + panelWidth + margin * 2
            y = frame.minY + margin
        }

        setFrameOrigin(NSPoint(x: x, y: y))
    }

    func showLog() {
        updatePosition()
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.2
            animator().alphaValue = 1.0
        }
        fputs("[agent] event log: showing\n", stderr)
    }

    func hideLog() {
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            animator().alphaValue = 0.0
        }, completionHandler: {
            self.orderOut(nil)
        })
        fputs("[agent] event log: hiding\n", stderr)
    }

    func flashCopyConfirmation() {
        // Brief flash to confirm copy
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.1
            animator().alphaValue = 0.5
        }, completionHandler: {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.1
                self.animator().alphaValue = 1.0
            }
        })
        fputs("[agent] event log: copied to clipboard\n", stderr)
    }

    // Convenience methods for logging (always dispatch to main thread for safety)
    func log(_ icon: String, _ action: String, _ details: String = "") {
        DispatchQueue.main.async { [weak self] in
            self?.logView.addEntry(icon: icon, action: action, details: details)
        }
    }

    func startScene(_ name: String) {
        DispatchQueue.main.async { [weak self] in
            self?.logView.startScene(name)
        }
    }

    func clear() {
        DispatchQueue.main.async { [weak self] in
            self?.logView.clearLog()
        }
    }
}

// Keep SceneIndicatorWindow for backwards compatibility but we'll use ControlPanelWindow
class SceneIndicatorWindow: NSWindow {
    init() {
        super.init(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: true)
    }
    func showIndicator() {}
    func hideIndicator() {}
}

// MARK: - Screen Recorder

class ScreenRecorder {
    enum Mode: String {
        case draft
        case final_

        var preset: String {
            switch self {
            case .draft: return "ultrafast"
            case .final_: return "slow"
            }
        }

        var crf: Int {
            switch self {
            case .draft: return 28
            case .final_: return 18
            }
        }

        var fps: Int {
            switch self {
            case .draft: return 30
            case .final_: return 60
            }
        }
    }

    private var process: Process?
    private var isRecording = false
    private var currentOutputPath: String?
    private var currentMode: Mode = .draft
    private var viewportRect: NSRect = .zero

    static let vifDir: String = {
        let path = NSHomeDirectory() + "/.vif"
        try? FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        return path
    }()

    static let recordingsDir: String = {
        let path = vifDir + "/recordings"
        try? FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        return path
    }()

    func setViewport(_ rect: NSRect) {
        self.viewportRect = rect
    }

    func start(mode: Mode = .draft, name: String? = nil) -> (success: Bool, path: String?, error: String?) {
        guard !isRecording else {
            return (false, nil, "Already recording")
        }

        // Determine output path
        let outputPath: String
        if mode == .draft {
            outputPath = ScreenRecorder.vifDir + "/draft.mp4"
            // Remove existing draft
            try? FileManager.default.removeItem(atPath: outputPath)
        } else {
            let timestamp = ISO8601DateFormatter().string(from: Date())
                .replacingOccurrences(of: ":", with: "-")
                .replacingOccurrences(of: "T", with: "_")
                .prefix(19)
            let fileName = name ?? "recording"
            outputPath = ScreenRecorder.recordingsDir + "/\(fileName)_\(timestamp).mp4"
        }

        currentOutputPath = outputPath
        currentMode = mode

        // Get recording region (viewport or full screen)
        guard let screen = NSScreen.main else {
            return (false, nil, "No screen available")
        }

        let captureRect: NSRect
        if viewportRect != .zero {
            // Convert from Cocoa (bottom-left) to screencapture (top-left)
            let y = screen.frame.height - viewportRect.maxY
            captureRect = NSRect(x: viewportRect.minX, y: y, width: viewportRect.width, height: viewportRect.height)
        } else {
            captureRect = screen.frame
        }

        // Build ffmpeg command
        // Use avfoundation to capture screen, then crop to viewport
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")

        // Calculate crop filter if viewport is set
        let cropFilter: String
        if viewportRect != .zero {
            // viewportRect is in Cocoa coords (logical points, bottom-left origin)
            // FFmpeg captures at physical pixels, so we need to scale by backingScaleFactor
            // FFmpeg crop uses top-left origin: crop=w:h:x:y
            let scale = screen.backingScaleFactor

            // Convert logical points to physical pixels
            let x = Int(viewportRect.minX * scale)
            let y = Int((screen.frame.height - viewportRect.maxY) * scale)
            let w = Int(viewportRect.width * scale)
            let h = Int(viewportRect.height * scale)

            fputs("recorder: scale=\(scale) screenH=\(Int(screen.frame.height)) physical=\(Int(screen.frame.height * scale))\n", stderr)
            fputs("recorder: viewport Cocoa=(\(Int(viewportRect.minX)),\(Int(viewportRect.minY)),\(Int(viewportRect.width)),\(Int(viewportRect.height)))\n", stderr)
            fputs("recorder: crop ffmpeg x=\(x) y=\(y) w=\(w) h=\(h)\n", stderr)

            cropFilter = "crop=\(w):\(h):\(x):\(y),"
        } else {
            fputs("recorder: WARNING - viewportRect is zero, capturing full screen\n", stderr)
            cropFilter = ""
        }

        // Scale to even dimensions (required by libx264)
        let scaleFilter = "scale=trunc(iw/2)*2:trunc(ih/2)*2"

        process.arguments = [
            "ffmpeg",
            "-y",  // Overwrite output
            "-f", "avfoundation",
            "-capture_cursor", "0",  // Don't capture system cursor (we have our own)
            "-framerate", "\(mode.fps)",
            "-i", "3:none",  // Screen capture device (index 3 = "Capture screen 0")
            "-vf", "\(cropFilter)\(scaleFilter)",
            "-c:v", "libx264",
            "-preset", mode.preset,
            "-crf", "\(mode.crf)",
            "-pix_fmt", "yuv420p",
            outputPath
        ]

        // Suppress ffmpeg output
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            self.process = process
            isRecording = true
            fputs("recorder: started \(mode.rawValue) → \(outputPath)\n", stderr)
            return (true, outputPath, nil)
        } catch {
            return (false, nil, "Failed to start ffmpeg: \(error.localizedDescription)")
        }
    }

    func stop() -> (success: Bool, path: String?, error: String?) {
        guard isRecording, let process = process else {
            return (false, nil, "Not recording")
        }

        // Send SIGINT to gracefully stop ffmpeg (like Ctrl+C)
        kill(process.processIdentifier, SIGINT)

        // Wait for process to finish
        process.waitUntilExit()

        isRecording = false
        let path = currentOutputPath
        self.process = nil

        fputs("recorder: stopped → \(path ?? "nil")\n", stderr)

        // Get file size
        if let path = path, let attrs = try? FileManager.default.attributesOfItem(atPath: path) {
            let size = attrs[.size] as? Int64 ?? 0
            let sizeMB = Double(size) / 1_000_000.0
            fputs("recorder: file size = \(String(format: "%.1f", sizeMB)) MB\n", stderr)
        }

        return (true, path, nil)
    }

    func status() -> (recording: Bool, mode: String?, path: String?) {
        return (isRecording, isRecording ? currentMode.rawValue : nil, currentOutputPath)
    }
}

// MARK: - Agent

class VifAgent: NSObject, NSApplicationDelegate {
    // Lazy initialization - windows only created when first accessed
    lazy var cursorWindow = CursorWindow()
    lazy var keysWindow = KeysWindow()
    lazy var typerWindow = TyperWindow()
    lazy var sceneIndicator = SceneIndicatorWindow()
    lazy var viewportMask = ViewportMaskWindow()
    lazy var backdrop = BackdropWindow()
    lazy var labelWindow = LabelWindow()
    lazy var countdownWindow = CountdownWindow()
    lazy var debugHUD = DebugHUDWindow()
    lazy var recorder = ScreenRecorder()
    lazy var controlPanel = ControlPanelWindow()
    lazy var eventLog = EventLogWindow()
    var headlessMode = false  // When true, control panel stays hidden
    var eventLogVisible = false  // Event log visibility state

    /// Registry of windows currently visible on screen
    /// The agent tracks what it paints so it can clean up properly
    /// Maps ObjectIdentifier -> NSWindow so we can both check and iterate
    var visibleWindows: [ObjectIdentifier: NSWindow] = [:]

    /// Mark a window as visible (add to tracking)
    func windowShown(_ window: NSWindow) {
        visibleWindows[ObjectIdentifier(window)] = window
    }

    /// Mark a window as hidden (remove from tracking)
    func windowHidden(_ window: NSWindow) {
        visibleWindows.removeValue(forKey: ObjectIdentifier(window))
    }

    /// Check if a window is currently tracked as visible
    func isWindowVisible(_ window: NSWindow) -> Bool {
        visibleWindows[ObjectIdentifier(window)] != nil
    }

    /// Get all currently visible windows
    var allVisibleWindows: [NSWindow] {
        Array(visibleWindows.values)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Emit ready FIRST so server knows we're alive
        print("{\"event\":\"ready\",\"version\":\"1.0\"}")
        fflush(stdout)

        // Read stdin
        DispatchQueue.global(qos: .userInteractive).async {
            while let line = readLine() {
                self.handleCommand(line)
            }
        }

        // Check accessibility (non-blocking for startup)
        DispatchQueue.main.async {
            if !checkAccessibility() {
                fputs("vif-agent: accessibility permission required\n", stderr)
            }
        }

        // Wire up control panel buttons
        controlPanel.onDismiss = { [weak self] in
            self?.dismissAll()
        }
        controlPanel.onStopRecording = { [weak self] in
            guard let self = self else { return }
            // Emit event to server/runner to stop the TypeScript recorder
            print("{\"event\":\"user_stop_recording\"}")
            fflush(stdout)
            // Update local UI state
            self.controlPanel.setRecording(false)
            fputs("[agent] user requested stop recording\n", stderr)
        }
        controlPanel.onClearStage = { [weak self] in
            guard let self = self else { return }
            self.clearOverlays()
            fputs("[agent] user requested clear stage\n", stderr)
        }
        controlPanel.onToggleEventLog = { [weak self] in
            guard let self = self else { return }
            self.eventLogVisible.toggle()
            if self.eventLogVisible {
                self.eventLog.panelPosition = self.controlPanel.position
                self.eventLog.showLog()
                self.windowShown(self.eventLog)
            } else {
                self.eventLog.hideLog()
                self.windowHidden(self.eventLog)
            }
        }

        // Global keyboard handler for shortcuts
        NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handleGlobalKeyDown(event)
        }
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if self?.handleGlobalKeyDown(event) == true {
                return nil  // Consume the event
            }
            return event
        }
    }

    /// Handle global keyboard shortcuts
    /// Returns true if the event was handled
    @discardableResult
    func handleGlobalKeyDown(_ event: NSEvent) -> Bool {
        let hasCmd = event.modifierFlags.contains(.command)
        let hasShift = event.modifierFlags.contains(.shift)
        let hasCtrl = event.modifierFlags.contains(.control)
        let hasOpt = event.modifierFlags.contains(.option)

        // Escape - dismiss all overlays AND exit headless mode (failsafe)
        if event.keyCode == 53 {
            if headlessMode {
                headlessMode = false
                fputs("[agent] exited headless mode (Escape)\n", stderr)
            }
            dismissAll()
            return true
        }

        // Cmd+Ctrl+Option+V - Exit headless mode / show panel
        if hasCmd && hasCtrl && hasOpt && event.keyCode == 0x09 { // V key
            if headlessMode {
                headlessMode = false
                controlPanel.showPanel()
                fputs("[agent] exited headless mode (⌃⌥⌘V)\n", stderr)
            } else {
                // Toggle - if not headless, enter headless
                headlessMode = true
                controlPanel.hidePanel()
                fputs("[agent] entered headless mode (⌃⌥⌘V)\n", stderr)
            }
            return true
        }

        // Cmd+Shift+R - stop recording only
        if hasCmd && hasShift && event.keyCode == 0x0F { // R key
            let status = recorder.status()
            if status.recording {
                _ = recorder.stop()
                controlPanel.setRecording(false)
                fputs("vif-agent: stopped recording (Cmd+Shift+R)\n", stderr)
            }
            return true
        }

        // Cmd+Shift+X - clear/reset stage completely
        if hasCmd && hasShift && event.keyCode == 0x07 { // X key
            clearStage()
            fputs("vif-agent: cleared stage (Cmd+Shift+X)\n", stderr)
            return true
        }

        return false
    }

    /// Clear all stage elements (overlays + recording)
    func clearStage() {
        clearOverlays()
        // Also stop recording if the local recorder is running
        let status = recorder.status()
        if status.recording {
            _ = recorder.stop()
        }
        controlPanel.setRecording(false)
        controlPanel.hidePanel()
        // Emit event so server knows to stop TS recorder too
        print("{\"event\":\"user_clear_stage\"}")
        fflush(stdout)
    }

    /// Clear only overlays (not recording)
    func clearOverlays() {
        backdrop.hideBackdrop()
        viewportMask.alphaValue = 0
        cursorWindow.alphaValue = 0
        labelWindow.alphaValue = 0
        keysWindow.alphaValue = 0
        typerWindow.alphaValue = 0
        debugHUD.hide()  // Also hide debug HUD
        controlPanel.setOverlaysVisible(false)
        controlPanel.clearLayers()
    }

    /// Check if any overlay is currently visible (excludes recording indicator)
    func anyOverlayVisible() -> Bool {
        return cursorWindow.alphaValue > 0 ||
               viewportMask.alphaValue > 0 ||
               backdrop.alphaValue > 0 ||
               labelWindow.alphaValue > 0 ||
               keysWindow.alphaValue > 0 ||
               typerWindow.alphaValue > 0
    }

    /// Update control panel visibility and state based on overlay state
    func updateControlPanel() {
        let overlaysVisible = anyOverlayVisible()
        let isRecording = controlPanel.panelView.isRecording  // Use the panel's tracking

        controlPanel.setOverlaysVisible(overlaysVisible)

        // Show panel if anything is active (unless in headless mode)
        if !headlessMode {
            if overlaysVisible || isRecording {
                controlPanel.showPanel()
            } else {
                controlPanel.hidePanel()
            }
        }
    }

    func dismissAll() {
        DispatchQueue.main.async {
            self.cleanup()
            fputs("[agent] All overlays dismissed\n", stderr)
        }
    }

    /// All managed windows that the agent can paint on screen
    var managedWindows: [NSWindow] {
        [
            cursorWindow,
            keysWindow,
            typerWindow,
            viewportMask,
            backdrop,
            labelWindow,
            countdownWindow,
            debugHUD,
            sceneIndicator,
            controlPanel,
            eventLog
        ]
    }

    /// Clean up all windows the agent has shown
    /// The agent tracks everything it paints and removes it on exit
    func cleanup() {
        let windowCount = visibleWindows.count
        fputs("[agent] Cleaning up \(windowCount) visible windows\n", stderr)

        // Stop any active countdown first
        countdownWindow.cancelCountdown()

        // Iterate through all tracked visible windows and hide them
        for window in allVisibleWindows {
            // Call type-specific hide methods for proper cleanup
            if let cursor = window as? CursorWindow {
                cursor.hideCursor()
            } else if let keys = window as? KeysWindow {
                keys.hideKeys()
            } else if let typer = window as? TyperWindow {
                typer.hideTyper()
            } else if let viewport = window as? ViewportMaskWindow {
                viewport.hideMask()
            } else if let bg = window as? BackdropWindow {
                bg.hideBackdrop()
            } else if let label = window as? LabelWindow {
                label.hideLabel()
            } else if let debug = window as? DebugHUDWindow {
                debug.hide()
            } else if let log = window as? EventLogWindow {
                log.hideLog()
                log.clear()
            } else if let panel = window as? ControlPanelWindow {
                panel.clearLayers()
                panel.panelView.clearScene()
                panel.panelView.eventLogVisible = false
                panel.setRecording(false)
                panel.hidePanel()
            }

            // Ensure window is truly hidden
            window.orderOut(nil)
            window.alphaValue = 0
        }

        // Clear the registry
        visibleWindows.removeAll()

        // Reset state flags
        eventLogVisible = false

        // Stop recording if active
        let status = recorder.status()
        if status.recording {
            _ = recorder.stop()
        }

        // Clear tick sound
        tickSound = nil

        fputs("[agent] Cleanup complete\n", stderr)
    }

    func handleCommand(_ line: String) {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = json["action"] as? String else { return }

        DispatchQueue.main.async { self.run(action, json) }
    }

    func run(_ action: String, _ json: [String: Any]) {
        let parts = action.split(separator: ".")
        let domain = parts.count > 1 ? String(parts[0]) : ""
        let cmd = parts.count > 1 ? String(parts[1]) : action

        switch domain {
        case "cursor":
            handleCursor(cmd, json)
        case "keys":
            handleKeys(cmd, json)
        case "typer":
            handleTyper(cmd, json)
        case "input":
            handleInput(cmd, json)
        case "viewport":
            handleViewport(cmd, json)
        case "stage":
            handleStage(cmd, json)
        case "label":
            handleLabel(cmd, json)
        case "record":
            handleRecord(cmd, json)
        case "voice":
            handleVoice(cmd, json)
        case "panel":
            handlePanel(cmd, json)
        case "debug":
            handleDebug(cmd, json)
        case "countdown":
            handleCountdown(cmd, json)
        case "cue":
            handleCue(cmd, json)
        case "zoom":
            handleZoom(cmd, json)
        default:
            if action == "quit" {
                respond(["ok": true])
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { NSApp.terminate(nil) }
            } else {
                respond(["ok": false, "error": "unknown: \(action)"])
            }
        }
    }

    func handleCursor(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            cursorWindow.showCursor()
            windowShown(cursorWindow)
            controlPanel.updateLayer("cursor", visible: true)
            eventLog.log("👆", "cursor.show")
        case "hide":
            cursorWindow.hideCursor()
            windowHidden(cursorWindow)
            controlPanel.updateLayer("cursor", visible: false)
            eventLog.log("👆", "cursor.hide")
        case "moveTo":
            let x = (json["x"] as? NSNumber)?.doubleValue ?? 0
            let y = (json["y"] as? NSNumber)?.doubleValue ?? 0
            let dur = (json["duration"] as? NSNumber)?.doubleValue ?? 0.3
            cursorWindow.moveTo(x: x, y: y, duration: dur)
            // Update position in layer state
            controlPanel.updateLayer("cursor", visible: true, details: ["x": x, "y": y])
            eventLog.log("→", "moveTo", String(format: "(%.0f, %.0f)", x, y))
        case "click":
            cursorWindow.click()
            eventLog.log("🖱", "click")
        case "doubleClick":
            cursorWindow.doubleClick()
            eventLog.log("🖱", "doubleClick")
        case "rightClick":
            cursorWindow.rightClick()
            eventLog.log("🖱", "rightClick")
        case "dragStart":
            cursorWindow.dragStart()
            eventLog.log("✊", "dragStart")
        case "dragEnd":
            cursorWindow.dragEnd()
            eventLog.log("✋", "dragEnd")
        default:
            respond(["ok": false, "error": "unknown cursor cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleKeys(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            if let keys = json["keys"] as? [String] {
                keysWindow.showKeys(keys)
                windowShown(keysWindow)
                controlPanel.updateLayer("keys", visible: true, details: ["keys": keys])
                let keysStr = keys.joined(separator: "+")
                eventLog.log("⌨️", "keys.show", keysStr)
                if json["press"] as? Bool == true {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { pressKeys(keys) }
                }
            }
        case "press":
            if let keys = json["keys"] as? [String] {
                pressKeys(keys)
                let keysStr = keys.joined(separator: "+")
                eventLog.log("⌨️", "keys.press", keysStr)
            }
        case "hide":
            keysWindow.hideKeys()
            windowHidden(keysWindow)
            controlPanel.updateLayer("keys", visible: false)
            eventLog.log("⌨️", "keys.hide")
        default:
            respond(["ok": false, "error": "unknown keys cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleTyper(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "type":
            if let text = json["text"] as? String {
                let style = json["style"] as? String ?? "default"
                let delay = json["delay"] as? Double ?? 0.05
                typerWindow.typeText(text, style: style, delay: delay)
                windowShown(typerWindow)
                controlPanel.updateLayer("typer", visible: true)
            }
        case "clear":
            typerWindow.clearText()
        case "hide":
            typerWindow.hideTyper()
            windowHidden(typerWindow)
            controlPanel.updateLayer("typer", visible: false)
        default:
            respond(["ok": false, "error": "unknown typer cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleInput(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "type":
            // Type actual text into the focused field
            if let text = json["text"] as? String {
                let delay = UInt32((json["delay"] as? Double ?? 0.03) * 1000000)
                typeString(text, delay: delay)
            }
        case "char":
            // Type a single character
            if let char = json["char"] as? String, !char.isEmpty {
                typeString(String(char.first!), delay: 10000)
            }
        default:
            respond(["ok": false, "error": "unknown input cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleViewport(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "set":
            // Set viewport by rect or by app name
            if let app = json["app"] as? String {
                if viewportMask.setViewportToApp(app) {
                    // Sync viewport to recorder
                    recorder.setViewport(viewportMask.maskView.viewportRect)
                    respond(["ok": true])
                } else {
                    respond(["ok": false, "error": "App not found: \(app)"])
                }
                return
            }

            // Set by explicit coordinates
            let x = (json["x"] as? NSNumber)?.doubleValue ?? 0
            let y = (json["y"] as? NSNumber)?.doubleValue ?? 0
            let width = (json["width"] as? NSNumber)?.doubleValue ?? 800
            let height = (json["height"] as? NSNumber)?.doubleValue ?? 600
            viewportMask.setViewport(x: x, y: y, width: width, height: height)
            // Sync viewport to recorder
            recorder.setViewport(viewportMask.maskView.viewportRect)

        case "show":
            viewportMask.showMask()
            windowShown(viewportMask)
            let rect = viewportMask.maskView.viewportRect
            controlPanel.updateLayer("viewport", visible: true, details: ["rect": rect])

        case "hide":
            viewportMask.hideMask()
            windowHidden(viewportMask)
            controlPanel.updateLayer("viewport", visible: false)

        default:
            respond(["ok": false, "error": "unknown viewport cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleStage(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "setup":
            // Full stage setup with choreographed Z-layer entry sequence
            // Config: backdrop, app, viewport, entry.timing, countdown
            let backdropType = (json["backdrop"] as? String) ?? "black"
            let appConfig = json["app"] as? [String: Any]
            let viewportConfig = json["viewport"] as? [String: Any]
            let entryConfig = json["entry"] as? [String: Any]
            let timing = (entryConfig?["timing"] as? NSNumber)?.doubleValue ?? 150.0

            // Countdown config: true (default 3), number, or { count, tick }
            // Default is enabled with count=3
            let countdownConfig = json["countdown"]
            var countdownCount: Int = 3
            var countdownEnabled = true
            var countdownTick: String? = "tick.mp3"  // Default tick sound

            if let enabled = countdownConfig as? Bool {
                countdownEnabled = enabled
            } else if let count = (countdownConfig as? NSNumber)?.intValue {
                countdownCount = count
            } else if let config = countdownConfig as? [String: Any] {
                countdownCount = (config["count"] as? NSNumber)?.intValue ?? 3
                countdownTick = config["tick"] as? String
                if config["enabled"] as? Bool == false {
                    countdownEnabled = false
                }
            }

            let appName = appConfig?["name"] as? String
            let appWidth = (appConfig?["width"] as? NSNumber)?.doubleValue
            let appHeight = (appConfig?["height"] as? NSNumber)?.doubleValue
            let viewportPadding = (viewportConfig?["padding"] as? NSNumber)?.doubleValue ?? 10.0

            fputs("[stage.setup] Starting choreographed entry (\(timing)ms per layer)\n", stderr)
            fputs("[stage.setup] backdrop=\(backdropType), app=\(appName ?? "none"), countdown=\(countdownEnabled ? "\(countdownCount)" : "off")\n", stderr)

            // Log stage setup to event log
            eventLog.log("🎬", "stage.setup", appName ?? "backdrop")

            // ═══════════════════════════════════════════════════════════════════
            // Z1 - BACKDROP
            // ═══════════════════════════════════════════════════════════════════
            fputs("[stage.setup] Z1 Backdrop\n", stderr)
            backdrop.showBackdrop(type: backdropType, behindApp: appName)
            windowShown(backdrop)
            controlPanel.updateLayer("backdrop", visible: true)
            windowShown(controlPanel)
            controlPanel.orderFrontRegardless()

            DispatchQueue.main.asyncAfter(deadline: .now() + timing / 1000.0) { [self] in
                // ═══════════════════════════════════════════════════════════════
                // Z2 - APPLICATION
                // ═══════════════════════════════════════════════════════════════
                var appBounds: CGRect? = nil

                if let name = appName {
                    fputs("[stage.setup] Z2 App: \(name)\n", stderr)
                    let result = centerAppWindow(name,
                        width: appWidth.map { CGFloat($0) },
                        height: appHeight.map { CGFloat($0) })
                    appBounds = result.bounds
                    fputs("[stage.setup] App bounds: \(appBounds?.debugDescription ?? "nil")\n", stderr)
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + timing / 1000.0) { [self] in
                    // ═══════════════════════════════════════════════════════════
                    // Z4 - VIEWPORT FRAME
                    // ═══════════════════════════════════════════════════════════
                    if viewportConfig != nil, let bounds = appBounds {
                        fputs("[stage.setup] Z4 Viewport\n", stderr)
                        let vp = NSRect(
                            x: bounds.origin.x - viewportPadding,
                            y: bounds.origin.y - viewportPadding,
                            width: bounds.width + viewportPadding * 2,
                            height: bounds.height + viewportPadding * 2
                        )
                        viewportMask.setViewport(x: Double(vp.origin.x),
                                                  y: Double(vp.origin.y),
                                                  width: Double(vp.width),
                                                  height: Double(vp.height))
                        viewportMask.showMask()
                        windowShown(viewportMask)
                        controlPanel.updateLayer("viewport", visible: true)
                        recorder.setViewport(viewportMask.maskView.viewportRect)

                        // Re-activate app to bring it in front of viewport
                        if let name = appName {
                            let script = "tell application \"\(name)\" to activate"
                            if let scriptObj = NSAppleScript(source: script) {
                                var error: NSDictionary?
                                scriptObj.executeAndReturnError(&error)
                            }
                        }
                    }

                    DispatchQueue.main.asyncAfter(deadline: .now() + timing / 1000.0) { [self] in
                        // ═══════════════════════════════════════════════════════
                        // Z5 - CONTROLS READY
                        // ═══════════════════════════════════════════════════════
                        fputs("[stage.setup] Z5 Controls ready\n", stderr)

                        // Build response with bounds
                        var response: [String: Any] = ["ok": true, "ready": true]
                        if let bounds = appBounds {
                            response["bounds"] = [
                                "x": Int(bounds.origin.x),
                                "y": Int(bounds.origin.y),
                                "width": Int(bounds.width),
                                "height": Int(bounds.height)
                            ]
                        }

                        // ═══════════════════════════════════════════════════════
                        // COUNTDOWN (if enabled)
                        // ═══════════════════════════════════════════════════════
                        if countdownEnabled {
                            fputs("[stage.setup] Countdown \(countdownCount)...\n", stderr)

                            // Load tick sound
                            tickSound = nil
                            if let tick = countdownTick {
                                var tickPath: String? = nil
                                if tick.hasPrefix("/") || tick.hasPrefix("~") {
                                    tickPath = NSString(string: tick).expandingTildeInPath
                                } else {
                                    let homePath = NSHomeDirectory() + "/.vif/sounds/" + tick
                                    if FileManager.default.fileExists(atPath: homePath) {
                                        tickPath = homePath
                                    }
                                }
                                if let path = tickPath {
                                    tickSound = NSSound(contentsOfFile: path, byReference: true)
                                }
                            }

                            // Start countdown
                            countdownWindow.startCountdown(from: countdownCount, onTick: { [weak self] in
                                if let sound = self?.tickSound {
                                    sound.stop()
                                    sound.play()
                                }
                            }) { [weak self] in
                                fputs("[stage.setup] ✓ Stage ready (countdown complete)\n", stderr)
                                self?.tickSound = nil
                                self?.respond(response)
                            }
                        } else {
                            fputs("[stage.setup] ✓ Stage ready\n", stderr)
                            respond(response)
                        }
                    }
                }
            }
            return  // Don't respond immediately, wait for choreography

        case "set":
            // Set up a clean stage: show backdrop, hide other apps, center the target app
            guard let app = json["app"] as? String else {
                respond(["ok": false, "error": "stage.set requires app name"])
                return
            }

            // Show solid backdrop first (covers everything)
            backdrop.showBackdrop(type: "black")
            windowShown(backdrop)
            // Ensure control panel stays on top of backdrop
            windowShown(controlPanel)
            controlPanel.orderFrontRegardless()

            // Small delay to let backdrop appear, then hide other apps and center
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                // Hide other apps (this saves their state for restoration)
                let _ = hideOtherApps(app)

                // Center the app window if width/height specified, otherwise just center at current size
                let width = (json["width"] as? NSNumber)?.doubleValue
                let height = (json["height"] as? NSNumber)?.doubleValue
                let _ = centerAppWindow(app, width: width.map { CGFloat($0) }, height: height.map { CGFloat($0) })

                // Optionally hide desktop icons
                if json["hideDesktop"] as? Bool == true {
                    let _ = hideDesktopIcons()
                }
            }

        case "clear":
            // Restore everything: hide all overlays, restore app visibility
            backdrop.hideBackdrop()
            windowHidden(backdrop)
            viewportMask.hideMask()
            windowHidden(viewportMask)
            cursorWindow.hideCursor()
            windowHidden(cursorWindow)
            labelWindow.hideLabel()
            windowHidden(labelWindow)
            keysWindow.hideKeys()
            windowHidden(keysWindow)
            typerWindow.hideTyper()
            windowHidden(typerWindow)
            debugHUD.hide()
            windowHidden(debugHUD)
            restoreAppState()
            let _ = showDesktopIcons()
            controlPanel.clearLayers()
            controlPanel.panelView.targetMode = .none
            controlPanel.panelView.needsDisplay = true

        case "backdrop":
            // Show/hide backdrop
            if json["show"] as? Bool == true {
                let backdropType = json["type"] as? String ?? "gradient"
                let appName = json["app"] as? String
                backdrop.showBackdrop(type: backdropType, behindApp: appName)
                windowShown(backdrop)
                controlPanel.updateLayer("backdrop", visible: true)
                windowShown(controlPanel)
                controlPanel.orderFrontRegardless()
            } else {
                backdrop.hideBackdrop()
                windowHidden(backdrop)
                controlPanel.updateLayer("backdrop", visible: false)
            }

        case "render":
            // Render content in the web backdrop
            // Extract just the render params, not the full command
            var renderCmd = json
            renderCmd.removeValue(forKey: "action")
            fputs("stage.render: \(renderCmd)\n", stderr)
            backdrop.sendCommand(renderCmd)

        case "hideDesktop":
            let _ = hideDesktopIcons()

        case "showDesktop":
            let _ = showDesktopIcons()

        case "center":
            // Just center an app window
            guard let app = json["app"] as? String else {
                respond(["ok": false, "error": "stage.center requires app name"])
                return
            }
            let width = (json["width"] as? NSNumber)?.doubleValue
            let height = (json["height"] as? NSNumber)?.doubleValue
            let result = centerAppWindow(app, width: width.map { CGFloat($0) }, height: height.map { CGFloat($0) })
            if let bounds = result.bounds {
                respond([
                    "ok": true,
                    "bounds": [
                        "x": Int(bounds.origin.x),
                        "y": Int(bounds.origin.y),
                        "width": Int(bounds.width),
                        "height": Int(bounds.height)
                    ]
                ])
            } else {
                respond(["ok": result.success])
            }
            return

        case "hideOthers":
            // Just hide other apps (saves state)
            guard let app = json["app"] as? String else {
                respond(["ok": false, "error": "stage.hideOthers requires app name"])
                return
            }
            let _ = hideOtherApps(app)

        case "restore":
            // Just restore app visibility without clearing backdrop
            restoreAppState()

        case "activate":
            // Activate app (bring to front)
            guard let appName = json["app"] as? String else {
                respond(["ok": false, "error": "stage.activate requires app name"])
                return
            }

            // Activate the app via AppleScript
            let script = "tell application \"\(appName)\" to activate"
            if let scriptObj = NSAppleScript(source: script) {
                var error: NSDictionary?
                scriptObj.executeAndReturnError(&error)
                if error != nil {
                    fputs("[agent] stage.activate: AppleScript failed for \(appName)\n", stderr)
                } else {
                    fputs("[agent] stage.activate: activated \(appName)\n", stderr)
                }
            }

        case "reset":
            // Clean up all managed windows and reset state
            cleanup()
            respond(["ok": true, "reset": true])
            return

        default:
            respond(["ok": false, "error": "unknown stage cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleLabel(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            let text = json["text"] as? String ?? ""
            let position = json["position"] as? String ?? "top"
            let x = (json["x"] as? NSNumber)?.doubleValue
            let y = (json["y"] as? NSNumber)?.doubleValue
            let width = (json["width"] as? NSNumber)?.doubleValue
            labelWindow.showLabel(text: text, position: position,
                                  x: x.map { CGFloat($0) },
                                  y: y.map { CGFloat($0) },
                                  width: width.map { CGFloat($0) })
            windowShown(labelWindow)
            controlPanel.updateLayer("label", visible: true, details: ["text": text])
            eventLog.log("🏷", "label.show", "\"\(text.prefix(15))\"")

        case "hide":
            labelWindow.hideLabel()
            windowHidden(labelWindow)
            controlPanel.updateLayer("label", visible: false)
            eventLog.log("🏷", "label.hide")

        case "update":
            let text = json["text"] as? String ?? ""
            labelWindow.updateText(text)
            controlPanel.updateLayer("label", visible: true, details: ["text": text])
            eventLog.log("🏷", "label.update", "\"\(text.prefix(15))\"")

        default:
            respond(["ok": false, "error": "unknown label cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleRecord(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "start":
            let modeStr = json["mode"] as? String ?? "draft"
            let mode: ScreenRecorder.Mode = modeStr == "final" ? .final_ : .draft
            let name = json["name"] as? String

            let result = recorder.start(mode: mode, name: name)
            if result.success {
                controlPanel.setRecording(true)
                if !headlessMode {
                    controlPanel.showPanel()
                }
                eventLog.log("⏺", "record.start", modeStr)
                respond(["ok": true, "path": result.path ?? "", "mode": modeStr])
            } else {
                respond(["ok": false, "error": result.error ?? "Unknown error"])
            }

        case "stop":
            let result = recorder.stop()
            controlPanel.setRecording(false)
            if result.success {
                // Get file info
                var response: [String: Any] = ["ok": true, "path": result.path ?? ""]
                if let path = result.path,
                   let attrs = try? FileManager.default.attributesOfItem(atPath: path) {
                    let size = attrs[.size] as? Int64 ?? 0
                    response["sizeBytes"] = size
                    response["sizeMB"] = Double(size) / 1_000_000.0
                    eventLog.log("⏹", "record.stop", String(format: "%.1fMB", Double(size) / 1_000_000.0))
                } else {
                    eventLog.log("⏹", "record.stop")
                }
                respond(response)
            } else {
                respond(["ok": false, "error": result.error ?? "Unknown error"])
            }

        case "status":
            let status = recorder.status()
            respond([
                "ok": true,
                "recording": status.recording,
                "mode": status.mode ?? "",
                "path": status.path ?? ""
            ])

        case "indicator":
            // Set recording indicator UI state without actually recording
            // Used when external recorder (TypeScript) handles actual capture
            let show = json["show"] as? Bool ?? false
            controlPanel.setRecording(show)
            if show && !headlessMode {
                controlPanel.showPanel()
            }
            fputs("[agent] recorder: indicator \(show ? "on" : "off")\n", stderr)
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown record cmd: \(cmd)"])
        }
    }

    // MARK: - Panel (Control Panel visibility)

    func handlePanel(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            controlPanel.showPanel()
            windowShown(controlPanel)
            fputs("[agent] panel: showing\n", stderr)
            respond(["ok": true])

        case "hide":
            controlPanel.hidePanel()
            windowHidden(controlPanel)
            fputs("[agent] panel: hidden\n", stderr)
            respond(["ok": true])

        case "headless":
            // Enable/disable headless mode (auto-hide panel during scenes)
            let enabled = json["enabled"] as? Bool ?? true
            headlessMode = enabled
            if enabled {
                controlPanel.hidePanel()
                windowHidden(controlPanel)
            }
            fputs("[agent] panel: headless mode \(enabled ? "on" : "off")\n", stderr)
            respond(["ok": true])

        case "targetMode":
            // Set the target resolution mode badge
            if let modeStr = json["mode"] as? String {
                let mode: ControlPanelView.TargetMode
                switch modeStr {
                case "connected":
                    mode = .connected
                case "standalone":
                    mode = .standalone
                default:
                    mode = .none
                }
                controlPanel.setTargetMode(mode)
                fputs("[agent] panel: target mode set to \(modeStr)\n", stderr)
            }
            respond(["ok": true])

        case "scene":
            // Set the current scene name
            if let name = json["name"] as? String, !name.isEmpty {
                controlPanel.setScene(name: name)
                eventLog.startScene(name)  // Start event log timer
                fputs("[agent] panel: scene '\(name)'\n", stderr)
            } else {
                controlPanel.clearScene()
                // Don't clear log - keep it for review after scene ends
                fputs("[agent] panel: scene cleared\n", stderr)
            }
            respond(["ok": true])

        case "action":
            // Set the current action being executed
            let action = json["text"] as? String ?? ""
            controlPanel.setCurrentAction(action)
            if !action.isEmpty {
                // Log the action to event log
                eventLog.log("→", action)
                fputs("[agent] panel: action '\(action)'\n", stderr)
            }
            respond(["ok": true])

        case "progress":
            // Update step progress (x of y)
            let current = (json["current"] as? NSNumber)?.intValue ?? 0
            let total = (json["total"] as? NSNumber)?.intValue ?? 0
            controlPanel.setProgress(current: current, total: total)
            respond(["ok": true])

        case "recordingPath":
            // Set the recording output path for display
            let path = json["path"] as? String ?? ""
            controlPanel.setRecordingPath(path)
            if !path.isEmpty {
                fputs("[agent] panel: recording to '\(path)'\n", stderr)
            }
            respond(["ok": true])

        case "position":
            // Set panel position: top-right, top-left, bottom-right, bottom-left
            if let posStr = json["position"] as? String,
               let pos = PanelPosition(rawValue: posStr) {
                controlPanel.setPosition(pos)
                respond(["ok": true])
            } else {
                respond(["ok": false, "error": "Invalid position. Use: top-right, top-left, bottom-right, bottom-left"])
            }

        default:
            respond(["ok": false, "error": "unknown panel cmd: \(cmd)"])
        }
    }

    // MARK: - Debug HUD

    func handleDebug(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            // Reset log when showing (fresh start for each recording)
            debugHUD.resetLog()
            // Accept optional x, y, width for positioning the HUD shelf
            if let x = (json["x"] as? NSNumber)?.doubleValue,
               let y = (json["y"] as? NSNumber)?.doubleValue,
               let width = (json["width"] as? NSNumber)?.doubleValue {
                debugHUD.show(x: CGFloat(x), y: CGFloat(y), width: CGFloat(width))
            } else {
                debugHUD.show()
            }
            windowShown(debugHUD)
            respond(["ok": true, "height": DebugHUDWindow.shelfHeight])

        case "hide":
            debugHUD.hide()
            windowHidden(debugHUD)
            respond(["ok": true])

        case "update":
            // Update HUD with debug info
            var data: [String: Any] = [:]

            // Accept both "actionText" (from runner) and "action" for flexibility
            if let actionText = json["actionText"] as? String {
                data["actionText"] = actionText
            } else if let action = json["action"] as? String {
                data["actionText"] = action
            }
            if let source = json["source"] as? String {
                data["source"] = source
            }
            if let target = json["target"] as? String {
                data["target"] = target
            }
            if let screen = json["screen"] as? String {
                data["screen"] = screen
            }
            if let app = json["app"] as? String {
                data["app"] = app
            }
            if let offset = json["offset"] as? String {
                data["offset"] = offset
            }
            if let sdk = json["sdk"] as? String {
                data["sdk"] = sdk
            }

            debugHUD.update(data)
            respond(["ok": true])

        case "clear":
            debugHUD.clear()
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown debug cmd: \(cmd)"])
        }
    }

    // MARK: - Countdown

    private var tickSound: NSSound?  // Pre-loaded tick sound for countdown

    func handleCountdown(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "start":
            let count = (json["count"] as? NSNumber)?.intValue ?? 3
            let tickSoundName = json["tick"] as? String
            fputs("[agent] countdown: starting from \(count)\n", stderr)

            // Pre-load tick sound using NSSound (lightweight, no process spawning)
            tickSound = nil
            if let tick = tickSoundName {
                var tickPath: String? = nil
                if tick.hasPrefix("/") || tick.hasPrefix("~") {
                    tickPath = NSString(string: tick).expandingTildeInPath
                } else {
                    // Check ~/.vif/sounds/
                    let homePath = NSHomeDirectory() + "/.vif/sounds/" + tick
                    if FileManager.default.fileExists(atPath: homePath) {
                        tickPath = homePath
                    }
                }
                if let path = tickPath {
                    tickSound = NSSound(contentsOfFile: path, byReference: true)
                }
            }

            // Start countdown with tick handler
            windowShown(countdownWindow)  // Track visibility
            countdownWindow.startCountdown(from: count, onTick: { [weak self] in
                // Play tick using NSSound (fast, no process spawning)
                if let sound = self?.tickSound {
                    sound.stop()  // Stop any previous playback
                    sound.play()
                }
            }) { [weak self] in
                fputs("[agent] countdown: complete\n", stderr)
                self?.windowHidden(self!.countdownWindow)  // Track visibility
                self?.tickSound = nil  // Release the sound
                self?.respond(["ok": true, "completed": true])
            }
            // Don't respond yet - wait for completion

        case "cancel":
            countdownWindow.cancelCountdown()
            windowHidden(countdownWindow)  // Track visibility
            tickSound = nil
            fputs("[agent] countdown: cancelled\n", stderr)
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown countdown cmd: \(cmd)"])
        }
    }

    // MARK: - Cue Sounds

    private var cueProcess: Process?

    func handleCue(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "play":
            guard let sound = json["sound"] as? String else {
                respond(["ok": false, "error": "cue.play requires sound"])
                return
            }

            // Resolve sound path - either absolute or from assets/sounds
            let soundPath: String
            if sound.hasPrefix("/") || sound.hasPrefix("~") {
                soundPath = NSString(string: sound).expandingTildeInPath
            } else {
                // Look in bundled assets - check multiple locations
                let possiblePaths = [
                    // Development: relative to agent
                    Bundle.main.bundlePath + "/../../../assets/sounds/" + sound,
                    // Production: in ~/.vif/sounds
                    NSHomeDirectory() + "/.vif/sounds/" + sound,
                ]
                soundPath = possiblePaths.first { FileManager.default.fileExists(atPath: $0) } ?? sound
            }

            guard FileManager.default.fileExists(atPath: soundPath) else {
                fputs("[agent] cue: sound not found: \(sound) (tried \(soundPath))\n", stderr)
                respond(["ok": false, "error": "Sound file not found: \(sound)"])
                return
            }

            fputs("[agent] cue: playing \(soundPath)\n", stderr)

            // Play via afplay (simple, reliable)
            cueProcess?.terminate()
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
            process.arguments = [soundPath]

            do {
                try process.run()
                cueProcess = process

                // Wait for completion if requested
                let waitForCompletion = json["wait"] as? Bool ?? false
                if waitForCompletion {
                    process.waitUntilExit()
                }

                respond(["ok": true])
            } catch {
                respond(["ok": false, "error": "Failed to play sound: \(error)"])
            }

        case "stop":
            cueProcess?.terminate()
            cueProcess = nil
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown cue cmd: \(cmd)"])
        }
    }

    // MARK: - Zoom Effects

    // Zoom state for tracking during recording (actual effect applied in post-processing)
    private var zoomState: (
        active: Bool,
        type: String,           // "crop" or "lens"
        level: Double,          // 1.5 = 150%
        targetX: Double?,       // nil = follow cursor
        targetY: Double?,
        startTime: Date?
    ) = (false, "crop", 1.0, nil, nil, nil)

    func handleZoom(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "start":
            // Parse zoom configuration
            let type = json["type"] as? String ?? "crop"
            let level = (json["level"] as? NSNumber)?.doubleValue ?? 1.5

            // Parse target (cursor or fixed coordinates)
            var targetX: Double? = nil
            var targetY: Double? = nil
            if let target = json["target"] as? [String: Any] {
                targetX = (target["x"] as? NSNumber)?.doubleValue
                targetY = (target["y"] as? NSNumber)?.doubleValue
            }
            // If target is "cursor", leave as nil (will follow cursor)

            // Parse timing
            let inConfig = json["in"] as? [String: Any]
            let inDuration = (inConfig?["duration"] as? NSNumber)?.doubleValue ?? 300
            let inEasing = inConfig?["easing"] as? String ?? "ease-out"

            // Store zoom state
            zoomState = (true, type, level, targetX, targetY, Date())

            fputs("[zoom] start: type=\(type), level=\(level)x, target=\(targetX.map{String($0)} ?? "cursor"),\(targetY.map{String($0)} ?? "cursor"), in=\(inDuration)ms \(inEasing)\n", stderr)

            // Update control panel
            controlPanel.updateLayer("zoom", visible: true, details: [
                "type": type,
                "level": level,
                "target": targetX != nil ? "fixed" : "cursor"
            ])

            // Log to event log
            eventLog.log("🔍", "zoom START", String(format: "%.1fx %@", level, type))

            // For "lens" type, we could show a magnifying glass overlay
            // For now, both types just track state for post-processing
            if type == "lens" {
                // Future: show lens overlay window
                fputs("[zoom] lens mode - visual overlay not yet implemented\n", stderr)
            }

            respond(["ok": true, "zooming": true])

        case "end":
            // Parse zoom-out timing
            let duration = (json["duration"] as? NSNumber)?.doubleValue ?? 400
            let easing = json["easing"] as? String ?? "ease-in-out"

            fputs("[zoom] end: out=\(duration)ms \(easing)\n", stderr)

            // Calculate zoom duration
            var zoomDuration: Double = 0
            if let startTime = zoomState.startTime {
                zoomDuration = Date().timeIntervalSince(startTime)
            }

            // Log to event log
            eventLog.log("🔍", "zoom END", String(format: "%.1fs", zoomDuration))

            // Clear zoom state
            zoomState = (false, "crop", 1.0, nil, nil, nil)

            // Update control panel
            controlPanel.updateLayer("zoom", visible: false)

            respond(["ok": true, "duration": zoomDuration])

        case "status":
            respond([
                "ok": true,
                "active": zoomState.active,
                "type": zoomState.type,
                "level": zoomState.level
            ])

        default:
            respond(["ok": false, "error": "unknown zoom cmd: \(cmd)"])
        }
    }

    // MARK: - Voice (Audio Playback through BlackHole)

    private var voiceProcess: Process?

    func handleVoice(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "play":
            guard let file = json["file"] as? String else {
                respond(["ok": false, "error": "voice.play requires file"])
                return
            }

            // Expand ~ in path
            let expandedPath = NSString(string: file).expandingTildeInPath

            // Check file exists
            guard FileManager.default.fileExists(atPath: expandedPath) else {
                respond(["ok": false, "error": "Audio file not found: \(file)"])
                return
            }

            // Find BlackHole device index for output
            let deviceIndex = findBlackHoleDeviceIndex() ?? 1  // Default to 1

            // Get audio duration upfront
            let duration = getAudioDuration(expandedPath)

            // Stop any existing playback
            voiceProcess?.terminate()
            voiceProcess = nil

            // Save current system input device and switch to BlackHole
            let originalInput = getCurrentInputDevice()
            fputs("[agent] voice: current input device = \(originalInput ?? "nil")\n", stderr)
            fflush(stderr)
            if let original = originalInput, original != "BlackHole 2ch" {
                switchInputDevice(to: "BlackHole 2ch")
                fputs("[agent] voice: switched input to BlackHole 2ch (was: \(original))\n", stderr)
                fflush(stderr)
            }

            // Play audio to BOTH BlackHole (for Talkie input) AND default output (for recording)
            // Process 1: BlackHole for app input (via ffmpeg audiotoolbox)
            let blackholeProcess = Process()
            blackholeProcess.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/ffmpeg")
            blackholeProcess.arguments = [
                "-i", expandedPath,      // Input file
                "-hide_banner",          // Less output
                "-loglevel", "error",
                "-f", "audiotoolbox",    // Output format
                "-audio_device_index", String(deviceIndex),
                "-"                      // Output to pipe (required for audiotoolbox)
            ]
            blackholeProcess.standardError = Pipe()
            blackholeProcess.standardOutput = FileHandle.nullDevice

            // Process 2: Default system output for speakers/recording (via afplay)
            let speakerProcess = Process()
            speakerProcess.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
            speakerProcess.arguments = [expandedPath]
            speakerProcess.standardError = Pipe()
            speakerProcess.standardOutput = FileHandle.nullDevice

            do {
                // Start both processes simultaneously
                try blackholeProcess.run()
                try speakerProcess.run()
                voiceProcess = blackholeProcess

                fputs("[agent] voice: playing \(file) → BlackHole (device \(deviceIndex)) + speakers (afplay)\n", stderr)
                fflush(stderr)

                // Wait for both to complete
                blackholeProcess.waitUntilExit()
                speakerProcess.waitUntilExit()

                // Restore original input device
                if let original = originalInput {
                    switchInputDevice(to: original)
                    fputs("[agent] voice: restored input to \(original)\n", stderr)
                    fflush(stderr)
                }

                respond(["ok": true, "file": file, "duration": duration, "deviceIndex": deviceIndex])
            } catch {
                // Restore input device on error
                if let original = originalInput {
                    switchInputDevice(to: original)
                }
                respond(["ok": false, "error": "Failed to play: \(error.localizedDescription)"])
            }

        case "stop":
            if let process = voiceProcess, process.isRunning {
                process.terminate()
                voiceProcess = nil
                fputs("[agent] voice: stopped\n", stderr)
            }
            respond(["ok": true])

        case "status":
            let playing = voiceProcess?.isRunning ?? false
            respond(["ok": true, "playing": playing])

        default:
            respond(["ok": false, "error": "unknown voice cmd: \(cmd)"])
        }
    }

    /// Find BlackHole audio device index by name
    func findBlackHoleDeviceIndex() -> Int? {
        // Use ffmpeg to list devices and find BlackHole
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/ffmpeg")
        process.arguments = ["-f", "avfoundation", "-list_devices", "true", "-i", ""]

        let pipe = Pipe()
        process.standardError = pipe
        process.standardOutput = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8) {
                // Parse output to find BlackHole
                let lines = output.components(separatedBy: "\n")
                var inAudioSection = false
                for line in lines {
                    if line.contains("AVFoundation audio devices") {
                        inAudioSection = true
                        continue
                    }
                    if inAudioSection && line.contains("BlackHole") {
                        // Extract device index from "[0]" or "[1]" etc
                        if let match = line.range(of: #"\[(\d+)\]"#, options: .regularExpression) {
                            let indexStr = line[match].dropFirst().dropLast()
                            return Int(indexStr)
                        }
                    }
                }
            }
        } catch {
            // Fall through to default
        }
        return nil
    }

    /// Get current system input device using SwitchAudioSource
    func getCurrentInputDevice() -> String? {
        let switchPath = "/opt/homebrew/bin/SwitchAudioSource"
        guard FileManager.default.fileExists(atPath: switchPath) else {
            fputs("[agent] voice: SwitchAudioSource not found at \(switchPath)\n", stderr)
            return nil
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: switchPath)
        process.arguments = ["-c", "-t", "input"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8) {
                let device = output.trimmingCharacters(in: .whitespacesAndNewlines)
                if !device.isEmpty {
                    return device
                }
            }
            fputs("[agent] voice: SwitchAudioSource returned empty output\n", stderr)
        } catch {
            fputs("[agent] voice: failed to get current input device: \(error)\n", stderr)
        }
        return nil
    }

    /// Switch system input device using SwitchAudioSource
    func switchInputDevice(to device: String) {
        let switchPath = "/opt/homebrew/bin/SwitchAudioSource"
        guard FileManager.default.fileExists(atPath: switchPath) else {
            fputs("[agent] voice: SwitchAudioSource not found for switching\n", stderr)
            fflush(stderr)
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: switchPath)
        process.arguments = ["-s", device, "-t", "input"]

        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            fputs("[agent] voice: switched input to \(device)\n", stderr)
            fflush(stderr)
        } catch {
            fputs("[agent] voice: failed to switch input to \(device): \(error)\n", stderr)
            fflush(stderr)
        }
    }

    /// Get audio file duration in seconds
    func getAudioDuration(_ path: String) -> Double {
        let asset = AVURLAsset(url: URL(fileURLWithPath: path))
        let duration = CMTimeGetSeconds(asset.duration)
        return duration.isNaN ? 0 : duration
    }

    func respond(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }
}

// MARK: - Main

let app = NSApplication.shared
let agent = VifAgent()
app.delegate = agent
app.setActivationPolicy(.accessory)
app.run()
