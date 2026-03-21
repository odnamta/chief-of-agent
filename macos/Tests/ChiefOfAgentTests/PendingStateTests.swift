import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("PendingState Tests")
struct PendingStateTests {

    @Test("Decode pending request from JSON")
    func decodePendingRequest() throws {
        let json = """
        {
          "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "sessionId": "sess-001",
          "project": "gis-erp",
          "tool": "Bash",
          "detail": "rm -rf node_modules",
          "timestamp": "2026-03-21T12:00:00Z",
          "rule": "destructive_bash"
        }
        """
        let data = json.data(using: .utf8)!
        let request = try JSONDecoder().decode(PendingRequest.self, from: data)

        #expect(request.requestId == "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
        #expect(request.tool == "Bash")
        #expect(request.detail == "rm -rf node_modules")
        #expect(request.rule == "destructive_bash")
    }

    @Test("isStale returns true for old timestamps")
    func isStaleOldTimestamp() throws {
        let oldDate = Date().addingTimeInterval(-6 * 60) // 6 minutes ago
        let formatter = ISO8601DateFormatter()
        let request = PendingRequest(
            requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            sessionId: "s1",
            project: "test",
            tool: "Bash",
            detail: "test",
            timestamp: formatter.string(from: oldDate),
            rule: "test"
        )
        #expect(request.isStale == true)
    }

    @Test("isStale returns false for recent timestamps")
    func isStaleRecentTimestamp() throws {
        let recentDate = Date().addingTimeInterval(-30) // 30 seconds ago
        let formatter = ISO8601DateFormatter()
        let request = PendingRequest(
            requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            sessionId: "s1",
            project: "test",
            tool: "Bash",
            detail: "test",
            timestamp: formatter.string(from: recentDate),
            rule: "test"
        )
        #expect(request.isStale == false)
    }

    @Test("isLikelyExpired returns true after 120s")
    func isLikelyExpiredAfterTimeout() throws {
        let oldDate = Date().addingTimeInterval(-130) // 130 seconds ago
        let formatter = ISO8601DateFormatter()
        let request = PendingRequest(
            requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            sessionId: "s1",
            project: "test",
            tool: "Bash",
            detail: "test",
            timestamp: formatter.string(from: oldDate),
            rule: "test"
        )
        #expect(request.isLikelyExpired == true)
    }

    @Test("isLikelyExpired returns false for recent request")
    func isLikelyExpiredRecent() throws {
        let recentDate = Date().addingTimeInterval(-10) // 10 seconds ago
        let formatter = ISO8601DateFormatter()
        let request = PendingRequest(
            requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            sessionId: "s1",
            project: "test",
            tool: "Bash",
            detail: "test",
            timestamp: formatter.string(from: recentDate),
            rule: "test"
        )
        #expect(request.isLikelyExpired == false)
    }

    @Test("timeSinceRequest returns human-readable string")
    func timeSinceRequest() throws {
        let date = Date().addingTimeInterval(-90) // 90 seconds ago
        let formatter = ISO8601DateFormatter()
        let request = PendingRequest(
            requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            sessionId: "s1",
            project: "test",
            tool: "Bash",
            detail: "test",
            timestamp: formatter.string(from: date),
            rule: "test"
        )
        let elapsed = request.timeSinceRequest
        #expect(elapsed.contains("m ago") || elapsed.contains("s ago"))
    }
}
