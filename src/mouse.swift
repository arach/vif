/**
 * Mouse Controller for Vif
 *
 * Native macOS mouse control using CoreGraphics.
 * Compiled during build, used by automation.ts
 */

import Cocoa
import CoreGraphics

let args = CommandLine.arguments

func printUsage() {
    print("""
    Usage: vif-mouse <command> [args]

    Commands:
      pos                  Get current mouse position (x,y)
      move <x> <y>         Move mouse to position
      click <x> <y>        Click at position
      rightclick <x> <y>   Right-click at position
      doubleclick <x> <y>  Double-click at position
      down <x> <y>         Mouse down at position
      up <x> <y>           Mouse up at position
      drag <x1> <y1> <x2> <y2>  Drag from point to point
    """)
}

if args.count < 2 {
    printUsage()
    exit(1)
}

let command = args[1]

func getPoint(_ xArg: String, _ yArg: String) -> CGPoint? {
    guard let x = Double(xArg), let y = Double(yArg) else { return nil }
    return CGPoint(x: x, y: y)
}

func getCurrentPosition() -> CGPoint {
    let event = CGEvent(source: nil)
    return event?.location ?? CGPoint.zero
}

func moveTo(_ point: CGPoint) {
    CGWarpMouseCursorPosition(point)
}

func postMouseEvent(_ type: CGEventType, at point: CGPoint, button: CGMouseButton = .left) {
    let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button)
    event?.post(tap: .cghidEventTap)
}

func click(at point: CGPoint, button: CGMouseButton = .left, count: Int = 1) {
    moveTo(point)
    usleep(10000) // Small delay after move

    let downType: CGEventType = button == .right ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = button == .right ? .rightMouseUp : .leftMouseUp

    for i in 0..<count {
        let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: point, mouseButton: button)
        let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: point, mouseButton: button)

        down?.setIntegerValueField(.mouseEventClickState, value: Int64(i + 1))
        up?.setIntegerValueField(.mouseEventClickState, value: Int64(i + 1))

        down?.post(tap: .cghidEventTap)
        usleep(30000)
        up?.post(tap: .cghidEventTap)

        if i < count - 1 {
            usleep(50000)
        }
    }
}

switch command {
case "pos":
    let pos = getCurrentPosition()
    print("\(Int(pos.x)),\(Int(pos.y))")

case "move":
    if args.count >= 4, let point = getPoint(args[2], args[3]) {
        moveTo(point)
    } else {
        print("Usage: move <x> <y>")
        exit(1)
    }

case "click":
    if args.count >= 4, let point = getPoint(args[2], args[3]) {
        click(at: point)
    } else {
        print("Usage: click <x> <y>")
        exit(1)
    }

case "rightclick":
    if args.count >= 4, let point = getPoint(args[2], args[3]) {
        click(at: point, button: .right)
    } else {
        print("Usage: rightclick <x> <y>")
        exit(1)
    }

case "doubleclick":
    if args.count >= 4, let point = getPoint(args[2], args[3]) {
        click(at: point, count: 2)
    } else {
        print("Usage: doubleclick <x> <y>")
        exit(1)
    }

case "down":
    if args.count >= 4, let point = getPoint(args[2], args[3]) {
        moveTo(point)
        postMouseEvent(.leftMouseDown, at: point)
    } else {
        print("Usage: down <x> <y>")
        exit(1)
    }

case "up":
    if args.count >= 4, let point = getPoint(args[2], args[3]) {
        postMouseEvent(.leftMouseUp, at: point)
    } else {
        print("Usage: up <x> <y>")
        exit(1)
    }

case "drag":
    if args.count >= 6,
       let from = getPoint(args[2], args[3]),
       let to = getPoint(args[4], args[5]) {
        moveTo(from)
        usleep(50000)
        postMouseEvent(.leftMouseDown, at: from)
        usleep(50000)

        // Smooth drag
        let steps = 20
        for i in 1...steps {
            let t = Double(i) / Double(steps)
            let x = from.x + (to.x - from.x) * t
            let y = from.y + (to.y - from.y) * t
            let point = CGPoint(x: x, y: y)
            postMouseEvent(.leftMouseDragged, at: point)
            usleep(10000)
        }

        postMouseEvent(.leftMouseUp, at: to)
    } else {
        print("Usage: drag <x1> <y1> <x2> <y2>")
        exit(1)
    }

default:
    print("Unknown command: \(command)")
    printUsage()
    exit(1)
}
