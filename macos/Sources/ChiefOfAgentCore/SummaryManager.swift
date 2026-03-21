import Foundation
import CryptoKit

/// Reads Claude Code session JSONL files, generates 3-8 word summaries
/// using `claude -p --model haiku`, and caches results.
///
/// Refreshes every 3 minutes or when sessions change.
/// Fingerprints content to skip unchanged sessions.
@MainActor
public class SummaryManager: ObservableObject {

    // MARK: - Published State

    /// Session ID → summary text (e.g., "Implementing auth middleware for GIS-ERP")
    @Published public var summaries: [String: String] = [:]

    // MARK: - Configuration

    /// How often to refresh summaries (seconds)
    private let refreshInterval: TimeInterval = 180 // 3 minutes

    /// Max lines to read from end of JSONL file
    private let maxTailLines = 50

    /// Path to cached summaries
    private let cachePath: String

    /// Content fingerprints to skip unchanged sessions
    private var fingerprints: [String: String] = [:] // sessionId → SHA256

    /// Timer for periodic refresh
    private var timer: Timer?

    /// Whether a summarization is in progress
    private var isSummarizing = false

    // MARK: - Init

    public init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.cachePath = "\(home)/.chief-of-agent/summaries.json"
        loadCache()
    }

    // MARK: - Start / Stop

    public func start() {
        timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refreshIfNeeded(sessions: [:])
            }
        }
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Refresh

    /// Called when sessions change or on timer. Pass current sessions dict.
    public func refreshIfNeeded(sessions: [String: SessionData]) {
        guard !isSummarizing else { return }

        // Only summarize working/waiting sessions (skip idle/done/error)
        let activeSessions = sessions.filter {
            $0.value.status == .working || $0.value.status == .waiting
        }

        guard !activeSessions.isEmpty else { return }

        // Find JSONL files and extract content
        var sessionContents: [(id: String, project: String, content: String)] = []

        for (sessionId, session) in activeSessions {
            guard let jsonlPath = findJSONLPath(sessionId: sessionId, cwd: session.cwd),
                  let content = extractContent(from: jsonlPath) else {
                continue
            }

            // Fingerprint check — skip if unchanged
            let hash = sha256(content)
            if fingerprints[sessionId] == hash {
                continue
            }
            fingerprints[sessionId] = hash

            sessionContents.append((id: sessionId, project: session.project, content: content))
        }

        guard !sessionContents.isEmpty else { return }

        // Batch summarize
        isSummarizing = true
        Task.detached { [weak self] in
            let results = await self?.batchSummarize(sessionContents) ?? [:]
            await MainActor.run {
                self?.isSummarizing = false
                for (id, summary) in results {
                    self?.summaries[id] = summary
                }
                self?.saveCache()
            }
        }
    }

    // MARK: - Find JSONL Path

    /// Maps a session ID + CWD to the Claude Code JSONL file path.
    /// Claude stores sessions at ~/.claude/projects/<cwd-hash>/<session-id>.jsonl
    private func findJSONLPath(sessionId: String, cwd: String) -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let claudeProjectsDir = "\(home)/.claude/projects"

        // Claude's project hash: replace "/" with "-" and strip leading "-"
        let cwdHash = cwd.replacingOccurrences(of: "/", with: "-")
        let jsonlPath = "\(claudeProjectsDir)/\(cwdHash)/\(sessionId).jsonl"

        if FileManager.default.fileExists(atPath: jsonlPath) {
            return jsonlPath
        }

        // Fallback: search all project dirs for this session ID
        if let dirs = try? FileManager.default.contentsOfDirectory(atPath: claudeProjectsDir) {
            for dir in dirs {
                let candidate = "\(claudeProjectsDir)/\(dir)/\(sessionId).jsonl"
                if FileManager.default.fileExists(atPath: candidate) {
                    return candidate
                }
            }
        }

        return nil
    }

    // MARK: - Extract Content

    /// Read the last N lines of a JSONL file and extract user/assistant messages.
    private func extractContent(from path: String) -> String? {
        guard let data = FileManager.default.contents(atPath: path) else { return nil }
        guard let text = String(data: data, encoding: .utf8) else { return nil }

        let lines = text.components(separatedBy: "\n")
        let tailLines = Array(lines.suffix(maxTailLines))

        var messages: [String] = []

        for line in tailLines {
            guard let lineData = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else {
                continue
            }

            let type = obj["type"] as? String ?? ""
            guard type == "user" || type == "assistant" else { continue }

            guard let message = obj["message"] as? [String: Any],
                  let content = message["content"] else { continue }

            if let text = content as? String {
                messages.append("\(type): \(String(text.prefix(200)))")
            } else if let parts = content as? [[String: Any]] {
                for part in parts {
                    if part["type"] as? String == "text",
                       let text = part["text"] as? String {
                        messages.append("\(type): \(String(text.prefix(200)))")
                        break
                    }
                }
            }
        }

        return messages.isEmpty ? nil : messages.suffix(8).joined(separator: "\n")
    }

    // MARK: - Batch Summarize

    /// Calls `claude -p --model haiku` with a batch prompt to summarize all sessions at once.
    private func batchSummarize(_ sessions: [(id: String, project: String, content: String)]) async -> [String: String] {
        var prompt = """
        Summarize each Claude Code session in 3-8 words. Focus on WHAT the agent is doing.
        Return ONLY a JSON object mapping session_id to summary string. No markdown, no explanation.

        Sessions:
        """

        for session in sessions {
            prompt += "\n\n--- SESSION \(session.id) (project: \(session.project)) ---\n"
            prompt += session.content
        }

        prompt += "\n\nReturn JSON: {\"session_id\": \"summary\", ...}"

        // Call claude CLI
        let result = runClaude(prompt: prompt)
        guard let result = result else { return [:] }

        // Parse JSON response
        return parseResponse(result, sessionIds: sessions.map { $0.id })
    }

    /// Run `claude -p --model haiku` and return stdout. Kills process after 30s timeout.
    private func runClaude(prompt: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["claude", "-p", "--model", "haiku", "--no-input", prompt]

        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = Pipe() // suppress stderr

        do {
            try process.run()
        } catch {
            print("[SummaryManager] Failed to run claude: \(error)")
            return nil
        }

        // Kill after 30s if still running to prevent app hangs
        let killTimer = DispatchSource.makeTimerSource(queue: .global())
        killTimer.schedule(deadline: .now() + 30)
        killTimer.setEventHandler {
            if process.isRunning {
                print("[SummaryManager] Killing hung claude process (30s timeout)")
                process.terminate()
            }
        }
        killTimer.resume()

        process.waitUntilExit()
        killTimer.cancel()

        guard process.terminationStatus == 0 else {
            print("[SummaryManager] claude exited with status \(process.terminationStatus)")
            return nil
        }

        let data = stdout.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)
    }

    /// Parse the JSON response from Claude, handling markdown fences if present.
    private func parseResponse(_ text: String, sessionIds: [String]) -> [String: String] {
        // Strip markdown fences if present
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("```json") {
            cleaned = String(cleaned.dropFirst(7))
        } else if cleaned.hasPrefix("```") {
            cleaned = String(cleaned.dropFirst(3))
        }
        if cleaned.hasSuffix("```") {
            cleaned = String(cleaned.dropLast(3))
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let data = cleaned.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
            // Fallback: if only one session, treat entire response as the summary
            if sessionIds.count == 1 {
                let summary = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
                return [sessionIds[0]: summary]
            }
            return [:]
        }

        return dict
    }

    // MARK: - Cache

    private func loadCache() {
        guard let data = FileManager.default.contents(atPath: cachePath),
              let cache = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        if let sums = cache["summaries"] as? [String: String] {
            summaries = sums
        }
        if let fps = cache["fingerprints"] as? [String: String] {
            fingerprints = fps
        }
    }

    private func saveCache() {
        let cache: [String: Any] = [
            "summaries": summaries,
            "fingerprints": fingerprints
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: cache, options: .prettyPrinted) else {
            return
        }

        let tmpPath = cachePath + ".tmp"
        try? data.write(to: URL(fileURLWithPath: tmpPath))
        try? FileManager.default.removeItem(atPath: cachePath)
        try? FileManager.default.moveItem(atPath: tmpPath, toPath: cachePath)
    }

    // MARK: - Helpers

    private func sha256(_ string: String) -> String {
        let data = Data(string.utf8)
        let hash = SHA256.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}
