import Foundation

/// Tracks token usage and estimated cost per Claude Code session.
/// Reads usage data from Claude's JSONL session files.
@MainActor
public class CostTracker: ObservableObject {

    /// Per-session cost data.
    public struct SessionCost: Equatable {
        public let inputTokens: Int
        public let outputTokens: Int
        public let cacheReadTokens: Int
        public let cacheWriteTokens: Int
        public let apiCalls: Int
        public let estimatedCostUSD: Double

        public var formattedCost: String {
            if estimatedCostUSD < 0.01 { return "<$0.01" }
            return String(format: "$%.2f", estimatedCostUSD)
        }
    }

    /// Session ID → cost data
    @Published public var costs: [String: SessionCost] = [:]

    /// Total cost across all tracked sessions
    public var totalCost: Double {
        costs.values.reduce(0) { $0 + $1.estimatedCostUSD }
    }

    public var formattedTotalCost: String {
        if totalCost < 0.01 { return "<$0.01" }
        return String(format: "$%.2f", totalCost)
    }

    // Pricing per million tokens (Claude Opus 4)
    private static let inputPricePer1M: Double = 15.0
    private static let outputPricePer1M: Double = 75.0
    private static let cacheReadPricePer1M: Double = 1.5
    private static let cacheWritePricePer1M: Double = 18.75

    /// Cost threshold for alert (default: $5). Fires once per session when exceeded.
    public var alertThreshold: Double = 5.0

    /// Callback fired when a session exceeds the cost threshold.
    public var onCostAlert: ((_ sessionId: String, _ project: String, _ cost: Double) -> Void)?

    /// Sessions that have already triggered an alert (don't repeat)
    private var alertedSessions: Set<String> = []

    private let cachePath: String
    private var lastScanTime: Date?
    private let scanInterval: TimeInterval = 60 // 1 minute

    /// Track byte offsets per session to only read new data (incremental parsing)
    private var readOffsets: [String: UInt64] = [:]

    /// Running totals per session (accumulated across incremental reads)
    private var runningTotals: [String: (input: Int, output: Int, cacheRead: Int, cacheWrite: Int, calls: Int)] = [:]

