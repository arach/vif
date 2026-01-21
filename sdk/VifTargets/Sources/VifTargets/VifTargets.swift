/**
 * VifTargets SDK
 *
 * Expose clickable targets from your macOS app to vif for demo automation.
 * Vif queries http://localhost:7851/vif/targets to get live coordinates.
 *
 * SwiftUI Usage:
 *   Button("Submit") { ... }
 *     .vifTarget("submit-btn")
 *
 * AppKit Usage:
 *   VifTargets.shared.register("submit-btn", view: submitButton)
 *
 * Start on app launch:
 *   VifTargets.shared.start()
 */

import SwiftUI
import Cocoa
import Network

// MARK: - VifTargets Manager

public class VifTargets: ObservableObject {
    public static let shared = VifTargets()

    private var targets: [String: TargetInfo] = [:]
    private var listener: NWListener?
    private let port: UInt16 = 7851
    private let queue = DispatchQueue(label: "com.vif.targets", qos: .userInitiated)
    private let lock = NSLock()

    private init() {}

    // MARK: - Registration

    /// Register a target with screen coordinates
    public func register(_ identifier: String, frame: CGRect, windowFrame: CGRect) {
        lock.lock()
        defer { lock.unlock() }

        let screenHeight = NSScreen.main?.frame.height ?? 1080
        let x = Int(windowFrame.origin.x + frame.midX)
        let y = Int(screenHeight - (windowFrame.origin.y + frame.midY))

        targets[identifier] = TargetInfo(x: x, y: y, width: Int(frame.width), height: Int(frame.height))
    }

    /// Register an AppKit view as a target
    public func register(_ identifier: String, view: NSView) {
        guard let window = view.window else { return }
        let viewFrame = view.convert(view.bounds, to: nil)
        register(identifier, frame: viewFrame, windowFrame: window.frame)
    }

    /// Unregister a target
    public func unregister(_ identifier: String) {
        lock.lock()
        defer { lock.unlock() }
        targets.removeValue(forKey: identifier)
    }

    /// Clear all targets
    public func clearAll() {
        lock.lock()
        defer { lock.unlock() }
        targets.removeAll()
    }

    // MARK: - Server

    /// Start the HTTP server to expose targets
    public func start() {
        queue.async { [weak self] in
            self?.startServer()
        }
    }

    private func startServer() {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true

            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)

            listener?.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    print("[VifTargets] Server ready on port \(self.port)")
                case .failed(let error):
                    print("[VifTargets] Server failed: \(error)")
                default:
                    break
                }
            }

            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }

            listener?.start(queue: queue)
        } catch {
            print("[VifTargets] Failed to start: \(error)")
        }
    }

    /// Stop the server
    public func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)

        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, _, error in
            guard let self = self else {
                connection.cancel()
                return
            }

            if let error = error {
                print("[VifTargets] Receive error: \(error)")
                connection.cancel()
                return
            }

            guard let data = data,
                  let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }

            // Route request
            let response: String
            if request.contains("GET /vif/targets") {
                response = self.handleGetTargets()
            } else if request.contains("GET /vif/target/") {
                // Extract target name from path
                if let range = request.range(of: "GET /vif/target/"),
                   let endRange = request.range(of: " HTTP", range: range.upperBound..<request.endIndex) {
                    let targetName = String(request[range.upperBound..<endRange.lowerBound])
                    response = self.handleGetTarget(targetName)
                } else {
                    response = self.errorResponse(404, message: "Invalid target path")
                }
            } else if request.contains("GET /vif/health") {
                response = self.handleHealth()
            } else {
                response = self.errorResponse(404, message: "Not found")
            }

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func handleGetTargets() -> String {
        lock.lock()
        let targetsCopy = targets
        lock.unlock()

        var items: [String] = []
        for (key, info) in targetsCopy {
            items.append("\"\(key)\":{\"x\":\(info.x),\"y\":\(info.y),\"width\":\(info.width),\"height\":\(info.height)}")
        }

        let json = "{\"targets\":{\(items.joined(separator: ","))}}"
        return httpResponse(200, json: json)
    }

    private func handleGetTarget(_ name: String) -> String {
        lock.lock()
        let target = targets[name]
        lock.unlock()

        guard let info = target else {
            return errorResponse(404, message: "Target '\(name)' not found")
        }

        let json = "{\"x\":\(info.x),\"y\":\(info.y),\"width\":\(info.width),\"height\":\(info.height)}"
        return httpResponse(200, json: json)
    }

    private func handleHealth() -> String {
        lock.lock()
        let count = targets.count
        lock.unlock()

        let json = "{\"status\":\"ok\",\"targets\":\(count)}"
        return httpResponse(200, json: json)
    }

    private func httpResponse(_ status: Int, json: String) -> String {
        let statusText = status == 200 ? "OK" : "Error"
        return """
        HTTP/1.1 \(status) \(statusText)\r
        Content-Type: application/json\r
        Access-Control-Allow-Origin: *\r
        Content-Length: \(json.utf8.count)\r
        \r
        \(json)
        """
    }

    private func errorResponse(_ status: Int, message: String) -> String {
        let json = "{\"error\":\"\(message)\"}"
        return httpResponse(status, json: json)
    }
}

// MARK: - Target Info

struct TargetInfo {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

// MARK: - SwiftUI View Modifier

public extension View {
    /// Mark this view as a vif automation target
    func vifTarget(_ identifier: String) -> some View {
        self.modifier(VifTargetModifier(identifier: identifier))
    }
}

struct VifTargetModifier: ViewModifier {
    let identifier: String

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geometry in
                    Color.clear
                        .onAppear {
                            updateTarget(geometry: geometry)
                        }
                        .onChange(of: geometry.frame(in: .global)) { newFrame in
                            updateTarget(frame: newFrame)
                        }
                }
            )
    }

    private func updateTarget(geometry: GeometryProxy) {
        let frame = geometry.frame(in: .global)
        updateTarget(frame: frame)
    }

    private func updateTarget(frame: CGRect) {
        // Get the key window
        guard let window = NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first else {
            return
        }

        // Convert SwiftUI global coordinates to window coordinates
        // SwiftUI uses top-left origin, AppKit uses bottom-left
        let windowHeight = window.frame.height
        let flippedY = windowHeight - frame.origin.y - frame.height

        let windowFrame = CGRect(
            x: frame.origin.x,
            y: flippedY,
            width: frame.width,
            height: frame.height
        )

        VifTargets.shared.register(identifier, frame: windowFrame, windowFrame: window.frame)
    }
}

// MARK: - Convenience for Common Patterns

public extension View {
    /// Mark as a navigation/sidebar item target
    func vifNavTarget(_ name: String) -> some View {
        self.vifTarget("nav.\(name)")
    }

    /// Mark as a button target
    func vifButton(_ name: String) -> some View {
        self.vifTarget("btn.\(name)")
    }

    /// Mark as a tab target
    func vifTab(_ name: String) -> some View {
        self.vifTarget("tab.\(name)")
    }

    /// Mark as an input field target
    func vifInput(_ name: String) -> some View {
        self.vifTarget("input.\(name)")
    }
}
