/**
 * vif-cursor: Overlay cursor for demo recording
 *
 * Commands (JSON via stdin):
 *   {"action": "show"}
 *   {"action": "hide"}
 *   {"action": "moveTo", "x": 500, "y": 300, "duration": 0.3}
 *   {"action": "click"}
 *   {"action": "quit"}
 */

import Cocoa
import Foundation

// MARK: - Cursor View

class CursorView: NSView {
    var ripplePhase: CGFloat = 0
    var showRipple = false

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Debug: subtle background to see window bounds
        // NSColor.systemBlue.withAlphaComponent(0.15).setFill()
        // bounds.fill()

        // Draw ripple if active
        if showRipple && ripplePhase > 0 {
            let rippleSize: CGFloat = 50 * ripplePhase
            let rippleRect = CGRect(
                x: bounds.midX - rippleSize/2,
                y: bounds.midY - rippleSize/2 + 16,
                width: rippleSize,
                height: rippleSize
            )
            let alpha = 0.5 * (1.0 - ripplePhase)
            ctx.setFillColor(NSColor.systemBlue.withAlphaComponent(alpha).cgColor)
            ctx.fillEllipse(in: rippleRect)
        }

        // Draw cursor at center-top (tip points up in flipped coords)
        ctx.saveGState()
        ctx.translateBy(x: bounds.midX - 12, y: bounds.midY)

        // Shadow
        ctx.saveGState()
        ctx.translateBy(x: 2, y: -2)
        drawCursor(ctx, fill: NSColor.black.withAlphaComponent(0.25))
        ctx.restoreGState()

        // White fill
        drawCursor(ctx, fill: .white)

        // Black stroke
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
        // macOS-style pointer, tip at top
        ctx.move(to: CGPoint(x: 0, y: 32))      // tip
        ctx.addLine(to: CGPoint(x: 0, y: 5))    // down left edge
        ctx.addLine(to: CGPoint(x: 5, y: 11))   // notch
        ctx.addLine(to: CGPoint(x: 9, y: 0))    // tail bottom
        ctx.addLine(to: CGPoint(x: 14, y: 3))   // tail right
        ctx.addLine(to: CGPoint(x: 10, y: 14))  // back up
        ctx.addLine(to: CGPoint(x: 17, y: 14))  // right point
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

// MARK: - Overlay Window

class OverlayWindow: NSWindow {
    let cursorView = CursorView()
    var logicalPosition: CGPoint = CGPoint(x: 400, y: 400)

    init() {
        super.init(
            contentRect: NSRect(x: 400, y: 400, width: 80, height: 80),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

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

        logicalPosition = CGPoint(x: x, y: y)

        // Convert: input is top-left origin, Cocoa is bottom-left
        let cocoaY = screen.frame.height - y - 40
        let origin = CGPoint(x: x - 40, y: cocoaY)

        if duration > 0 {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = duration
                ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 1, 0.3, 1)
                self.animator().setFrameOrigin(origin)
            }
        } else {
            setFrameOrigin(origin)
        }
    }

    func click() {
        cursorView.animateClick()

        // Post real click at logical position (CGEvent uses top-left origin)
        let point = logicalPosition

        DispatchQueue.global().async {
            if let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left) {
                down.post(tap: .cghidEventTap)
            }
            usleep(50000)
            if let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) {
                up.post(tap: .cghidEventTap)
            }
        }

        NSLog("vif-cursor: click at (\(Int(point.x)), \(Int(point.y)))")
    }

    func showCursor() {
        NSApp.activate(ignoringOtherApps: true)
        orderFrontRegardless()
        NSCursor.hide()
    }

    func hideCursor() {
        orderOut(nil)
        NSCursor.unhide()
    }
}

// MARK: - Command Handler

class Commander {
    let window: OverlayWindow

    init(_ window: OverlayWindow) {
        self.window = window
    }

    func process(_ line: String) {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = json["action"] as? String else { return }

        DispatchQueue.main.async { self.run(action, json) }
    }

    func run(_ action: String, _ json: [String: Any]) {
        switch action {
        case "show":
            window.showCursor()
            respond(["ok": true])

        case "hide":
            window.hideCursor()
            respond(["ok": true])

        case "moveTo":
            let x = (json["x"] as? NSNumber)?.doubleValue ?? 0
            let y = (json["y"] as? NSNumber)?.doubleValue ?? 0
            let dur = (json["duration"] as? NSNumber)?.doubleValue ?? 0.3
            window.moveTo(x: x, y: y, duration: dur)
            respond(["ok": true])

        case "click":
            window.click()
            respond(["ok": true])

        case "quit":
            respond(["ok": true])
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                NSApp.terminate(nil)
            }

        default:
            respond(["ok": false, "error": "unknown: \(action)"])
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

// MARK: - App

class AppDelegate: NSObject, NSApplicationDelegate {
    let window = OverlayWindow()
    var commander: Commander!

    func applicationDidFinishLaunching(_ notification: Notification) {
        commander = Commander(window)

        // Read stdin in background
        DispatchQueue.global(qos: .userInteractive).async {
            while let line = readLine() {
                self.commander.process(line)
            }
        }

        print("{\"event\":\"ready\"}")
        fflush(stdout)
    }
}

// MARK: - Main

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
