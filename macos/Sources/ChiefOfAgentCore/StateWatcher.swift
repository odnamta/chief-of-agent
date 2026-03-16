import Foundation
import Combine

@MainActor
public class StateWatcher: ObservableObject {

    // MARK: - Published State

    @Published public var sessions: [String: SessionData] = [:]
    @Published public var attentionCount: Int = 0

    /// Previous statuses keyed by session ID — used for transition detection
    public private(set) var previousStatuses: [String: SessionStatus] = [:]

    /// Callback fired when a session transitions to waiting or error
    public var onTransition: ((_ sessionId: String, _ session: SessionData, _ from: SessionStatus?) -> Void)?

    // MARK: - File Watching

    private let stateFilePath: String
    private var timer: Timer?
    private var lastModificationDate: Date?

    // MARK: - Init

    public init(stateFilePath: String? = nil) {
        self.stateFilePath = stateFilePath ?? {
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            return "\(home)/.chief-of-agent/state.json"
        }()
    }

    // MARK: - Start / Stop

    public func start() {
        // Poll immediately, then every 1 second
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.poll()
            }
        }
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Polling

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
