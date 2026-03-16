import SwiftUI

// MARK: - Session Status Enum

public enum SessionStatus: String, Codable, Equatable, Sendable {
    case working
    case waiting
    case error
    case idle
    case done

    public var color: Color {
        switch self {
        case .working: return .green
        case .waiting: return .yellow
        case .error:   return .red
        case .idle:    return .gray
        case .done:    return .green.opacity(0.6)
        }
    }

    public var symbol: String {
        switch self {
        case .working: return "circle.fill"
        case .waiting: return "circle.fill"
        case .error:   return "exclamationmark.circle.fill"
        case .idle:    return "circle"
        case .done:    return "checkmark.circle.fill"
        }
    }

    public var isAttentionNeeded: Bool {
        self == .waiting || self == .error
    }

    public var displayText: String {
        switch self {
        case .working: return "Working"
        case .waiting: return "Waiting"
        case .error:   return "Error"
        case .idle:    return "Idle"
        case .done:    return "Done"
        }
    }
}

// MARK: - Session Data Model

public struct SessionData: Codable, Equatable, Sendable {
    public let project: String
    public let cwd: String
    public let status: SessionStatus
    public let started_at: String
    public let last_event: String
    public let last_event_at: String
    public let waiting_context: String?

    public init(
        project: String,
        cwd: String,
        status: SessionStatus,
        started_at: String,
        last_event: String,
        last_event_at: String,
        waiting_context: String? = nil
    ) {
        self.project = project
        self.cwd = cwd
        self.status = status
        self.started_at = started_at
        self.last_event = last_event
        self.last_event_at = last_event_at
        self.waiting_context = waiting_context
    }

    /// Time elapsed since last event, human-readable
    public var timeSinceLastEvent: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: last_event_at) else {
            let basic = ISO8601DateFormatter()
            guard let d = basic.date(from: last_event_at) else { return "?" }
            return Self.formatElapsed(since: d)
        }
        return Self.formatElapsed(since: date)
    }

    private static func formatElapsed(since date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 5 { return "just now" }
        if seconds < 60 { return "\(seconds)s ago" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        return "\(days)d ago"
    }
}

// MARK: - State File (top-level JSON)

public struct StateFile: Codable, Equatable, Sendable {
    public let sessions: [String: SessionData]

    public init(sessions: [String: SessionData] = [:]) {
        self.sessions = sessions
    }
}
