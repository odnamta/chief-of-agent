import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("SessionStore Tests")
@MainActor
struct SessionStoreTests {

    @Test("Save and unsave round-trip")
    func saveUnsaveRoundTrip() throws {
        let store = SessionStore()

        store.save(sessionId: "test-id-1", project: "test-project", cwd: "/tmp/test", summary: "Testing")
        #expect(store.savedSessions.count == 1)
        #expect(store.isSaved("test-id-1") == true)
        #expect(store.isSaved("nonexistent") == false)

        store.unsave(sessionId: "test-id-1")
        #expect(store.savedSessions.count == 0)
        #expect(store.isSaved("test-id-1") == false)
    }

    @Test("No duplicate saves for same session")
    func noDuplicateSaves() throws {
        let store = SessionStore()

        store.save(sessionId: "test-id-2", project: "test", cwd: "/tmp", summary: nil)
        store.save(sessionId: "test-id-2", project: "test", cwd: "/tmp", summary: nil)
        #expect(store.savedSessions.count == 1)

        store.unsave(sessionId: "test-id-2")
    }

    @Test("History tracks up to maxHistory entries")
    func historyMaxEntries() throws {
        let store = SessionStore()

        // Add 25 entries (max is 20)
        for i in 0..<25 {
            store.addToHistory(
                sessionId: "hist-\(i)",
                project: "test",
                cwd: "/tmp",
                summary: "Entry \(i)"
            )
        }

        #expect(store.recentHistory.count == 20)
        // Most recent should be first
        #expect(store.recentHistory.first?.sessionId == "hist-24")
    }

    @Test("History doesn't duplicate entries")
    func historyNoDuplicates() throws {
        let store = SessionStore()

        store.addToHistory(sessionId: "hist-dup", project: "test", cwd: "/tmp", summary: nil)
        store.addToHistory(sessionId: "hist-dup", project: "test", cwd: "/tmp", summary: nil)
        #expect(store.recentHistory.filter { $0.sessionId == "hist-dup" }.count == 1)
    }
}
