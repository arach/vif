/**
 * Vif Targets SDK
 *
 * Add this to your macOS app to expose clickable targets to vif.
 * Vif will query http://localhost:7851/vif/targets to get coordinates.
 *
 * Usage:
 *   VifTargets.shared.register("sidebar.drafts", view: draftsButton)
 *   VifTargets.shared.start()  // Call once on app launch
 */

import Cocoa
import Network

public class VifTargets {
    public static let shared = VifTargets()

    private var targets: [String: NSView] = [:]
    private var listener: NWListener?
    private let port: UInt16 = 7851

    private init() {}

    /// Register a view as a clickable target
    public func register(_ identifier: String, view: NSView) {
        targets[identifier] = view
    }

    /// Unregister a target
    public func unregister(_ identifier: String) {
        targets.removeValue(forKey: identifier)
    }

    /// Start the HTTP server to expose targets
    public func start() {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true

            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)

            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }

            listener?.start(queue: .main)
            print("[VifTargets] Listening on port \(port)")
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
        connection.start(queue: .main)

        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, _, _ in
            guard let self = self,
                  let data = data,
                  let request = String(data: data, encoding: .utf8),
                  request.contains("GET /vif/targets") else {
                connection.cancel()
                return
            }

            // Build JSON response with current target coordinates
            let targetsJson = self.buildTargetsJson()
            let response = """
            HTTP/1.1 200 OK\r
            Content-Type: application/json\r
            Access-Control-Allow-Origin: *\r
            Content-Length: \(targetsJson.utf8.count)\r
            \r
            \(targetsJson)
            """

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func buildTargetsJson() -> String {
        var targetCoords: [String: [String: Int]] = [:]

        for (identifier, view) in targets {
            guard let window = view.window else { continue }

            // Get view center in screen coordinates
            let viewFrame = view.convert(view.bounds, to: nil)
            let windowFrame = window.frame

            // Convert to screen coordinates (top-left origin for vif)
            let screenHeight = NSScreen.main?.frame.height ?? 1080
            let x = Int(windowFrame.origin.x + viewFrame.midX)
            let y = Int(screenHeight - (windowFrame.origin.y + viewFrame.midY))

            targetCoords[identifier] = ["x": x, "y": y]
        }

        // Build JSON manually to avoid Foundation dependency
        var json = "{\"targets\":{"
        let items = targetCoords.map { key, value in
            "\"\(key)\":{\"x\":\(value["x"]!),\"y\":\(value["y"]!)}"
        }
        json += items.joined(separator: ",")
        json += "}}"

        return json
    }
}
