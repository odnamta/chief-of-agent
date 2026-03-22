import Foundation
import Combine

@MainActor
public class StateWatcher: ObservableObject {

    // MARK: - Published State

    @Published public var sessions: [String: SessionData] = [:]
    @Published public var attentionCount: Int = 0

    /// Pending destructive actions awaiting user approval/denial in the menu bar.
    @Published public var pendingRequests: [PendingRequest] = []

    /// Previous statuses keyed by session ID — used for transition detection
    public private(set) var previousStatuses: [String: SessionStatus] = [:]

    /// Callback fired when a session transitions to waiting or error
    public var onTransition: ((_ sessionId: String, _ session: SessionData, _ from: SessionStatus?) -> Void)?

    /// Callback fired when sessions dict changes (for summary refresh)
    public var onSessionsChanged: ((_ sessions: [String: SessionData]) -> Void)?

    /// Callback fired when a session is removed from state.json (SessionEnd)
    public var onSessionRemoved: ((_ sessionId: String, _ session: SessionData) -> Void)?

    // MARK: - File Watching

    private let stateFilePath: String
    private let pendingFilePath: String
    private let responsesDir: String
    private var timer: Timer?
    private var lastModificationDate: Date?
    private var lastPendingModificationDate: Date?
    private var isPolling = false

    // MARK: - Init

    public init(stateFilePath: String? = nil) {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let configDir = "\(home)/.chief-of-agent"
        self.stateFilePath = stateFilePath ?? "\(configDir)/state.json"
        self.pendingFilePath = "\(configDir)/pending.json"
        self.responsesDir = "\(configDir)/responses"
    }

    // MARK: - Start / Stop

    public func start() {
        // Poll immediately, then every 1 second
        poll()
        pollPending()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let watcher = self else { return }
            Task { @MainActor in
                guard !watcher.isPolling else { return }
                watcher.isPolling = true
                watcher.poll()
                watcher.pollPending()
                watcher.isPolling = false
            }
        }
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Sessions Polling

    public func poll() {
        let fm = FileManager.default

        guard fm.fileExists(atPath: stateFilePath) else {
            if !sessions.isEmpty {
                sessions = [:]
                attentionCount = 0
                previousStatuses = [:]
            }
            return
        }

        // Check modification date to skip unnecessary reads
        if let attrs = try? fm.attributesOfItem(atPath: stateFilePath),
           let modDate = attrs[.modificationDate] as? Date {
            if let last = lastModificationDate, modDate == last {
                return // No change
            }
            lastModificationDate = modDate
        }

        // Read and decode
        guard let data = fm.contents(atPath: stateFilePath) else { return }
        guard let stateFile = try? JSONDecoder().decode(StateFile.self, from: data) else { return }

        let newSessions = stateFile.sessions

        // Detect transitions
        for (id, session) in newSessions {
            let oldStatus = previousStatuses[id]
            if session.status.isAttentionNeeded && oldStatus != session.status {
                onTransition?(id, session, oldStatus)
            }
        }

        // Detect removed sessions (SessionEnd)
        for (id, session) in sessions {
            if newSessions[id] == nil {
                onSessionRemoved?(id, session)
            }
        }

        // Update previous statuses
        previousStatuses = newSessions.mapValues { $0.status }

        // Update published state
        let changed = sessions != newSessions
        sessions = newSessions
        attentionCount = newSessions.values.filter { $0.status.isAttentionNeeded }.count

        if changed {
            onSessionsChanged?(newSessions)
        }
    }

    // MARK: - Pending Actions Polling

    public func pollPending() {
        let fm = FileManager.default

        guard fm.fileExists(atPath: pendingFilePath) else {
            if !pendingRequests.isEmpty {
                pendingRequests = []
            }
            return
        }

        // Check modification date to skip unnecessary reads
        if let attrs = try? fm.attributesOfItem(atPath: pendingFilePath),
           let modDate = attrs[.modificationDate] as? Date {
            if let last = lastPendingModificationDate, modDate == last {
                return
            }
            lastPendingModificationDate = modDate
        }

        guard let data = fm.contents(atPath: pendingFilePath) else { return }

        // Decode: pending.json has { "requests": { "<id>": { ...fields without requestId... } } }
        // We need to inject the key as `requestId` since the CLI doesn't include it in the value.
        guard let rawJSON = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawRequests = rawJSON["requests"] as? [String: [String: Any]] else {
            return
        }

        var requests: [PendingRequest] = []
        var staleIds: [String] = []

        for (requestId, var fields) in rawRequests {
            fields["requestId"] = requestId
            guard let reqData = try? JSONSerialization.data(withJSONObject: fields),
                  let req = try? JSONDecoder().decode(PendingRequest.self, from: reqData) else {
                continue
            }
            if req.isStale {
                staleIds.append(requestId)
            } else {
                requests.append(req)
            }
        }

        // Auto-remove stale entries from pending.json (orphaned by crashed CLI)
        if !staleIds.isEmpty {
            removeStalePendingFromFile(staleIds)
        }

        // Sort oldest first so the user sees them in arrival order
        let sorted = requests.sorted { $0.timestamp < $1.timestamp }
        if sorted != pendingRequests {
            pendingRequests = sorted
        }
    }

