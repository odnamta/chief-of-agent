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

    private let cachePath: String
    private var lastScanTime: Date?
    private let scanInterval: TimeInterval = 60 // 1 minute

    public init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.cachePath = "\(home)/.chief-of-agent/costs.json"
        loadCache()
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
                let cost = parseTokenUsage(from: jsonlPath)
                costs[sessionId] = cost
            }
        }

        saveCache()
    }

    // MARK: - JSONL Parsing

    private func parseTokenUsage(from path: String) -> SessionCost {
        guard let data = FileManager.default.contents(atPath: path),
              let text = String(data: data, encoding: .utf8) else {
            return SessionCost(inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0, estimatedCostUSD: 0)
        }

        var totalInput = 0
        var totalOutput = 0
        var totalCacheRead = 0
        var totalCacheWrite = 0
        var apiCalls = 0

        let lines = text.components(separatedBy: "\n")
        for line in lines {
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

            totalInput += usage["input_tokens"] as? Int ?? 0
            totalOutput += usage["output_tokens"] as? Int ?? 0
            totalCacheRead += usage["cache_read_input_tokens"] as? Int ?? 0
            totalCacheWrite += usage["cache_creation_input_tokens"] as? Int ?? 0
            apiCalls += 1
        }

        let cost = Double(totalInput) * Self.inputPricePer1M / 1_000_000
            + Double(totalOutput) * Self.outputPricePer1M / 1_000_000
            + Double(totalCacheRead) * Self.cacheReadPricePer1M / 1_000_000
            + Double(totalCacheWrite) * Self.cacheWritePricePer1M / 1_000_000

        return SessionCost(
            inputTokens: totalInput,
            outputTokens: totalOutput,
            cacheReadTokens: totalCacheRead,
            cacheWriteTokens: totalCacheWrite,
            apiCalls: apiCalls,
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
