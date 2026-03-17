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

    // MARK: - File Watching

    private let stateFilePath: String
    private let pendingFilePath: String
    private let responsesDir: String
    private var timer: Timer?
    private var lastModificationDate: Date?
    private var lastPendingModificationDate: Date?

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
            Task { @MainActor in
                self?.poll()
                self?.pollPending()
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

        // Update previous statuses
        previousStatuses = newSessions.mapValues { $0.status }

        // Update published state
        sessions = newSessions
        attentionCount = newSessions.values.filter { $0.status.isAttentionNeeded }.count
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
        for (requestId, var fields) in rawRequests {
            fields["requestId"] = requestId
            guard let reqData = try? JSONSerialization.data(withJSONObject: fields),
                  let req = try? JSONDecoder().decode(PendingRequest.self, from: reqData) else {
                continue
            }
            requests.append(req)
        }

        // Sort oldest first so the user sees them in arrival order
        let sorted = requests.sorted { $0.timestamp < $1.timestamp }
        if sorted != pendingRequests {
            pendingRequests = sorted
        }
    }

    // MARK: - Respond to Pending Action

    /// Writes a response file that the CLI polls.
    /// The CLI will pick it up within 500ms and remove it from pending.json.
    public func respondToPending(requestId: String, decision: String) {
        let fm = FileManager.default

        // Ensure responses dir exists
        if !fm.fileExists(atPath: responsesDir) {
            try? fm.createDirectory(atPath: responsesDir, withIntermediateDirectories: true)
        }

        let responsePath = "\(responsesDir)/\(requestId).json"
        let payload = "{\"decision\":\"\(decision)\"}"
        try? payload.write(toFile: responsePath, atomically: true, encoding: .utf8)

        // Optimistically remove from local state so UI updates immediately
        pendingRequests.removeAll { $0.requestId == requestId }
        // Reset mod date so we re-read pending.json after CLI removes the entry
        lastPendingModificationDate = nil
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
              var stateFile = try? JSONDecoder().decode(StateFile.self, from: data) else { return }

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
