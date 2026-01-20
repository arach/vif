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
        // 5. Move system cursor off-screen so screencapture won't capture it
        //    (screencapture may still capture cursor even when "hidden")
        if let screen = NSScreen.main {
            // Move to bottom-left corner (off typical viewport)
            CGWarpMouseCursorPosition(CGPoint(x: 0, y: screen.frame.height))
        }

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

// MARK: - Camera Window (presenter facecam overlay)

class CameraWindow: NSWindow {
    let previewLayer: AVCaptureVideoPreviewLayer
    let captureSession = AVCaptureSession()
    var currentPosition: String = "bottom-right"  // top-left, top-right, bottom-left, bottom-right, auto
    var currentSize: CGFloat = 150  // diameter in points
    private var viewportRect: NSRect = .zero  // Track viewport for smart positioning

    private lazy var containerView: NSView = {
        let view = NSView()
        view.wantsLayer = true
        view.layer?.masksToBounds = true
        return view
    }()

    init() {
        // Create preview layer first
        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.videoGravity = .resizeAspectFill

        // Default size
        let size: CGFloat = 150
        let frame = NSRect(x: 0, y: 0, width: size, height: size)

        super.init(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)  // Above everything
        ignoresMouseEvents = true
        hasShadow = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        // Set up container view with circular mask
        containerView.frame = NSRect(x: 0, y: 0, width: size, height: size)
        contentView = containerView

        // Add preview layer to container
        previewLayer.frame = containerView.bounds
        containerView.layer?.addSublayer(previewLayer)

        // Make it circular
        containerView.layer?.cornerRadius = size / 2

        // Add border
        containerView.layer?.borderColor = NSColor.white.cgColor
        containerView.layer?.borderWidth = 3

        // Shadow
        containerView.layer?.shadowColor = NSColor.black.cgColor
        containerView.layer?.shadowOpacity = 0.5
        containerView.layer?.shadowOffset = CGSize(width: 0, height: -2)
        containerView.layer?.shadowRadius = 10

        // Position at bottom-right by default
        updatePosition()

        alphaValue = 0
    }

