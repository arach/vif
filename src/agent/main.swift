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
        makeKeyAndOrderFront(nil)
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

/// Center an app window on screen
func centerAppWindow(_ appName: String, width: CGFloat? = nil, height: CGFloat? = nil) -> Bool {
    guard let screen = NSScreen.main else { return false }

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
        return error == nil
    }
    return false
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

// MARK: - Control Panel Window

class ControlPanelWindow: NSWindow {
    let panelView = ControlPanelView()
    var onDismiss: (() -> Void)?

    init() {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 140, height: 60), styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = .popUpMenu
        ignoresMouseEvents = false  // Allow clicks for X button
        hasShadow = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panelView.frame = NSRect(x: 0, y: 0, width: 140, height: 60)
        panelView.onCloseClick = { [weak self] in
            self?.onDismiss?()
        }
        contentView = panelView
        alphaValue = 0

        // Position in top-right corner
        positionInTopRight()
    }

    func positionInTopRight() {
        if let screen = NSScreen.main {
            let x = screen.visibleFrame.maxX - 150
            let y = screen.visibleFrame.maxY - 70
            setFrameOrigin(NSPoint(x: x, y: y))
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

    var state: State = .idle
    var pulseTimer: Timer?
    var dotAlpha: CGFloat = 1.0
    var onCloseClick: (() -> Void)?
    var closeButtonHovered = false

    var closeButtonRect: NSRect {
        NSRect(x: bounds.width - 28, y: bounds.height - 26, width: 20, height: 20)
    }

    override func draw(_ dirtyRect: NSRect) {
        // Background rounded rect with subtle border
        let bgPath = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 12, yRadius: 12)
        NSColor(white: 0.08, alpha: 0.95).setFill()
        bgPath.fill()
        NSColor(white: 0.25, alpha: 0.5).setStroke()
        bgPath.lineWidth = 0.5
        bgPath.stroke()

        // Brand: "vif" in stylized font
        let brandFont = NSFont.systemFont(ofSize: 16, weight: .bold)
        let brandAttrs: [NSAttributedString.Key: Any] = [
            .font: brandFont,
            .foregroundColor: NSColor.white
        ]
        ("vif" as NSString).draw(at: NSPoint(x: 14, y: bounds.height - 28), withAttributes: brandAttrs)

        // State indicator (dot + label)
        let dotRect = NSRect(x: 50, y: bounds.height - 22, width: 8, height: 8)
        let stateFont = NSFont.systemFont(ofSize: 11, weight: .medium)

        switch state {
        case .recording:
            // Red pulsing dot + "REC"
            NSColor.systemRed.withAlphaComponent(dotAlpha).setFill()
            NSBezierPath(ovalIn: dotRect).fill()
            let attrs: [NSAttributedString.Key: Any] = [.font: stateFont, .foregroundColor: NSColor.systemRed]
            ("REC" as NSString).draw(at: NSPoint(x: 64, y: bounds.height - 24), withAttributes: attrs)

        case .active:
            // Green dot + "ready"
            NSColor.systemGreen.setFill()
            NSBezierPath(ovalIn: dotRect).fill()
            let attrs: [NSAttributedString.Key: Any] = [.font: stateFont, .foregroundColor: NSColor.systemGreen]
            ("ready" as NSString).draw(at: NSPoint(x: 64, y: bounds.height - 24), withAttributes: attrs)

        case .idle:
            // Gray dot + "idle"
            NSColor(white: 0.5, alpha: 1.0).setFill()
            NSBezierPath(ovalIn: dotRect).fill()
            let attrs: [NSAttributedString.Key: Any] = [.font: stateFont, .foregroundColor: NSColor(white: 0.5, alpha: 1.0)]
            ("idle" as NSString).draw(at: NSPoint(x: 64, y: bounds.height - 24), withAttributes: attrs)
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

        // Row 2: ESC hint
        let smallFont = NSFont.systemFont(ofSize: 10, weight: .regular)
        let escAttrs: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: NSColor(white: 0.45, alpha: 1.0)]
        ("ESC to dismiss" as NSString).draw(at: NSPoint(x: 14, y: 10), withAttributes: escAttrs)
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if closeButtonRect.contains(point) {
            onCloseClick?()
        }
    }

    override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let wasHovered = closeButtonHovered
        closeButtonHovered = closeButtonRect.contains(point)
        if wasHovered != closeButtonHovered {
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

    func setState(_ newState: State) {
        state = newState
        if newState == .recording {
            startPulsing()
        } else {
            stopPulsing()
        }
        needsDisplay = true
    }

    // Legacy method for compatibility
    func setRecording(_ recording: Bool) {
        setState(recording ? .recording : .active)
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

        // Wire up control panel X button
        controlPanel.onDismiss = { [weak self] in
            self?.dismissAll()
        }

        // Global Escape key handler to dismiss all overlays
        NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 { // Escape key
                self?.dismissAll()
            }
        }
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 { // Escape key
                self?.dismissAll()
                return nil
            }
            return event
        }
    }

    /// Check if any overlay is currently visible
    func anyOverlayVisible() -> Bool {
        return cursorWindow.isVisible ||
               viewportMask.isVisible ||
               backdrop.isVisible ||
               labelWindow.isVisible ||
               keysWindow.isVisible ||
               typerWindow.isVisible ||
               recorder.status().recording
    }

    /// Update control panel visibility and state based on overlay state
    func updateControlPanel() {
        if anyOverlayVisible() {
            controlPanel.showPanel()
            // Set state based on what's happening
            if recorder.status().recording {
                controlPanel.setState(.recording)
            } else {
                controlPanel.setState(.active)
            }
        } else {
            controlPanel.hidePanel()
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
        case "viewport":
            handleViewport(cmd, json)
        case "stage":
            handleStage(cmd, json)
        case "label":
            handleLabel(cmd, json)
        case "record":
            handleRecord(cmd, json)
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
            controlPanel.showPanel()
        case "hide":
            cursorWindow.hideCursor()
            updateControlPanel()
        case "moveTo":
            let x = (json["x"] as? NSNumber)?.doubleValue ?? 0
            let y = (json["y"] as? NSNumber)?.doubleValue ?? 0
            let dur = (json["duration"] as? NSNumber)?.doubleValue ?? 0.3
            cursorWindow.moveTo(x: x, y: y, duration: dur)
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
            }
        case "clear":
            typerWindow.clearText()
        case "hide":
            typerWindow.hideTyper()
        default:
            respond(["ok": false, "error": "unknown typer cmd: \(cmd)"])
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
            controlPanel.showPanel()

        case "hide":
            viewportMask.hideMask()
            updateControlPanel()

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

        case "backdrop":
            // Just show/hide backdrop
            if json["show"] as? Bool == true {
                backdrop.showBackdrop()
                controlPanel.showPanel()
            } else {
                backdrop.hideBackdrop()
                updateControlPanel()
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
            let _ = centerAppWindow(app, width: width.map { CGFloat($0) }, height: height.map { CGFloat($0) })

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
            controlPanel.showPanel()

        case "hide":
            labelWindow.hideLabel()
            updateControlPanel()

        case "update":
            let text = json["text"] as? String ?? ""
            labelWindow.updateText(text)

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
                controlPanel.showPanel()
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

        default:
            respond(["ok": false, "error": "unknown record cmd: \(cmd)"])
        }
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
