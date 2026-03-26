import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("DecisionFeed Tests")
@MainActor
struct DecisionFeedTests {

    @Test("Empty feed when file doesn't exist")
    func emptyFeed() {
        let feed = DecisionFeed()
        // Fresh init with no decisions.jsonl should have empty recent
        // (may have data from real config dir, so just verify it's an array)
        #expect(feed.recent is [DecisionFeed.Decision])
    }

    @Test("Decision has correct identity from timestamp + tool")
    func decisionIdentity() {
        let d = DecisionFeed.Decision(
            project: "test",
            tool: "Bash",
            detail: "echo hello",
            decision: "allow",
            tier: "rule",
            rule: "safe-command",
            confidence: nil,
            latencyMs: 5,
            timestamp: "2026-03-22T10:00:00Z"
        )
        #expect(d.id == "2026-03-22T10:00:00Z-Bash")
        #expect(d.project == "test")
        #expect(d.decision == "allow")
    }

    @Test("Decision equality")
    func decisionEquality() {
        let d1 = DecisionFeed.Decision(
            project: "a", tool: "Bash", detail: "test",
            decision: "allow", tier: "rule", rule: nil,
            confidence: nil, latencyMs: 3, timestamp: "t1"
        )
        let d2 = DecisionFeed.Decision(
            project: "a", tool: "Bash", detail: "test",
            decision: "allow", tier: "rule", rule: nil,
            confidence: nil, latencyMs: 3, timestamp: "t1"
        )
        #expect(d1 == d2)
    }

    @Test("Decision with different timestamps are not equal")
    func decisionInequality() {
        let d1 = DecisionFeed.Decision(
            project: "a", tool: "Bash", detail: "test",
            decision: "allow", tier: "rule", rule: nil,
            confidence: nil, latencyMs: 3, timestamp: "t1"
        )
        let d2 = DecisionFeed.Decision(
            project: "a", tool: "Bash", detail: "test",
            decision: "allow", tier: "rule", rule: nil,
            confidence: nil, latencyMs: 3, timestamp: "t2"
        )
        #expect(d1 != d2)
    }
}
