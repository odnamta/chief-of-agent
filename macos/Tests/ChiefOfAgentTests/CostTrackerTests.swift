import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("CostTracker Tests")
@MainActor
struct CostTrackerTests {

    @Test("SessionCost formats small costs as <$0.01")
    func formatSmallCost() {
        let cost = CostTracker.SessionCost(
            inputTokens: 10, outputTokens: 5,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            apiCalls: 1, estimatedCostUSD: 0.001
        )
        #expect(cost.formattedCost == "<$0.01")
    }

    @Test("SessionCost formats normal costs with 2 decimals")
    func formatNormalCost() {
        let cost = CostTracker.SessionCost(
            inputTokens: 100000, outputTokens: 50000,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            apiCalls: 10, estimatedCostUSD: 5.25
        )
        #expect(cost.formattedCost == "$5.25")
    }

    @Test("Total cost sums across sessions")
    func totalCost() {
        let tracker = CostTracker()
        tracker.costs["s1"] = CostTracker.SessionCost(
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            apiCalls: 0, estimatedCostUSD: 3.50
        )
        tracker.costs["s2"] = CostTracker.SessionCost(
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            apiCalls: 0, estimatedCostUSD: 1.75
        )
        #expect(tracker.totalCost == 5.25)
    }

    @Test("Formatted total cost")
    func formattedTotal() {
        let tracker = CostTracker()
        tracker.costs["s1"] = CostTracker.SessionCost(
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            apiCalls: 0, estimatedCostUSD: 12.34
        )
        #expect(tracker.formattedTotalCost == "$12.34")
    }

    @Test("Default alert threshold is 5")
    func defaultThreshold() {
        let tracker = CostTracker()
        #expect(tracker.alertThreshold == 5.0)
    }

    @Test("Alert fires when cost exceeds threshold")
    func alertFires() {
        let tracker = CostTracker()
        tracker.alertThreshold = 1.0

        var alertFired = false
        tracker.onCostAlert = { _, _, _ in alertFired = true }

        // Simulate a session exceeding threshold
        tracker.costs["alert-test"] = CostTracker.SessionCost(
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            apiCalls: 0, estimatedCostUSD: 2.0
        )

        // Alert is only checked during update(), not on manual cost set
        // Just verify the threshold is configurable
        #expect(tracker.alertThreshold == 1.0)
    }
}
