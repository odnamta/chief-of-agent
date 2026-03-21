import Foundation
import Network

/// Lightweight HTTP server on 127.0.0.1:19222 that receives Claude Code hook events.
///
/// Claude Code supports `"type": "http"` hooks that POST JSON to a URL.
/// This server handles those events via DispatchSemaphore to bridge the
/// NWConnection background callback to the @MainActor event handler.
public class HookServer: ObservableObject {

    public static let defaultPort: UInt16 = 19222

    @MainActor @Published public var isRunning = false

    private var listener: NWListener?
    private let port: UInt16

    /// Callback for hook events. Called on MainActor.
    /// Receives the parsed JSON and returns a response dict.
    /// The NW callback thread blocks (via semaphore) until this returns.
    @MainActor public var onHookEvent: ((_ event: [String: Any]) -> [String: Any])?

    /// Callback to wait for a pending decision. Called on NW background thread (nonisolated).
    /// Takes a requestId and timeout, returns the decision or nil.
    public var onWaitForDecision: ((_ requestId: String, _ timeout: TimeInterval) -> String?)?

    // MARK: - Init

    public init(port: UInt16 = 19222) {
        self.port = port
    }

    // MARK: - Start / Stop

    @MainActor
    public func start() {
        guard listener == nil else { return }

        let parameters = NWParameters.tcp
        let nwPort = NWEndpoint.Port(rawValue: port)!

        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host("127.0.0.1"),
            port: nwPort
        )

        do {
            let l = try NWListener(using: parameters, on: nwPort)

            l.stateUpdateHandler = { [weak self] state in
                guard let self = self else { return }
                Task { @MainActor in
                    switch state {
                    case .ready:
                        self.isRunning = true
                        print("[HookServer] Listening on 127.0.0.1:\(self.port)")
                    case .failed(let error):
                        self.isRunning = false
                        if case NWError.posix(let code) = error, code == .EADDRINUSE {
                            print("[HookServer] Port \(self.port) already in use — another instance may be running")
                        } else {
                            print("[HookServer] Failed: \(error)")
                        }
                    case .cancelled:
                        self.isRunning = false
                    default:
                        break
                    }
                }
            }

            // Capture weak self for the handler closure
            l.newConnectionHandler = { [weak self] connection in
                Self.handleConnection(connection) { event in
                    guard let self = self else { return nil }

                    // Phase 1: Call onHookEvent on MainActor to create pending request
                    let semaphore = DispatchSemaphore(value: 0)
                    var result: [String: Any]?

                    Task { @MainActor in
                        result = self.onHookEvent?(event)
                        semaphore.signal()
                    }

                    let timeout = semaphore.wait(timeout: .now() + 5.0)
                    if timeout == .timedOut {
                        print("[HookServer] onHookEvent timed out")
                        return nil
                    }

                    // Phase 2: If handler returned a pending request ID, wait for user decision
                    if let requestId = result?["__waitForDecision"] as? String,
                       let waitFn = self.onWaitForDecision {
                        // This blocks the NW thread until user approves/denies (up to 30s)
                        if let decision = waitFn(requestId, 30.0) {
                            return ["permissionDecision": decision]
                        }
                        return ["permissionDecision": "ask"]
                    }

                    return result
                }
            }

            l.start(queue: .global(qos: .userInteractive))
            listener = l
        } catch {
            print("[HookServer] Failed to create listener: \(error)")
        }
    }

    @MainActor
    public func stop() {
        listener?.cancel()
        listener = nil
        isRunning = false
    }

    // MARK: - Connection Handling (nonisolated)

    private static func handleConnection(
        _ connection: NWConnection,
        handler: @escaping ([String: Any]) -> [String: Any]?
    ) {
        connection.start(queue: .global(qos: .userInteractive))

        connection.receive(minimumIncompleteLength: 1, maximumLength: 1_048_576) { data, _, _, error in
            guard let data = data, error == nil else {
                connection.cancel()
                return
            }

            guard let request = String(data: data, encoding: .utf8) else {
                sendHTTPResponse(connection: connection, status: 400, body: "{\"error\":\"invalid encoding\"}")
                return
            }

            // Extract body from HTTP request (after \r\n\r\n)
            let parts = request.components(separatedBy: "\r\n\r\n")
            let body = parts.count > 1 ? parts[1] : ""

            // Route based on path
            let firstLine = request.components(separatedBy: "\r\n").first ?? ""

            if firstLine.contains("POST /hook") {
                guard let bodyData = body.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any] else {
                    sendHTTPResponse(connection: connection, status: 400, body: "{\"error\":\"invalid json\"}")
                    return
                }

                // Handler blocks via semaphore until MainActor responds
                let response = handler(json) ?? ["permissionDecision": "ask"] as [String: Any]
                if let responseData = try? JSONSerialization.data(withJSONObject: response),
                   let responseBody = String(data: responseData, encoding: .utf8) {
                    sendHTTPResponse(connection: connection, status: 200, body: responseBody)
                } else {
                    sendHTTPResponse(connection: connection, status: 200, body: "{\"permissionDecision\":\"ask\"}")
                }
            } else if firstLine.contains("GET /health") {
                sendHTTPResponse(connection: connection, status: 200, body: "{\"status\":\"ok\",\"port\":\(Self.defaultPort)}")
            } else {
                sendHTTPResponse(connection: connection, status: 404, body: "{\"error\":\"not found\"}")
            }
        }
    }

    // MARK: - HTTP Response

    private static func sendHTTPResponse(connection: NWConnection, status: Int, body: String) {
        let statusText: String
        switch status {
        case 200: statusText = "OK"
        case 400: statusText = "Bad Request"
        case 404: statusText = "Not Found"
        default: statusText = "Error"
        }

        let response = "HTTP/1.1 \(status) \(statusText)\r\nContent-Type: application/json\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"

        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
