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

    /// Time elapsed since the request was created, human-readable.
    public var timeSinceRequest: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date: Date? = formatter.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
        guard let date else { return "?" }
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 5 { return "just now" }
        if seconds < 60 { return "\(seconds)s ago" }
        let minutes = seconds / 60
        return "\(minutes)m ago"
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
