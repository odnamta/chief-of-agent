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

    /// Open a new terminal tab, cd to CWD, and resume the Claude session.
    /// Writes a temp shell script to avoid AppleScript injection via CWD/sessionId.
    public func restore(_ session: SavedSession) {
        let fm = FileManager.default
        let tmpDir = NSTemporaryDirectory()
        let scriptPath = "\(tmpDir)coa-restore-\(UUID().uuidString).sh"

        // Write a shell script with properly escaped arguments
        let content = "#!/bin/bash\ncd \(shellEscape(session.cwd)) && exec claude --resume \(shellEscape(session.sessionId))\n"

        guard let scriptData = content.data(using: .utf8),
              fm.createFile(atPath: scriptPath, contents: scriptData) else {
            print("[SessionStore] Failed to create restore script")
            return
        }

        // Make executable
        try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptPath)

        // Open in Terminal.app via `open -a Terminal`
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "Terminal", scriptPath]
        try? process.run()

        // Clean up script after 5s (Terminal will have forked by then)
        let pathToClean = scriptPath
        DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
            try? FileManager.default.removeItem(atPath: pathToClean)
        }
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

    // MARK: - Helpers

    /// Shell-safe escaping: wraps in single quotes, escapes internal single quotes.
    /// This is the POSIX-standard approach: 'foo'\''bar' → foo'bar
    private func shellEscape(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