    func setupCamera() -> Bool {
        // Check camera permission
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted {
                    DispatchQueue.main.async {
                        _ = self.setupCamera()
                    }
                }
            }
            return false
        case .denied, .restricted:
            fputs("[camera] camera permission denied\n", stderr)
            return false
        @unknown default:
            return false
        }

        // Get default video device
        guard let device = AVCaptureDevice.default(for: .video) else {
            fputs("[camera] no camera device found\n", stderr)
            return false
        }

        do {
            let input = try AVCaptureDeviceInput(device: device)

            captureSession.beginConfiguration()

            if captureSession.canAddInput(input) {
                captureSession.addInput(input)
            }

            // Use medium preset for preview (720p)
            if captureSession.canSetSessionPreset(.medium) {
                captureSession.sessionPreset = .medium
            }

            captureSession.commitConfiguration()

            fputs("[camera] camera setup complete: \(device.localizedName)\n", stderr)
            return true
        } catch {
            fputs("[camera] failed to setup camera: \(error)\n", stderr)
            return false
        }
    }

    func showCamera() {
        // Setup camera if not already
        if captureSession.inputs.isEmpty {
            if !setupCamera() {
                fputs("[camera] failed to setup camera for showing\n", stderr)
                return
            }
        }

        // Start capture session on background thread
        if !captureSession.isRunning {
            DispatchQueue.global(qos: .userInitiated).async {
                self.captureSession.startRunning()
            }
        }

        updatePosition()
        orderFrontRegardless()

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.3
            animator().alphaValue = 1.0
        }

        fputs("[camera] showing at \(currentPosition), size \(currentSize)\n", stderr)
    }

    func hideCamera() {
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.3
            animator().alphaValue = 0
        }) {
            self.orderOut(nil)
            // Stop capture session to save resources
            if self.captureSession.isRunning {
                DispatchQueue.global(qos: .userInitiated).async {
                    self.captureSession.stopRunning()
                }
            }
        }

        fputs("[camera] hidden\n", stderr)
    }

    func setSize(_ size: CGFloat) {
        currentSize = size

        let frame = NSRect(x: 0, y: 0, width: size, height: size)
        setContentSize(frame.size)
        containerView.frame = NSRect(x: 0, y: 0, width: size, height: size)
        previewLayer.frame = containerView.bounds
        containerView.layer?.cornerRadius = size / 2

        updatePosition()
    }

    func setPosition(_ position: String) {
        currentPosition = position
        updatePosition()
    }

    func setViewport(_ rect: NSRect) {
        // Store viewport in vif coordinates (top-left origin)
        viewportRect = rect
        if currentPosition == "auto" {
            updatePosition()
        }
    }

    private func updatePosition() {
        guard let screen = NSScreen.main else { return }

        let padding: CGFloat = 30
        let screenFrame = screen.frame

        var x: CGFloat = 0
        var y: CGFloat = 0  // Cocoa coords (bottom-left origin)

        let position: String
        if currentPosition == "auto" {
            position = calculateSmartPosition(screenFrame: screenFrame)
        } else {
            position = currentPosition
        }

        switch position {
        case "top-left":
            x = padding
            y = screenFrame.height - currentSize - padding
        case "top-right":
            x = screenFrame.width - currentSize - padding
            y = screenFrame.height - currentSize - padding
        case "bottom-left":
            x = padding
            y = padding
        case "bottom-right":
            x = screenFrame.width - currentSize - padding
            y = padding
        default:  // bottom-right as fallback
            x = screenFrame.width - currentSize - padding
            y = padding
        }

        setFrameOrigin(CGPoint(x: x, y: y))
    }

    /// Calculate smart position that avoids viewport overlap
    private func calculateSmartPosition(screenFrame: NSRect) -> String {
        // If no viewport set, default to bottom-right
        guard viewportRect != .zero else {
            return "bottom-right"
        }

        // Convert viewport to Cocoa coordinates (it's stored in vif coords: top-left origin)
        let viewportCocoaY = screenFrame.height - viewportRect.origin.y - viewportRect.height
        let viewportInCocoa = NSRect(
            x: viewportRect.origin.x,
            y: viewportCocoaY,
            width: viewportRect.width,
            height: viewportRect.height
        )

        // Calculate center of viewport
        let viewportCenterX = viewportInCocoa.midX
        let viewportCenterY = viewportInCocoa.midY
        let screenCenterX = screenFrame.width / 2
        let screenCenterY = screenFrame.height / 2

        // Determine which corner is furthest from viewport center
        // If viewport is in top-left quadrant, camera goes to bottom-right, etc.
        let isViewportLeft = viewportCenterX < screenCenterX
        let isViewportTop = viewportCenterY > screenCenterY

        if isViewportLeft && isViewportTop {
            return "bottom-right"
        } else if !isViewportLeft && isViewportTop {
            return "bottom-left"
        } else if isViewportLeft && !isViewportTop {
            return "top-right"
        } else {
            return "top-left"
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

    init() {
        let screen = NSScreen.main ?? NSScreen.screens[0]

        // Configure web view
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: screen.frame, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")  // Transparent background

        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .black
        level = .normal
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = webView
        setFrameOrigin(screen.frame.origin)

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

    func showBackdrop(color: NSColor = .black) {
        fputs("backdrop: showing (web)\n", stderr)
        backgroundColor = color
        alphaValue = 1.0
        orderFrontRegardless()
    }

    func hideBackdrop() {
        fputs("backdrop: hiding\n", stderr)
        orderOut(nil)
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

/// Center an app window on screen and return the actual bounds
func centerAppWindow(_ appName: String, width: CGFloat? = nil, height: CGFloat? = nil) -> (success: Bool, bounds: NSRect?) {
    guard let screen = NSScreen.main else { return (false, nil) }

    // First activate the app (idempotent - won't launch duplicates)
    let activateScript = "tell application \"\(appName)\" to activate"
    if let scriptObj = NSAppleScript(source: activateScript) {
        var error: NSDictionary?
        scriptObj.executeAndReturnError(&error)
        // Small delay to let app come to front
        Thread.sleep(forTimeInterval: 0.2)
    }

    let script: String
    if let w = width, let h = height {
        let x = Int((screen.frame.width - w) / 2)
        let y = Int((screen.frame.height - h) / 2)
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

    var error: NSDictionary?
    if let scriptObj = NSAppleScript(source: script) {
        scriptObj.executeAndReturnError(&error)
        if error == nil {
            // Calculate the actual bounds based on what we set
            let actualWidth = width ?? 800
            let actualHeight = height ?? 600
            let x = (screen.frame.width - actualWidth) / 2
            let y = (screen.frame.height - actualHeight) / 2
            let bounds = NSRect(x: x, y: y, width: actualWidth, height: actualHeight)
            return (true, bounds)
        }
    }
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
}

class ViewportMaskView: NSView {
    var viewportRect: NSRect = .zero
    var maskColor = NSColor.black.withAlphaComponent(0.7)
    var borderColor = NSColor.white.withAlphaComponent(0.8)
    var borderWidth: CGFloat = 2

    override func draw(_ dirtyRect: NSRect) {
        guard viewportRect != .zero else { return }

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

// MARK: - Timeline Panel Window

class TimelinePanelWindow: NSWindow {
    let webView: WKWebView
    var currentStep: Int = -1
    var sceneYaml: String = ""
    let panelWidth: CGFloat = 300

    init() {
        let screen = NSScreen.main ?? NSScreen.screens[0]
        let height = screen.frame.height - 100  // Leave some margin

        // Configure web view
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: panelWidth, height: height), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")

        let frame = NSRect(x: 20, y: 50, width: panelWidth, height: height)
        super.init(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) - 1)  // Below cursor but above normal
        ignoresMouseEvents = false  // Allow scrolling
        hasShadow = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = webView

        // Load the timeline HTML
        loadTimelineHTML()
    }

    func loadTimelineHTML() {
        let html = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body {
                    width: 100%;
                    height: 100%;
                    background: rgba(9, 9, 11, 0.95);
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
                    color: #fff;
                    overflow: hidden;
                    border-radius: 12px;
                }
                #container {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    overflow: hidden;
                }
                #header {
                    padding: 12px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: rgba(255,255,255,0.02);
                }
                #controls {
                    padding: 10px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    background: rgba(255,255,255,0.02);
                }
                .ctrl-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.15);
                    background: rgba(255,255,255,0.05);
                    color: rgba(255,255,255,0.7);
                    font-size: 16px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ctrl-btn:hover {
                    background: rgba(255,255,255,0.1);
                    border-color: rgba(255,255,255,0.25);
                    color: #fff;
                }
                .ctrl-btn:active {
                    transform: scale(0.95);
                }
                .ctrl-btn.play {
                    width: 44px;
                    height: 44px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none;
                    color: #fff;
                    font-size: 18px;
                }
                .ctrl-btn.play:hover {
                    background: linear-gradient(135deg, #818cf8, #a78bfa);
                }
                .ctrl-btn.play.playing {
                    background: linear-gradient(135deg, #f87171, #ef4444);
                }
                .ctrl-btn.play.playing:hover {
                    background: linear-gradient(135deg, #fca5a5, #f87171);
                }
                .ctrl-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
                .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #4ade80;
                    box-shadow: 0 0 8px #4ade80;
                }
                .title { font-size: 14px; font-weight: 600; opacity: 0.9; }
                #steps {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px 20px;
                }
                .step {
                    position: relative;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding-bottom: 16px;
                    transition: all 0.3s ease;
                }
                .step.active { transform: scale(1.02); }
                .step.completed { opacity: 0.5; }
                .step.pending { opacity: 0.3; }
                .connector {
                    position: absolute;
                    left: 15px;
                    top: -8px;
                    width: 2px;
                    height: 8px;
                    background: #3f3f46;
                    transition: background 0.3s;
                }
                .step.completed .connector { background: #4ade80; }
                .node {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    background: #27272a;
                    border: 2px solid #3f3f46;
                    flex-shrink: 0;
                    transition: all 0.3s;
                }
                .step.active .node {
                    box-shadow: 0 0 12px var(--step-color, #6366f1);
                    border-color: var(--step-color, #6366f1);
                    background: var(--step-color, #6366f1);
                }
                .step.completed .node {
                    background: #4ade80;
                    border-color: #4ade80;
                }
                .content { flex: 1; padding-top: 4px; min-width: 0; }
                .label { font-size: 13px; font-weight: 500; }
                .detail { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .duration {
                    font-size: 10px;
                    padding: 2px 6px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 4px;
                    color: rgba(255,255,255,0.6);
                    font-family: monospace;
                }
                #footer {
                    padding: 12px 20px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    text-align: center;
                }
                #empty {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255,255,255,0.3);
                    font-size: 13px;
                }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
            </style>
        </head>
        <body>
            <div id="container">
                <div id="header">
                    <div class="dot" id="status-dot"></div>
                    <span class="title" id="scene-name">Timeline</span>
                </div>
                <div id="controls">
                    <button class="ctrl-btn" id="btn-reset" title="Reset">↺</button>
                    <button class="ctrl-btn" id="btn-prev" title="Previous">◀</button>
                    <button class="ctrl-btn play" id="btn-play" title="Play">▶</button>
                    <button class="ctrl-btn" id="btn-next" title="Next">▶</button>
                    <button class="ctrl-btn" id="btn-end" title="Go to end">⏭</button>
                </div>
                <div id="steps"></div>
                <div id="empty">No scene loaded</div>
                <div id="footer">0 steps</div>
            </div>
            <script>
                const stepsEl = document.getElementById('steps');
                const emptyEl = document.getElementById('empty');
                const footerEl = document.getElementById('footer');
                const sceneNameEl = document.getElementById('scene-name');
                const statusDot = document.getElementById('status-dot');
                const btnPlay = document.getElementById('btn-play');
                const btnPrev = document.getElementById('btn-prev');
                const btnNext = document.getElementById('btn-next');
                const btnReset = document.getElementById('btn-reset');
                const btnEnd = document.getElementById('btn-end');

                let steps = [];
                let currentStep = -1;
                let isPlaying = false;
                let playInterval = null;
                let playSpeed = 600; // ms between steps

                // Playback controls
                function updatePlayButton() {
                    btnPlay.textContent = isPlaying ? '⏸' : '▶';
                    btnPlay.classList.toggle('playing', isPlaying);
                    statusDot.style.background = isPlaying ? '#f87171' : '#4ade80';
                    statusDot.style.boxShadow = isPlaying ? '0 0 8px #f87171' : '0 0 8px #4ade80';
                }

                function stopPlayback() {
                    if (playInterval) {
                        clearInterval(playInterval);
                        playInterval = null;
                    }
                    isPlaying = false;
                    updatePlayButton();
                }

                function startPlayback() {
                    if (steps.length === 0) return;
                    isPlaying = true;
                    updatePlayButton();

                    // Start from beginning if at end
                    if (currentStep >= steps.length - 1) {
                        currentStep = -1;
                    }

                    playInterval = setInterval(() => {
                        if (currentStep < steps.length - 1) {
                            currentStep++;
                            render();
                        } else {
                            stopPlayback();
                        }
                    }, playSpeed);
                }

                function togglePlay() {
                    if (isPlaying) {
                        stopPlayback();
                    } else {
                        startPlayback();
                    }
                }

                function stepPrev() {
                    stopPlayback();
                    if (currentStep > 0) {
                        currentStep--;
                        render();
                    } else if (currentStep === -1 && steps.length > 0) {
                        currentStep = 0;
                        render();
                    }
                }

                function stepNext() {
                    stopPlayback();
                    if (currentStep < steps.length - 1) {
                        currentStep++;
                        render();
                    }
                }

                function goToEnd() {
                    stopPlayback();
                    if (steps.length > 0) {
                        currentStep = steps.length - 1;
                        render();
                    }
                }

                function resetPlayback() {
                    stopPlayback();
                    currentStep = -1;
                    render();
                }

                // Event listeners
                btnPlay.onclick = togglePlay;
                btnPrev.onclick = stepPrev;
                btnNext.onclick = stepNext;
                btnReset.onclick = resetPlayback;
                btnEnd.onclick = goToEnd;

                const stepConfig = {
                    'wait': { icon: '⏱', color: '#a3a3a3', label: 'Wait' },
                    'label': { icon: '💬', color: '#c084fc', label: 'Label' },
                    'label.update': { icon: '✏️', color: '#c084fc', label: 'Update' },
                    'label.hide': { icon: '🙈', color: '#c084fc', label: 'Hide Label' },
                    'record': { icon: '⏺', color: '#f87171', label: 'Record' },
                    'cursor.show': { icon: '↖', color: '#22d3ee', label: 'Cursor' },
                    'cursor.hide': { icon: '↗', color: '#22d3ee', label: 'Hide Cursor' },
                    'click': { icon: '👆', color: '#facc15', label: 'Click' },
                    'navigate': { icon: '🧭', color: '#4ade80', label: 'Navigate' },
                };

                function parseYaml(yaml) {
                    const lines = yaml.split('\\n');
                    const parsed = [];
                    let sceneName = 'Scene';
                    let inSequence = false;

                    for (const line of lines) {
                        if (line.match(/^\\s*name:/)) {
                            sceneName = line.split(':')[1]?.trim() || 'Scene';
                        }
                        if (line.match(/^sequence:/)) {
                            inSequence = true;
                            continue;
                        }
                        if (inSequence && line.match(/^\\s+-\\s/)) {
                            const match = line.match(/^\\s+-\\s+(\\S+):/);
                            if (match) {
                                const type = match[1];
                                const config = stepConfig[type] || { icon: '◆', color: '#6b7280', label: type };
                                const value = line.split(':').slice(1).join(':').trim();
                                parsed.push({
                                    type,
                                    icon: config.icon,
                                    color: config.color,
                                    label: config.label,
                                    detail: value || null
                                });
                            }
                        }
                    }
                    return { sceneName, steps: parsed };
                }

                function render() {
                    // Update button states
                    const hasSteps = steps.length > 0;
                    btnPlay.disabled = !hasSteps;
                    btnPrev.disabled = !hasSteps || currentStep <= 0;
                    btnNext.disabled = !hasSteps || currentStep >= steps.length - 1;
                    btnReset.disabled = !hasSteps || currentStep === -1;
                    btnEnd.disabled = !hasSteps || currentStep >= steps.length - 1;

                    if (steps.length === 0) {
                        stepsEl.style.display = 'none';
                        emptyEl.style.display = 'flex';
                        footerEl.textContent = '0 steps';
                        return;
                    }
                    stepsEl.style.display = 'block';
                    emptyEl.style.display = 'none';

                    stepsEl.innerHTML = steps.map((step, i) => {
                        const isActive = i === currentStep;
                        const isCompleted = currentStep >= 0 && i < currentStep;
                        const isPending = currentStep >= 0 && i > currentStep;
                        const classes = ['step'];
                        if (isActive) classes.push('active');
                        if (isCompleted) classes.push('completed');
                        if (isPending) classes.push('pending');

                        return `
                            <div class="${classes.join(' ')}" style="--step-color: ${step.color}">
                                ${i > 0 ? '<div class="connector"></div>' : ''}
                                <div class="node">${isCompleted && !isActive ? '✓' : step.icon}</div>
                                <div class="content">
                                    <div class="label">${step.label}</div>
                                    ${step.detail ? `<div class="detail">${step.detail}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('');

                    const status = currentStep >= 0 ? `${currentStep + 1} / ${steps.length}` : `${steps.length} steps`;
                    footerEl.textContent = status;

                    // Scroll active into view
                    if (currentStep >= 0) {
                        const activeEl = stepsEl.children[currentStep];
                        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }

                // API called from Swift (external control)
                window.setScene = function(yaml) {
                    stopPlayback();  // Stop local playback
                    const { sceneName, steps: parsedSteps } = parseYaml(yaml);
                    sceneNameEl.textContent = sceneName;
                    steps = parsedSteps;
                    currentStep = -1;
                    render();
                };

                window.setStep = function(index) {
                    // External step control - stop local playback
                    stopPlayback();
                    currentStep = index;
                    render();
                };

                window.reset = function() {
                    stopPlayback();
                    steps = [];
                    currentStep = -1;
                    sceneNameEl.textContent = 'Timeline';
                    render();
                };

                // Allow external control of playback
                window.play = function() { if (!isPlaying) startPlayback(); };
                window.pause = function() { stopPlayback(); };
                window.togglePlayback = togglePlay;

                render();
            </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func showPanel() {
        orderFrontRegardless()
    }

    func hidePanel() {
        orderOut(nil)
    }

    func setScene(yaml: String) {
        sceneYaml = yaml
        let escaped = yaml.replacingOccurrences(of: "\\", with: "\\\\")
                          .replacingOccurrences(of: "`", with: "\\`")
                          .replacingOccurrences(of: "\n", with: "\\n")
        webView.evaluateJavaScript("setScene(`\(escaped)`)", completionHandler: nil)
    }

    func setStep(index: Int) {
        currentStep = index
        webView.evaluateJavaScript("setStep(\(index))", completionHandler: nil)
    }

    func reset() {
        sceneYaml = ""
        currentStep = -1
        webView.evaluateJavaScript("reset()", completionHandler: nil)
    }
}

// MARK: - Control Panel Window

class ControlPanelWindow: NSWindow {
    let panelView = ControlPanelView()
    var onDismiss: (() -> Void)?
    var onStopRecording: (() -> Void)?  // Emits event to stop TS recorder
    var onClearStage: (() -> Void)?     // Clears stage overlays

    let panelWidth: CGFloat = 200

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
        contentView = panelView
        alphaValue = 0

        // Position in top-right corner
        positionInTopRight()
    }

    func positionInTopRight() {
        if let screen = NSScreen.main {
            let height = panelView.currentHeight
            let x = screen.visibleFrame.maxX - panelWidth - 10
            let y = screen.visibleFrame.maxY - height - 10
            setFrameOrigin(NSPoint(x: x, y: y))
        }
    }

    func animateResize() {
        let newHeight = panelView.currentHeight
        guard let screen = NSScreen.main else { return }

        let x = screen.visibleFrame.maxX - panelWidth - 10
        let y = screen.visibleFrame.maxY - newHeight - 10
        let newFrame = NSRect(x: x, y: y, width: panelWidth, height: newHeight)

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.2
            ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            animator().setFrame(newFrame, display: true)
            panelView.animator().frame = NSRect(x: 0, y: 0, width: panelWidth, height: newHeight)
        }
    }

    func showPanel() {
        positionInTopRight()
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
}

class ControlPanelView: NSView {
    enum State {
        case idle      // Listening, nothing active
        case active    // Overlays visible
        case recording // Recording in progress
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

        var hasAnyVisible: Bool {
            backdropVisible || cursorVisible || labelVisible ||
            viewportVisible || keysVisible || typerVisible
        }

        var visibleCount: Int {
            [backdropVisible, cursorVisible, labelVisible,
             viewportVisible, keysVisible, typerVisible].filter { $0 }.count
        }
    }

    var layers = LayerState()
    var stageExpanded = false  // Whether layer list is expanded

    // Separate state tracking
    var isRecording = false
    var hasStageActive: Bool { layers.hasAnyVisible }

    var state: State = .idle  // Legacy - computed from above
    var pulseTimer: Timer?
    var dotAlpha: CGFloat = 1.0

    // Callbacks
    var onCloseClick: (() -> Void)?
    var onStopRecordingClick: (() -> Void)?
    var onClearStageClick: (() -> Void)?
    var onToggleLayer: ((String) -> Void)?  // Toggle individual layer
    var onExpandedChanged: ((Bool) -> Void)?  // Notify when expanded changes

    // Hover states
    var closeButtonHovered = false
    var stopRecordingHovered = false
    var clearStageHovered = false
    var stageRowHovered = false
    var hoveredLayerIndex: Int? = nil

    // Layout constants
    let rowHeight: CGFloat = 22
    let layerRowHeight: CGFloat = 18
    let buttonWidth: CGFloat = 50
    let leftMargin: CGFloat = 14
    let headerHeight: CGFloat = 32
    let footerHeight: CGFloat = 24

    // Computed heights
    var collapsedHeight: CGFloat { headerHeight + rowHeight * 2 + footerHeight + 16 }
    var expandedHeight: CGFloat {
        collapsedHeight + CGFloat(6) * layerRowHeight + 8  // 6 possible layers + padding
    }
    var currentHeight: CGFloat {
        stageExpanded && hasStageActive ? expandedHeight : collapsedHeight
    }

    var closeButtonRect: NSRect {
        NSRect(x: bounds.width - 28, y: bounds.height - 26, width: 20, height: 20)
    }

    // Row positions (from top)
    var recordingRowY: CGFloat { bounds.height - headerHeight - rowHeight - 4 }
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

        // Header: "vif" brand + close button
        let brandFont = NSFont.systemFont(ofSize: 16, weight: .bold)
        let brandAttrs: [NSAttributedString.Key: Any] = [
            .font: brandFont,
            .foregroundColor: NSColor.white
        ]
        ("vif" as NSString).draw(at: NSPoint(x: leftMargin, y: bounds.height - 28), withAttributes: brandAttrs)

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

        // ─── Footer: Keyboard hints ─────────────────────────────────
        let smallFont = NSFont.systemFont(ofSize: 9, weight: .regular)
        let hintAttrs: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: NSColor(white: 0.4, alpha: 1.0)]
        ("ESC dismiss   ⇧⌘X reset" as NSString).draw(at: NSPoint(x: leftMargin - 4, y: 8), withAttributes: hintAttrs)
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
        }
    }

    override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let wasCloseHovered = closeButtonHovered
        let wasStopHovered = stopRecordingHovered
        let wasClearHovered = clearStageHovered
        let wasStageHovered = stageRowHovered

        closeButtonHovered = closeButtonRect.contains(point)
        stopRecordingHovered = stopRecordingRect.contains(point)
        clearStageHovered = clearStageRect.contains(point)
        stageRowHovered = stageExpandRect.contains(point)

        // Check layer hover (when expanded)
        let oldHoveredLayer = hoveredLayerIndex
        hoveredLayerIndex = nil
        if stageExpanded && hasStageActive {
            var yPos = stageRowY - 6
            for i in 0..<6 {
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
        pulseTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.dotAlpha = self.dotAlpha > 0.5 ? 0.3 : 1.0
            self.needsDisplay = true
        }
    }

    func stopPulsing() {
        pulseTimer?.invalidate()
        pulseTimer = nil
        dotAlpha = 1.0
        needsDisplay = true
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
    lazy var recorder = ScreenRecorder()
    lazy var controlPanel = ControlPanelWindow()
    lazy var timelinePanel = TimelinePanelWindow()
    lazy var cameraWindow = CameraWindow()
    var headlessMode = false  // When true, control panel stays hidden
    var useSocketMode = false  // When true, use Unix socket instead of stdio
    var socketPath = "/tmp/vif-agent.sock"
    var socketServer: SocketServer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        if useSocketMode {
            // Socket mode - start Unix socket server
            socketServer = SocketServer(path: socketPath)
            socketServer?.onCommand = { [weak self] line in
                self?.handleCommand(line)
            }
            do {
                try socketServer?.start()
                // Signal ready via socket (will be sent when client connects)
                fputs("[agent] Running in socket mode\n", stderr)
            } catch {
                fputs("[agent] Failed to start socket server: \(error)\n", stderr)
            }
        } else {
            // Stdio mode - emit ready and read stdin
            print("{\"event\":\"ready\",\"version\":\"1.0\"}")
            fflush(stdout)

            DispatchQueue.global(qos: .userInteractive).async {
                while let line = readLine() {
                    self.handleCommand(line)
                }
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
        cameraWindow.hideCamera()
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
               typerWindow.alphaValue > 0 ||
               cameraWindow.alphaValue > 0
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
            self.cursorWindow.hideCursor()
            self.viewportMask.hideMask()
            self.backdrop.hideBackdrop()
            self.labelWindow.hideLabel()
            self.keysWindow.hideKeys()
            self.typerWindow.hideTyper()
            self.cameraWindow.hideCamera()
            self.controlPanel.hidePanel()

            // Stop recording if active
            let status = self.recorder.status()
            if status.recording {
                _ = self.recorder.stop()
            }

            fputs("vif-agent: dismissed all overlays (Escape pressed)\n", stderr)
        }
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
        case "timeline":
            handleTimeline(cmd, json)
        case "camera":
            handleCamera(cmd, json)
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
            controlPanel.updateLayer("cursor", visible: true)
        case "hide":
            cursorWindow.hideCursor()
            controlPanel.updateLayer("cursor", visible: false)
        case "moveTo":
            let x = (json["x"] as? NSNumber)?.doubleValue ?? 0
            let y = (json["y"] as? NSNumber)?.doubleValue ?? 0
            let dur = (json["duration"] as? NSNumber)?.doubleValue ?? 0.3
            cursorWindow.moveTo(x: x, y: y, duration: dur)
            // Update position in layer state
            controlPanel.updateLayer("cursor", visible: true, details: ["x": x, "y": y])
        case "click":
            cursorWindow.click()
        case "doubleClick":
            cursorWindow.doubleClick()
        case "rightClick":
            cursorWindow.rightClick()
        case "dragStart":
            cursorWindow.dragStart()
        case "dragEnd":
            cursorWindow.dragEnd()
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
                controlPanel.updateLayer("keys", visible: true, details: ["keys": keys])
                if json["press"] as? Bool == true {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { pressKeys(keys) }
                }
            }
        case "press":
            if let keys = json["keys"] as? [String] {
                pressKeys(keys)
            }
        case "hide":
            keysWindow.hideKeys()
            controlPanel.updateLayer("keys", visible: false)
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
                controlPanel.updateLayer("typer", visible: true)
            }
        case "clear":
            typerWindow.clearText()
        case "hide":
            typerWindow.hideTyper()
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
            let rect = viewportMask.maskView.viewportRect
            controlPanel.updateLayer("viewport", visible: true, details: ["rect": rect])

        case "hide":
            viewportMask.hideMask()
            controlPanel.updateLayer("viewport", visible: false)

        default:
            respond(["ok": false, "error": "unknown viewport cmd: \(cmd)"])
            return
        }
        respond(["ok": true])
    }

    func handleStage(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "set":
            // Set up a clean stage: show backdrop, hide other apps, center the target app
            guard let app = json["app"] as? String else {
                respond(["ok": false, "error": "stage.set requires app name"])
                return
            }

            // Show solid backdrop first (covers everything)
            backdrop.showBackdrop()
            // Ensure control panel stays on top of backdrop
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
            // Restore everything: hide backdrop, restore app visibility
            backdrop.hideBackdrop()
            restoreAppState()
            let _ = showDesktopIcons()
            controlPanel.clearLayers()

        case "backdrop":
            // Just show/hide backdrop
            if json["show"] as? Bool == true {
                backdrop.showBackdrop()
                controlPanel.updateLayer("backdrop", visible: true)
                // Ensure control panel stays on top of backdrop
                controlPanel.orderFrontRegardless()
            } else {
                backdrop.hideBackdrop()
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
            controlPanel.updateLayer("label", visible: true, details: ["text": text])

        case "hide":
            labelWindow.hideLabel()
            controlPanel.updateLayer("label", visible: false)

        case "update":
            let text = json["text"] as? String ?? ""
            labelWindow.updateText(text)
            controlPanel.updateLayer("label", visible: true, details: ["text": text])

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
            fputs("[agent] panel: showing\n", stderr)
            respond(["ok": true])

        case "hide":
            controlPanel.hidePanel()
            fputs("[agent] panel: hidden\n", stderr)
            respond(["ok": true])

        case "headless":
            // Enable/disable headless mode (auto-hide panel during scenes)
            let enabled = json["enabled"] as? Bool ?? true
            headlessMode = enabled
            if enabled {
                controlPanel.hidePanel()
            }
            fputs("[agent] panel: headless mode \(enabled ? "on" : "off")\n", stderr)
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown panel cmd: \(cmd)"])
        }
    }

    func handleTimeline(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            timelinePanel.showPanel()
            fputs("[agent] timeline: showing\n", stderr)
            respond(["ok": true])

        case "hide":
            timelinePanel.hidePanel()
            fputs("[agent] timeline: hidden\n", stderr)
            respond(["ok": true])

        case "scene":
            if let yaml = json["yaml"] as? String {
                timelinePanel.setScene(yaml: yaml)
                fputs("[agent] timeline: scene loaded\n", stderr)
            }
            respond(["ok": true])

        case "step":
            if let index = json["index"] as? Int {
                timelinePanel.setStep(index: index)
                fputs("[agent] timeline: step \(index)\n", stderr)
            }
            respond(["ok": true])

        case "reset":
            timelinePanel.reset()
            fputs("[agent] timeline: reset\n", stderr)
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown timeline cmd: \(cmd)"])
        }
    }

    // MARK: - Camera (Presenter Facecam Overlay)

    func handleCamera(_ cmd: String, _ json: [String: Any]) {
        switch cmd {
        case "show":
            // Parse options
            if let position = json["position"] as? String {
                cameraWindow.setPosition(position)
            }
            if let size = json["size"] as? NSNumber {
                cameraWindow.setSize(CGFloat(size.doubleValue))
            } else if let sizeStr = json["size"] as? String {
                // Handle named sizes
                let sizeValue: CGFloat
                switch sizeStr {
                case "small": sizeValue = 100
                case "medium": sizeValue = 150
                case "large": sizeValue = 200
                default: sizeValue = 150
                }
                cameraWindow.setSize(sizeValue)
            }
            cameraWindow.showCamera()
            controlPanel.updateLayer("camera", visible: true)
            respond(["ok": true])

        case "hide":
            cameraWindow.hideCamera()
            controlPanel.updateLayer("camera", visible: false)
            respond(["ok": true])

        case "set":
            // Update position/size without hide/show cycle
            if let position = json["position"] as? String {
                cameraWindow.setPosition(position)
            }
            if let size = json["size"] as? NSNumber {
                cameraWindow.setSize(CGFloat(size.doubleValue))
            } else if let sizeStr = json["size"] as? String {
                let sizeValue: CGFloat
                switch sizeStr {
                case "small": sizeValue = 100
                case "medium": sizeValue = 150
                case "large": sizeValue = 200
                default: sizeValue = 150
                }
                cameraWindow.setSize(sizeValue)
            }
            respond(["ok": true])

        case "viewport":
            // Set viewport for smart positioning
            if let x = json["x"] as? NSNumber,
               let y = json["y"] as? NSNumber,
               let width = json["width"] as? NSNumber,
               let height = json["height"] as? NSNumber {
                let rect = NSRect(
                    x: CGFloat(x.doubleValue),
                    y: CGFloat(y.doubleValue),
                    width: CGFloat(width.doubleValue),
                    height: CGFloat(height.doubleValue)
                )
                cameraWindow.setViewport(rect)
            }
            respond(["ok": true])

        default:
            respond(["ok": false, "error": "unknown camera cmd: \(cmd)"])
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

            // Find BlackHole device index
            let deviceIndex = findBlackHoleDeviceIndex() ?? 1  // Default to 1

            // Stop any existing playback
            voiceProcess?.terminate()
            voiceProcess = nil

            // Play audio through BlackHole using ffmpeg (outputs to audiotoolbox device)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/ffmpeg")
            process.arguments = [
                "-i", expandedPath,      // Input file
                "-hide_banner",          // Less output
                "-loglevel", "error",
                "-f", "audiotoolbox",    // Output format
                "-audio_device_index", String(deviceIndex),
                "-"                      // Output to pipe (required for audiotoolbox)
            ]

            // Capture stderr
            let pipe = Pipe()
            process.standardError = pipe
            process.standardOutput = FileHandle.nullDevice

            do {
                try process.run()
                voiceProcess = process

                // Get audio duration for response
                let duration = getAudioDuration(expandedPath)

                fputs("[agent] voice: playing \(file) → BlackHole (device \(deviceIndex))\n", stderr)
                respond(["ok": true, "file": file, "duration": duration, "deviceIndex": deviceIndex])
            } catch {
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

    /// Get audio file duration in seconds
    func getAudioDuration(_ path: String) -> Double {
        let asset = AVURLAsset(url: URL(fileURLWithPath: path))
        let duration = CMTimeGetSeconds(asset.duration)
        return duration.isNaN ? 0 : duration
    }

    func respond(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict),
           let str = String(data: data, encoding: .utf8) {
            if useSocketMode {
                socketServer?.send(str)
            } else {
                print(str)
                fflush(stdout)
            }
        }
    }

    func emitEvent(_ dict: [String: Any]) {
        respond(dict)
    }
}

// MARK: - Unix Socket Server

class SocketServer {
    let socketPath: String
    var serverSocket: Int32 = -1
    var clientSocket: Int32 = -1
    var onCommand: ((String) -> Void)?

    init(path: String = "/tmp/vif-agent.sock") {
        self.socketPath = path
    }

    func start() throws {
        // Remove existing socket file
        unlink(socketPath)

        // Create socket
        serverSocket = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocket >= 0 else {
            throw NSError(domain: "SocketServer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create socket"])
        }

        // Bind
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        socketPath.withCString { ptr in
            withUnsafeMutablePointer(to: &addr.sun_path.0) { dest in
                strcpy(dest, ptr)
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                bind(serverSocket, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult >= 0 else {
            throw NSError(domain: "SocketServer", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to bind socket"])
        }

        // Listen
        guard listen(serverSocket, 5) >= 0 else {
            throw NSError(domain: "SocketServer", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to listen on socket"])
        }

        fputs("[agent] Socket server listening on \(socketPath)\n", stderr)

        // Accept connections in background
        DispatchQueue.global(qos: .userInteractive).async {
            self.acceptLoop()
        }
    }

    private func acceptLoop() {
        while serverSocket >= 0 {
            var clientAddr = sockaddr_un()
            var clientLen = socklen_t(MemoryLayout<sockaddr_un>.size)

            let client = withUnsafeMutablePointer(to: &clientAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                    accept(serverSocket, sockaddrPtr, &clientLen)
                }
            }

            if client >= 0 {
                fputs("[agent] Client connected\n", stderr)
                clientSocket = client
                handleClient(client)
            }
        }
    }

    private func handleClient(_ socket: Int32) {
        var buffer = [CChar](repeating: 0, count: 65536)
        var lineBuffer = ""

        while socket >= 0 {
            let bytesRead = read(socket, &buffer, buffer.count - 1)
            if bytesRead <= 0 {
                fputs("[agent] Client disconnected\n", stderr)
                clientSocket = -1
                break
            }

            buffer[bytesRead] = 0
            if let str = String(cString: buffer, encoding: .utf8) {
                lineBuffer += str

                // Process complete lines
                while let range = lineBuffer.range(of: "\n") {
                    let line = String(lineBuffer[..<range.lowerBound])
                    lineBuffer = String(lineBuffer[range.upperBound...])

                    if !line.isEmpty {
                        onCommand?(line)
                    }
                }
            }
        }
    }

    func send(_ message: String) {
        guard clientSocket >= 0 else { return }
        let data = message + "\n"
        data.withCString { ptr in
            _ = write(clientSocket, ptr, strlen(ptr))
        }
    }

    func stop() {
        if clientSocket >= 0 {
            close(clientSocket)
            clientSocket = -1
        }
        if serverSocket >= 0 {
            close(serverSocket)
            serverSocket = -1
        }
        unlink(socketPath)
    }
}

// MARK: - Main

// Parse command line arguments
let args = CommandLine.arguments
let useSocket = args.contains("--socket")
let socketPath = args.first(where: { $0.hasPrefix("--socket-path=") })?.dropFirst(14).description ?? "/tmp/vif-agent.sock"

let app = NSApplication.shared
let agent = VifAgent()

// Configure socket mode if requested
if useSocket {
    agent.useSocketMode = true
    agent.socketPath = socketPath
}

app.delegate = agent
app.setActivationPolicy(.accessory)
app.run()
