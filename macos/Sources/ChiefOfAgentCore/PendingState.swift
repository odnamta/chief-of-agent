import Foundation

// MARK: - Pending Request Model

/// A single pending action waiting for user approval/denial via the menu bar.
public struct PendingRequest: Codable, Equatable, Identifiable, Sendable {
    public var id: String { requestId }

    public let requestId: String
    public let sessionId: String
    public let project: String
    public let tool: String
    public let detail: String
    public let timestamp: String
    public let rule: String

    public init(
        requestId: String,
        sessionId: String,
        project: String,
        tool: String,
        detail: String,
        timestamp: String,
        rule: String
    ) {
        self.requestId = requestId
        self.sessionId = sessionId
        self.project = project
        self.tool = tool
        self.detail = detail
        self.timestamp = timestamp
        self.rule = rule
    }

    // MARK: - Staleness Detection

    /// Threshold after which a pending request is considered stale (5 minutes).
    /// CLI timeout is 120s, so anything past 5m is certainly orphaned.
    public static let staleThreshold: TimeInterval = 5 * 60

    /// Parse the ISO8601 timestamp into a Date.
    public var parsedDate: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
    }

    /// Whether the request is past the CLI's 120s polling window (likely expired).
    public var isLikelyExpired: Bool {
        guard let date = parsedDate else { return true }
        return Date().timeIntervalSince(date) > 120
    }

    /// Whether the request is stale and should be auto-removed from pending.json.
    public var isStale: Bool {
        guard let date = parsedDate else { return true }
        return Date().timeIntervalSince(date) > Self.staleThreshold
    }

    /// Time elapsed since the request was created, human-readable.
    public var timeSinceRequest: String {
        guard let date = parsedDate else { return "?" }
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 5 { return "just now" }
        if seconds < 60 { return "\(seconds)s ago" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        return "\(hours)h ago"
    }
}

// MARK: - Pending File Top-Level Model

/// Maps to ~/.chief-of-agent/pending.json
public struct PendingFile: Codable, Equatable, Sendable {
    /// requestId → PendingRequest
    public let requests: [String: PendingRequest]

    public init(requests: [String: PendingRequest] = [:]) {
        self.requests = requests
    }
}
