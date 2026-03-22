import Foundation

/// Reads auto-decisions from ~/.chief-of-agent/decisions.jsonl
/// and publishes them for the menu bar UI.
@MainActor
public class DecisionFeed: ObservableObject {

    public struct Decision: Identifiable, Equatable {
        public var id: String { "\(timestamp)-\(tool)" }
        public let project: String
        public let tool: String
        public let detail: String
        public let decision: String   // "allow" or "deny"
        public let tier: String       // "rule" or "ai"
        public let rule: String?      // rule name if tier=rule
        public let confidence: Double? // AI confidence if tier=ai
        public let latencyMs: Int
        public let timestamp: String
    }

    @Published public var recent: [Decision] = []

    private let feedPath: String
    private var lastSize: UInt64 = 0

    public init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.feedPath = "\(home)/.chief-of-agent/decisions.jsonl"
        load()
    }

    /// Poll for new decisions (called from StateWatcher timer).
    public func poll() {
        let fm = FileManager.default
        guard fm.fileExists(atPath: feedPath) else { return }

        guard let attrs = try? fm.attributesOfItem(atPath: feedPath),
              let size = attrs[.size] as? UInt64 else { return }

        // Skip if file hasn't changed
        if size == lastSize { return }
        lastSize = size

        load()
    }

    private func load() {
        guard let data = FileManager.default.contents(atPath: feedPath),
              let text = String(data: data, encoding: .utf8) else { return }

        let lines = text.components(separatedBy: "\n").filter { !$0.isEmpty }
        let lastLines = Array(lines.suffix(10)) // Keep last 10 in UI

        var decisions: [Decision] = []
        for line in lastLines {
            guard let lineData = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else {
                continue
            }

            let decision = Decision(
                project: obj["project"] as? String ?? "?",
                tool: obj["tool"] as? String ?? "?",
                detail: obj["detail"] as? String ?? "",
                decision: obj["decision"] as? String ?? "?",
                tier: obj["tier"] as? String ?? "?",
                rule: obj["rule"] as? String,
                confidence: obj["confidence"] as? Double,
                latencyMs: obj["latency_ms"] as? Int ?? 0,
                timestamp: obj["timestamp"] as? String ?? ""
            )
            decisions.append(decision)
        }

        recent = decisions.reversed() // Most recent first
    }
}
