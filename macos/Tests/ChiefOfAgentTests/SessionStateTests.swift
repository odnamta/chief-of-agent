import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("SessionState Tests")
struct SessionStateTests {

    @Test("Decode full state file with multiple sessions")
    func decodeFullStateFile() throws {
        let json = """
        {
          "sessions": {
            "abc-123": {
              "project": "gis-erp",
              "cwd": "/path/to/project",
              "status": "working",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "SessionStart",
              "last_event_at": "2026-03-15T12:00:00.000Z"
            },
            "def-456": {
              "project": "secbot",
              "cwd": "/path/to/secbot",
              "status": "waiting",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Notification:permission_prompt",
              "last_event_at": "2026-03-15T12:01:00.000Z",
              "waiting_context": "Bash: git push origin main"
            }
          }
        }
        """.data(using: .utf8)!

        let stateFile = try JSONDecoder().decode(StateFile.self, from: json)

        #expect(stateFile.sessions.count == 2)

        let gis = try #require(stateFile.sessions["abc-123"])
        #expect(gis.project == "gis-erp")
        #expect(gis.status == .working)
        #expect(gis.waiting_context == nil)
        #expect(!gis.status.isAttentionNeeded)

        let secbot = try #require(stateFile.sessions["def-456"])
        #expect(secbot.project == "secbot")
        #expect(secbot.status == .waiting)
        #expect(secbot.waiting_context == "Bash: git push origin main")
        #expect(secbot.status.isAttentionNeeded)
    }

    @Test("Decode all status values", arguments: [
        ("working", SessionStatus.working),
        ("waiting", SessionStatus.waiting),
        ("error", SessionStatus.error),
        ("idle", SessionStatus.idle),
        ("done", SessionStatus.done),
    ])
    func decodeAllStatuses(raw: String, expected: SessionStatus) throws {
        let json = """
        {
          "sessions": {
            "test-id": {
              "project": "test",
              "cwd": "/tmp",
              "status": "\(raw)",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:00:00.000Z"
            }
          }
        }
        """.data(using: .utf8)!

        let stateFile = try JSONDecoder().decode(StateFile.self, from: json)
        let session = try #require(stateFile.sessions["test-id"])
        #expect(session.status == expected)
    }

    @Test("Optional waiting_context is nil when missing")
    func decodeWithOptionalWaitingContextMissing() throws {
        let json = """
        {
          "sessions": {
            "id-1": {
              "project": "test",
              "cwd": "/tmp",
              "status": "working",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "SessionStart",
              "last_event_at": "2026-03-15T12:00:00.000Z"
            }
          }
        }
        """.data(using: .utf8)!

        let stateFile = try JSONDecoder().decode(StateFile.self, from: json)
        let session = try #require(stateFile.sessions["id-1"])
        #expect(session.waiting_context == nil)
    }

    @Test("Empty sessions decodes successfully")
    func decodeEmptySessions() throws {
        let json = """
        { "sessions": {} }
        """.data(using: .utf8)!

        let stateFile = try JSONDecoder().decode(StateFile.self, from: json)
        #expect(stateFile.sessions.isEmpty)
    }

    @Test("isAttentionNeeded is true only for waiting and error")
    func attentionNeeded() {
        #expect(SessionStatus.waiting.isAttentionNeeded)
        #expect(SessionStatus.error.isAttentionNeeded)
        #expect(!SessionStatus.working.isAttentionNeeded)
        #expect(!SessionStatus.idle.isAttentionNeeded)
        #expect(!SessionStatus.done.isAttentionNeeded)
    }
}
