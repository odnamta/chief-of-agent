import Foundation

struct SessionData: Codable, Equatable {
    let project: String
    let cwd: String
    let status: String
    let started_at: String
    let last_event: String
    let last_event_at: String
    let waiting_context: String?
}

struct StateFile: Codable, Equatable {
    let sessions: [String: SessionData]
}