    /// Remove stale pending request entries from pending.json
    private func removeStalePendingFromFile(_ staleIds: [String]) {
        let fm = FileManager.default
        guard let data = fm.contents(atPath: pendingFilePath),
              let rawJSON = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              var rawRequests = rawJSON["requests"] as? [String: Any] else {
            return
        }

        for id in staleIds {
            rawRequests.removeValue(forKey: id)
        }

        let updated: [String: Any] = ["requests": rawRequests]
        guard let newData = try? JSONSerialization.data(withJSONObject: updated, options: .prettyPrinted) else {
            return
        }
        let tmpPath = pendingFilePath + ".tmp"
        try? newData.write(to: URL(fileURLWithPath: tmpPath))
        try? fm.removeItem(atPath: pendingFilePath)
        try? fm.moveItem(atPath: tmpPath, toPath: pendingFilePath)

        // Reset mod date so next poll re-reads
        lastPendingModificationDate = nil
    }

    // MARK: - Request ID Validation

    /// Validates that a requestId is a proper UUID to prevent path traversal attacks.
    private func isValidRequestId(_ id: String) -> Bool {
        let pattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
        return id.range(of: pattern, options: .regularExpression) != nil
    }

    // MARK: - Respond to Pending Action

    /// Writes a response file that the CLI polls.
    /// The CLI will pick it up within 500ms and remove it from pending.json.
    public func respondToPending(requestId: String, decision: String) {
        guard isValidRequestId(requestId) else {
            print("[StateWatcher] Rejected invalid requestId: \(requestId)")
            return
        }
        let fm = FileManager.default

        // Ensure responses dir exists
        if !fm.fileExists(atPath: responsesDir) {
            try? fm.createDirectory(atPath: responsesDir, withIntermediateDirectories: true)
        }

        let responsePath = "\(responsesDir)/\(requestId).json"
        let payload = "{\"decision\":\"\(decision)\"}"
        try? payload.write(toFile: responsePath, atomically: true, encoding: .utf8)

        // If this is an HTTP-origin pending request, resolve the continuation
        if httpPendingDecisions[requestId] != nil {
            resolveHTTPPending(requestId: requestId, decision: decision)
            return
        }

        // Optimistically remove from local state so UI updates immediately
        pendingRequests.removeAll { $0.requestId == requestId }
        // Reset mod date so we re-read pending.json after CLI removes the entry
        lastPendingModificationDate = nil
    }

    // MARK: - Dismiss Stale Pending Action

    /// Removes a pending request from pending.json without writing a response file.
    /// Used for expired entries where the CLI has already timed out.
    public func dismissPending(requestId: String) {
        guard isValidRequestId(requestId) else {
            print("[StateWatcher] Rejected invalid requestId: \(requestId)")
            return
        }
        pendingRequests.removeAll { $0.requestId == requestId }
        removeStalePendingFromFile([requestId])
    }

    // MARK: - HTTP Pending Actions (via HookServer)

    /// Continuations waiting for user decisions on HTTP-submitted pending requests.
    /// Key: requestId, Value: semaphore + decision storage
    private var httpPendingDecisions: [String: (semaphore: DispatchSemaphore, decision: String?)] = [:]

    /// Creates a pending request from an HTTP hook event and blocks until the user
    /// approves/denies via the menu bar UI. Returns the decision ("allow"/"deny") or
    /// nil if timed out.
    ///
    /// Called from the HookServer's onHookEvent callback (on MainActor).
    /// The HookServer's NW thread is separately blocked via its own semaphore.
    public func addHTTPPending(event: [String: Any]) -> String? {
        let requestId = UUID().uuidString
        let tool = event["tool"] as? String ?? "Unknown"
        let input = event["input"] as? [String: Any]
        let detail: String
        if let command = input?["command"] as? String {
            detail = command
        } else if let filePath = input?["file_path"] as? String {
            detail = filePath
        } else {
            detail = String(describing: input ?? [:]).prefix(200).description
        }

        let sessionId = event["sessionId"] as? String ?? "unknown"
        let project = event["project"] as? String ?? "unknown"

        let formatter = ISO8601DateFormatter()
        let request = PendingRequest(
            requestId: requestId,
            sessionId: sessionId,
            project: project,
            tool: tool,
            detail: detail,
            timestamp: formatter.string(from: Date()),
            rule: "http-hook"
        )

        // Add to UI
        pendingRequests.append(request)

        // Create a semaphore for this request (will be signaled when user decides)
        let semaphore = DispatchSemaphore(value: 0)
        httpPendingDecisions[requestId] = (semaphore: semaphore, decision: nil)

        return requestId
    }

