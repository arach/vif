/**
 * vif-agent: Unified automation overlay for demo recording
 *
 * Combines cursor, keyboard, and typing overlays in one process.
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
 *   // System
 *   {"action": "quit"}
 *
 * Build: swiftc -O -o vif-agent main.swift -framework Cocoa -framework Carbon
 */

import Cocoa
import Carbon.HIToolbox
import ApplicationServices

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

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Ripple effect
        if showRipple && ripplePhase > 0 {
            let size: CGFloat = 50 * ripplePhase
            let rect = CGRect(x: bounds.midX - size/2, y: bounds.midY - size/2 + 16, width: size, height: size)
            ctx.setFillColor(NSColor.systemBlue.withAlphaComponent(0.5 * (1.0 - ripplePhase)).cgColor)
            ctx.fillEllipse(in: rect)
        }

        // Drag indicator
        if isDragging {
            let size: CGFloat = 30
            let rect = CGRect(x: bounds.midX - size/2, y: bounds.midY - size/2 + 16, width: size, height: size)
            ctx.setFillColor(NSColor.systemOrange.withAlphaComponent(0.4).cgColor)
            ctx.fillEllipse(in: rect)
        }

        // Cursor
        ctx.saveGState()
        ctx.translateBy(x: bounds.midX - 12, y: bounds.midY)

        // Shadow
        ctx.saveGState()
        ctx.translateBy(x: 2, y: -2)
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
        ctx.move(to: CGPoint(x: 0, y: 32))
        ctx.addLine(to: CGPoint(x: 0, y: 5))
        ctx.addLine(to: CGPoint(x: 5, y: 11))
        ctx.addLine(to: CGPoint(x: 9, y: 0))
        ctx.addLine(to: CGPoint(x: 14, y: 3))
        ctx.addLine(to: CGPoint(x: 10, y: 14))
        ctx.addLine(to: CGPoint(x: 17, y: 14))
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

    init() {
        super.init(contentRect: NSRect(x: 400, y: 400, width: 80, height: 80), styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = .floating
        ignoresMouseEvents = true
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        cursorView.frame = NSRect(x: 0, y: 0, width: 80, height: 80)
        cursorView.wantsLayer = true
        contentView = cursorView
    }

    func moveTo(x: CGFloat, y: CGFloat, duration: Double) {
        guard let screen = NSScreen.main else { return }
        let oldPos = logicalPosition
        logicalPosition = CGPoint(x: x, y: y)
        let cocoaY = screen.frame.height - y - 40
        let origin = CGPoint(x: x - 40, y: cocoaY)

        if duration > 0 && isDragging {
            let steps = Int(duration * 60)
            for i in 0...steps {
                let t = Double(i) / Double(steps)
                let ix = oldPos.x + (x - oldPos.x) * t
                let iy = oldPos.y + (y - oldPos.y) * t
                DispatchQueue.main.asyncAfter(deadline: .now() + duration * t) {
                    self.postDrag(at: CGPoint(x: ix, y: iy))
                }
            }
        }

        if duration > 0 {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = duration
                ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 1, 0.3, 1)
                self.animator().setFrameOrigin(origin)
            }
        } else {
            setFrameOrigin(origin)
            if isDragging { postDrag(at: logicalPosition) }
        }
    }

    func postDrag(at p: CGPoint) {
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    }

    func click() {
        cursorView.animateClick()
        let p = logicalPosition
        DispatchQueue.global().async {
            CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
            usleep(50000)
            CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        }
    }

    func doubleClick() {
        cursorView.animateClick()
        let p = logicalPosition
        DispatchQueue.global().async {
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
        let p = logicalPosition
        DispatchQueue.global().async {
            CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: p, mouseButton: .right)?.post(tap: .cghidEventTap)
            usleep(50000)
            CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: p, mouseButton: .right)?.post(tap: .cghidEventTap)
        }
    }

    func dragStart() {
        isDragging = true
        cursorView.isDragging = true
        cursorView.needsDisplay = true
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: logicalPosition, mouseButton: .left)?.post(tap: .cghidEventTap)
    }

    func dragEnd() {
        isDragging = false
        cursorView.isDragging = false
        cursorView.needsDisplay = true
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: logicalPosition, mouseButton: .left)?.post(tap: .cghidEventTap)
    }

    func showCursor() {
        orderFrontRegardless()
        NSCursor.hide()
    }

    func hideCursor() {
        orderOut(nil)
        NSCursor.unhide()
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

// MARK: - Agent

class VifAgent: NSObject, NSApplicationDelegate {
    let cursorWindow = CursorWindow()
    let keysWindow = KeysWindow()
    let typerWindow = TyperWindow()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Check accessibility
        if !checkAccessibility() {
            print("{\"event\":\"error\",\"message\":\"Accessibility permission required\"}")
            fflush(stdout)
        }

        // Read stdin
        DispatchQueue.global(qos: .userInteractive).async {
            while let line = readLine() {
                self.handleCommand(line)
            }
        }

        print("{\"event\":\"ready\",\"version\":\"1.0\"}")
        fflush(stdout)
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
        case "hide":
            cursorWindow.hideCursor()
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
