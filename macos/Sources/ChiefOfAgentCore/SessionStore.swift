import Foundation

/// Persists saved/bookmarked Claude sessions for later restore.
/// Also tracks recently closed sessions as history.
///
/// Storage: ~/.chief-of-agent/saved_sessions.json
@MainActor
public class SessionStore: ObservableObject {

    // MARK: - Models

    public struct SavedSession: Codable, Identifiable, Equatable {
        public var id: String { sessionId }
        public let sessionId: String
        public let project: String
        public let cwd: String
        public let summary: String?
        public let savedAt: String // ISO8601

        public init(sessionId: String, project: String, cwd: String, summary: String?, savedAt: String) {
            self.sessionId = sessionId
            self.project = project
            self.cwd = cwd
            self.summary = summary
            self.savedAt = savedAt
        }
    }

    // MARK: - Published State

    @Published public var savedSessions: [SavedSession] = []
    @Published public var recentHistory: [SavedSession] = []

    // MARK: - Config

    private let storagePath: String
    private let maxHistory = 20

    // MARK: - Init

    public init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.storagePath = "\(home)/.chief-of-agent/saved_sessions.json"
        load()
    }

    // MARK: - Save / Remove

    /// Bookmark a session for later restore.
    public func save(sessionId: String, project: String, cwd: String, summary: String?) {
        // Don't duplicate
        guard !savedSessions.contains(where: { $0.sessionId == sessionId }) else { return }

        let formatter = ISO8601DateFormatter()
        let session = SavedSession(
            sessionId: sessionId,
            project: project,
            cwd: cwd,
            summary: summary,
            savedAt: formatter.string(from: Date())
        )

        savedSessions.insert(session, at: 0)
        persist()
    }

    /// Remove a saved session.
    public func unsave(sessionId: String) {
        savedSessions.removeAll { $0.sessionId == sessionId }
        persist()
    }

    /// Track a session that just closed (for history).
    public func addToHistory(sessionId: String, project: String, cwd: String, summary: String?) {
        // Don't duplicate
        guard !recentHistory.contains(where: { $0.sessionId == sessionId }) else { return }

        let formatter = ISO8601DateFormatter()
        let session = SavedSession(
            sessionId: sessionId,
            project: project,
            cwd: cwd,
            summary: summary,
            savedAt: formatter.string(from: Date())
        )

        recentHistory.insert(session, at: 0)

        // Trim to maxHistory
        if recentHistory.count > maxHistory {
            recentHistory = Array(recentHistory.prefix(maxHistory))
        }

        persist()
    }

    /// Check if a session is saved.
    public func isSaved(_ sessionId: String) -> Bool {
        savedSessions.contains { $0.sessionId == sessionId }
    }

    // MARK: - Restore

    /// Open a new tab in the user's detected terminal and resume the Claude session.
    /// Detects Warp, iTerm2, or Terminal.app automatically.
    public func restore(_ session: SavedSession) {
        let command = "cd \(TerminalDetector.shellEscape(session.cwd)) && claude --resume \(TerminalDetector.shellEscape(session.sessionId))"
        TerminalDetector.openNewTab(command: command)
    }

    // MARK: - Persistence

    private func load() {
        guard let data = FileManager.default.contents(atPath: storagePath) else { return }

        struct StorageFormat: Codable {
            var saved: [SavedSession]
            var history: [SavedSession]
        }

        guard let storage = try? JSONDecoder().decode(StorageFormat.self, from: data) else { return }
        savedSessions = storage.saved
        recentHistory = storage.history
    }

    private func persist() {
        struct StorageFormat: Codable {
            var saved: [SavedSession]
            var history: [SavedSession]
        }

        let storage = StorageFormat(saved: savedSessions, history: recentHistory)
        guard let data = try? JSONEncoder().encode(storage) else { return }

        let configDir = (storagePath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)

        let tmpPath = storagePath + ".tmp"
        try? data.write(to: URL(fileURLWithPath: tmpPath))
        try? FileManager.default.removeItem(atPath: storagePath)
        try? FileManager.default.moveItem(atPath: tmpPath, toPath: storagePath)
    }

}