    /// Called after the user clicks Approve/Deny on an HTTP-origin pending request.
    /// Signals the waiting semaphore so the HookServer can return the response.
    public func resolveHTTPPending(requestId: String, decision: String) {
        if var entry = httpPendingDecisions[requestId] {
            entry.decision = decision
            httpPendingDecisions[requestId] = entry
            entry.semaphore.signal()
        }
        pendingRequests.removeAll { $0.requestId == requestId }
    }

    /// Wait for the user decision on an HTTP pending request. Called from background thread.
    /// Returns the decision or nil on timeout.
    public nonisolated func waitForHTTPDecision(requestId: String, timeout: TimeInterval = 30) -> String? {
        // We need to read from httpPendingDecisions which is MainActor-isolated.
        // Get the semaphore synchronously via a bridging pattern.
        // Using Box to avoid capturing mutable vars in @Sendable Task closures.
        let semaphore: DispatchSemaphore? = {
            let s = DispatchSemaphore(value: 0)
            let resultBox = Box<DispatchSemaphore>()
            Task { @MainActor in
                resultBox.value = self.httpPendingDecisions[requestId]?.semaphore
                s.signal()
            }
            s.wait()
            return resultBox.value
        }()

        guard let semaphore = semaphore else { return nil }

        let waitResult = semaphore.wait(timeout: .now() + timeout)
        if waitResult == .timedOut {
            // Clean up on timeout
            Task { @MainActor in
                self.httpPendingDecisions.removeValue(forKey: requestId)
                self.pendingRequests.removeAll { $0.requestId == requestId }
            }
            return nil
        }

        // Read decision
        let decisionSemaphore = DispatchSemaphore(value: 0)
        let decisionBox = Box<String>()
        Task { @MainActor in
            decisionBox.value = self.httpPendingDecisions[requestId]?.decision
            self.httpPendingDecisions.removeValue(forKey: requestId)
            decisionSemaphore.signal()
        }
        decisionSemaphore.wait()
        return decisionBox.value
    }

    /// Thread-safe box for passing values out of @Sendable closures.
    ///
    /// SAFETY CONTRACT: This type is `@unchecked Sendable` because its `value`
    /// property is only written from one side of a DispatchSemaphore and read
    /// from the other side after `semaphore.wait()` returns. The semaphore
    /// provides the happens-before ordering that makes concurrent access safe.
    /// DO NOT use this box without a semaphore serializing read/write access.
    private final class Box<T: Sendable>: @unchecked Sendable {
        var value: T?
    }

    // MARK: - Stale Session Cleanup

    private static let staleThreshold: TimeInterval = 30 * 60 // 30 minutes

    /// Number of sessions with no event for 30+ minutes
    public var staleCount: Int {
        sessions.values.filter { isStale($0) }.count
    }

    public func isStale(_ session: SessionData) -> Bool {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: session.last_event_at) ?? {
            let basic = ISO8601DateFormatter()
            return basic.date(from: session.last_event_at)
        }()
        guard let eventDate = date else { return true }
        return Date().timeIntervalSince(eventDate) > Self.staleThreshold
    }

    /// Remove stale sessions from state.json
    public func removeStale() {
        let staleIds = sessions.filter { isStale($0.value) }.map { $0.key }
        guard !staleIds.isEmpty else { return }

        // Read, filter, write back
        let fm = FileManager.default
        guard let data = fm.contents(atPath: stateFilePath),
              let stateFile = try? JSONDecoder().decode(StateFile.self, from: data) else { return }

        var mutableSessions = stateFile.sessions
        for id in staleIds {
            mutableSessions.removeValue(forKey: id)
            previousStatuses.removeValue(forKey: id)
        }

        let updated = StateFile(sessions: mutableSessions)
        if let newData = try? JSONEncoder().encode(updated) {
            let tmpPath = stateFilePath + ".tmp"
            try? newData.write(to: URL(fileURLWithPath: tmpPath))
            try? fm.removeItem(atPath: stateFilePath)
            try? fm.moveItem(atPath: tmpPath, toPath: stateFilePath)
        }

        // Force re-poll
        lastModificationDate = nil
        poll()
    }

    // MARK: - Sorted Sessions

    /// Sessions sorted: attention-needed first, then by last_event_at descending
    public var sortedSessions: [(id: String, session: SessionData)] {
        sessions
            .sorted { a, b in
                // Attention-needed first
                if a.value.status.isAttentionNeeded != b.value.status.isAttentionNeeded {
                    return a.value.status.isAttentionNeeded
                }
                // Then by last_event_at descending
                return a.value.last_event_at > b.value.last_event_at
            }
            .map { (id: $0.key, session: $0.value) }
    }
}