    public init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.cachePath = "\(home)/.chief-of-agent/costs.json"
        loadCache()
        loadThresholdFromConfig()
    }

    /// Read cost_alert_threshold from config.json (written by CLI).
    private func loadThresholdFromConfig() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let configPath = "\(home)/.chief-of-agent/config.json"
        guard let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let threshold = json["cost_alert_threshold"] as? Double else {
            return
        }
        alertThreshold = threshold
    }

    /// Update costs for active sessions. Pass current sessions from StateWatcher.
    public func update(sessions: [String: SessionData]) {
        // Rate limit scans
        if let last = lastScanTime, Date().timeIntervalSince(last) < scanInterval {
            return
        }
        lastScanTime = Date()

        for (sessionId, session) in sessions {
            guard session.status == .working || session.status == .waiting else { continue }

            if let jsonlPath = findJSONLPath(sessionId: sessionId, cwd: session.cwd) {
                let cost = parseTokenUsage(sessionId: sessionId, from: jsonlPath)
                costs[sessionId] = cost

                // Fire alert if threshold exceeded (once per session)
                if cost.estimatedCostUSD >= alertThreshold && !alertedSessions.contains(sessionId) {
                    alertedSessions.insert(sessionId)
                    onCostAlert?(sessionId, session.project, cost.estimatedCostUSD)
                }
            }
        }

        saveCache()
    }

    // MARK: - Incremental JSONL Parsing

    /// Incrementally parses new bytes from a JSONL file, accumulating running totals.
    /// Only reads data after the last known offset — safe for 100MB+ files.
    private func parseTokenUsage(sessionId: String, from path: String) -> SessionCost {
        let fm = FileManager.default

        // Get current file size
        guard let attrs = try? fm.attributesOfItem(atPath: path),
              let fileSize = attrs[.size] as? UInt64 else {
            return makeCost(sessionId: sessionId)
        }

        let lastOffset = readOffsets[sessionId] ?? 0

        // Skip if no new data
        if fileSize <= lastOffset {
            return makeCost(sessionId: sessionId)
        }

        // Read only new bytes from lastOffset to end
        guard let fileHandle = FileHandle(forReadingAtPath: path) else {
            return makeCost(sessionId: sessionId)
        }
        defer { fileHandle.closeFile() }

        fileHandle.seek(toFileOffset: lastOffset)

        // Read in chunks (64KB) to avoid memory spikes
        let chunkSize = 65_536
        var buffer = ""
        var current = runningTotals[sessionId] ?? (input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0)

        while true {
            let chunk = fileHandle.readData(ofLength: chunkSize)
            if chunk.isEmpty { break }

            guard let text = String(data: chunk, encoding: .utf8) else { break }
            buffer += text

            // Process complete lines
            while let newlineRange = buffer.range(of: "\n") {
                let line = String(buffer[buffer.startIndex..<newlineRange.lowerBound])
                buffer = String(buffer[newlineRange.upperBound...])

                guard !line.isEmpty,
                      let lineData = line.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else {
                    continue
                }

                guard obj["type"] as? String == "assistant",
                      let message = obj["message"] as? [String: Any],
                      let usage = message["usage"] as? [String: Any] else {
                    continue
                }

                current.input += usage["input_tokens"] as? Int ?? 0
                current.output += usage["output_tokens"] as? Int ?? 0
                current.cacheRead += usage["cache_read_input_tokens"] as? Int ?? 0
                current.cacheWrite += usage["cache_creation_input_tokens"] as? Int ?? 0
                current.calls += 1
            }
        }

        // Update tracking state
        readOffsets[sessionId] = fileSize
        runningTotals[sessionId] = current

        return makeCost(sessionId: sessionId)
    }

    private func makeCost(sessionId: String) -> SessionCost {
        let t = runningTotals[sessionId] ?? (input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0)
        let cost = Double(t.input) * Self.inputPricePer1M / 1_000_000
            + Double(t.output) * Self.outputPricePer1M / 1_000_000
            + Double(t.cacheRead) * Self.cacheReadPricePer1M / 1_000_000
            + Double(t.cacheWrite) * Self.cacheWritePricePer1M / 1_000_000

        return SessionCost(
            inputTokens: t.input,
            outputTokens: t.output,
            cacheReadTokens: t.cacheRead,
            cacheWriteTokens: t.cacheWrite,
            apiCalls: t.calls,
            estimatedCostUSD: cost
        )
    }

    // MARK: - Find JSONL Path

    private func findJSONLPath(sessionId: String, cwd: String) -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let claudeProjectsDir = "\(home)/.claude/projects"
        let cwdHash = cwd.replacingOccurrences(of: "/", with: "-")
        let jsonlPath = "\(claudeProjectsDir)/\(cwdHash)/\(sessionId).jsonl"

        if FileManager.default.fileExists(atPath: jsonlPath) {
            return jsonlPath
        }

        // Fallback: search all project dirs
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

    // MARK: - Cache

    private func loadCache() {
        guard let data = FileManager.default.contents(atPath: cachePath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] else {
            return
        }

        for (sessionId, fields) in json {
            costs[sessionId] = SessionCost(
                inputTokens: fields["inputTokens"] as? Int ?? 0,
                outputTokens: fields["outputTokens"] as? Int ?? 0,
                cacheReadTokens: fields["cacheReadTokens"] as? Int ?? 0,
                cacheWriteTokens: fields["cacheWriteTokens"] as? Int ?? 0,
                apiCalls: fields["apiCalls"] as? Int ?? 0,
                estimatedCostUSD: fields["estimatedCostUSD"] as? Double ?? 0
            )
        }
    }

    private func saveCache() {
        var json: [String: [String: Any]] = [:]
        for (id, cost) in costs {
            json[id] = [
                "inputTokens": cost.inputTokens,
                "outputTokens": cost.outputTokens,
                "cacheReadTokens": cost.cacheReadTokens,
                "cacheWriteTokens": cost.cacheWriteTokens,
                "apiCalls": cost.apiCalls,
                "estimatedCostUSD": cost.estimatedCostUSD,
            ]
        }

        guard let data = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted) else { return }
        let tmpPath = cachePath + ".tmp"
        try? data.write(to: URL(fileURLWithPath: tmpPath))
        try? FileManager.default.removeItem(atPath: cachePath)
        try? FileManager.default.moveItem(atPath: tmpPath, toPath: cachePath)
    }
}
