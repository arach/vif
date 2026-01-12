/**
 * vif-typer: Typing overlay for demo recording
 *
 * Shows text being typed with visual feedback.
 * Controlled via stdin JSON commands.
 *
 * Commands:
 *   {"action": "type", "text": "Hello World"}
 *   {"action": "type", "text": "npm install", "style": "terminal"}
 *   {"action": "clear"}
 *   {"action": "hide"}
 *   {"action": "quit"}
 *
 * Build: swiftc -O -o vif-typer main.swift -framework Cocoa
 */

import Cocoa

// MARK: - Typing View

class TypingView: NSView {
    var displayedText: String = ""
    var style: String = "default"
    var cursorVisible: Bool = true
    var cursorTimer: Timer?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true

        // Blink cursor
        cursorTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.cursorVisible.toggle()
            self?.needsDisplay = true
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        cursorTimer?.invalidate()
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let padding: CGFloat = 20
        let textRect = bounds.insetBy(dx: padding, dy: padding)

        // Background based on style
        let bgColor: NSColor
        let textColor: NSColor
        let font: NSFont

        switch style {
        case "terminal":
            bgColor = NSColor(red: 0.1, green: 0.1, blue: 0.12, alpha: 0.95)
            textColor = NSColor(red: 0.3, green: 0.9, blue: 0.4, alpha: 1.0) // Green terminal
            font = NSFont.monospacedSystemFont(ofSize: 18, weight: .regular)

        case "code":
            bgColor = NSColor(red: 0.15, green: 0.16, blue: 0.18, alpha: 0.95)
            textColor = NSColor(red: 0.9, green: 0.9, blue: 0.85, alpha: 1.0)
            font = NSFont.monospacedSystemFont(ofSize: 16, weight: .regular)

        case "input":
            bgColor = NSColor.white.withAlphaComponent(0.95)
            textColor = NSColor.black
            font = NSFont.systemFont(ofSize: 18, weight: .regular)

        default:
            bgColor = NSColor(white: 0.15, alpha: 0.95)
            textColor = NSColor.white
            font = NSFont.systemFont(ofSize: 20, weight: .medium)
        }

        // Draw background
        let path = NSBezierPath(roundedRect: bounds, xRadius: 12, yRadius: 12)
        bgColor.setFill()
        path.fill()

        // Border
        NSColor(white: 0.3, alpha: 0.5).setStroke()
        path.lineWidth = 1
        path.stroke()

        // Draw prompt for terminal style
        var textToDraw = displayedText
        if style == "terminal" {
            textToDraw = "$ " + displayedText
        }

        // Add cursor
        if cursorVisible {
            textToDraw += "▌"
        }

        // Draw text
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: textColor
        ]

        let attrStr = NSAttributedString(string: textToDraw, attributes: attrs)
        let textSize = attrStr.size()

        // Center vertically, left-align horizontally
        let y = bounds.midY - textSize.height / 2
        attrStr.draw(at: NSPoint(x: padding, y: y))
    }
}

// MARK: - Typer Window

class TyperWindow: NSWindow {
    let typingView = TypingView()
    var currentText: String = ""
    var typeTimer: Timer?

    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 60),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

        isOpaque = false
        backgroundColor = .clear
        level = .floating
        ignoresMouseEvents = true
        hasShadow = true

        typingView.frame = NSRect(x: 0, y: 0, width: 500, height: 60)
        contentView = typingView

        // Start hidden
        alphaValue = 0
    }

    func typeText(_ text: String, style: String = "default", charDelay: Double = 0.05) {
        // Cancel any existing typing
        typeTimer?.invalidate()

        typingView.style = style
        typingView.displayedText = ""
        typingView.needsDisplay = true

        // Calculate window size based on text length
        let font: NSFont
        switch style {
        case "terminal", "code":
            font = NSFont.monospacedSystemFont(ofSize: 18, weight: .regular)
        default:
            font = NSFont.systemFont(ofSize: 20, weight: .medium)
        }

        let prefix = style == "terminal" ? "$ " : ""
        let fullText = prefix + text + "▌"
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        let size = (fullText as NSString).size(withAttributes: attrs)
        let width = min(max(size.width + 60, 200), 800)
        let height: CGFloat = 60

        setContentSize(NSSize(width: width, height: height))
        typingView.frame = NSRect(x: 0, y: 0, width: width, height: height)

        // Position at bottom center
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let x = screenFrame.midX - width / 2
            let y = screenFrame.minY + 180 // Above hotkey overlay
            setFrameOrigin(NSPoint(x: x, y: y))
        }

        // Show window
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.15
            animator().alphaValue = 1.0
        }

        // Type characters one by one
        var charIndex = 0
        let characters = Array(text)

        typeTimer = Timer.scheduledTimer(withTimeInterval: charDelay, repeats: true) { [weak self] timer in
            guard let self = self, charIndex < characters.count else {
                timer.invalidate()
                return
            }

            self.typingView.displayedText.append(characters[charIndex])
            self.typingView.needsDisplay = true
            charIndex += 1
        }
    }

    func clearText() {
        typeTimer?.invalidate()
        typingView.displayedText = ""
        typingView.needsDisplay = true
    }

    func hideTyper() {
        typeTimer?.invalidate()
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
    let window = TyperWindow()
    var stdinSource: DispatchSourceRead?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("vif-typer: ready")
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
            NSLog("vif-typer: invalid command: \(json)")
            return
        }

        switch action {
        case "type":
            if let text = obj["text"] as? String {
                let style = obj["style"] as? String ?? "default"
                let delay = obj["delay"] as? Double ?? 0.05
                NSLog("vif-typer: typing '\(text)' (\(style))")
                window.typeText(text, style: style, charDelay: delay)
            }

        case "clear":
            window.clearText()

        case "hide":
            window.hideTyper()

        case "quit":
            NSApp.terminate(nil)

        default:
            NSLog("vif-typer: unknown action: \(action)")
        }
    }
}

// MARK: - Main

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
