import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("StateWatcher Tests")
struct StateWatcherTests {

    private func makeTmpDir() -> (dir: URL, path: String) {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("chief-of-agent-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let path = dir.appendingPathComponent("state.json").path
        return (dir, path)
    }

    private func writeState(_ json: String, to path: String) {
        try! json.data(using: .utf8)!.write(to: URL(fileURLWithPath: path))
    }

    @Test("Poll reads sessions from file")
    @MainActor
    func pollReadsSessionsFromFile() {
        let (dir, path) = makeTmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let json = """
        {
          "sessions": {
            "s1": {
              "project": "test-project",
              "cwd": "/tmp",
              "status": "working",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "SessionStart",
              "last_event_at": "2026-03-15T12:00:00.000Z"
            }
          }
        }
        """
        writeState(json, to: path)

        let watcher = StateWatcher(stateFilePath: path)
        watcher.poll()

        #expect(watcher.sessions.count == 1)
        #expect(watcher.sessions["s1"]?.project == "test-project")
        #expect(watcher.sessions["s1"]?.status == .working)
        #expect(watcher.attentionCount == 0)
    }

    @Test("Attention count tracks waiting and error sessions")
    @MainActor
    func attentionCountTracksWaitingAndError() {
        let (dir, path) = makeTmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let json = """
        {
          "sessions": {
            "s1": {
              "project": "a",
              "cwd": "/tmp",
              "status": "waiting",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:00:00.000Z",
              "waiting_context": "needs approval"
            },
            "s2": {
              "project": "b",
              "cwd": "/tmp",
              "status": "error",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:00:00.000Z",
              "waiting_context": "something broke"
            },
            "s3": {
              "project": "c",
              "cwd": "/tmp",
              "status": "working",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:00:00.000Z"
            }
          }
        }
        """
        writeState(json, to: path)

        let watcher = StateWatcher(stateFilePath: path)
        watcher.poll()

        #expect(watcher.attentionCount == 2)
    }

    @Test("Transition fires when status changes to waiting")
    @MainActor
    func transitionDetection() {
        let (dir, path) = makeTmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let json1 = """
        {
          "sessions": {
            "s1": {
              "project": "test",
              "cwd": "/tmp",
              "status": "working",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "SessionStart",
              "last_event_at": "2026-03-15T12:00:00.000Z"
            }
          }
        }
        """
        writeState(json1, to: path)

        let watcher = StateWatcher(stateFilePath: path)

        var transitionFired = false
        var transitionSessionId: String?
        var transitionFromStatus: SessionStatus?

        watcher.onTransition = { id, _, from in
            transitionFired = true
            transitionSessionId = id
            transitionFromStatus = from
        }

        watcher.poll()
        #expect(!transitionFired, "No transition on first poll for working status")

        let json2 = """
        {
          "sessions": {
            "s1": {
              "project": "test",
              "cwd": "/tmp",
              "status": "waiting",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Notification:permission_prompt",
              "last_event_at": "2026-03-15T12:01:00.000Z",
              "waiting_context": "Bash: git push"
            }
          }
        }
        """
        Thread.sleep(forTimeInterval: 0.01)
        writeState(json2, to: path)
        watcher.poll()

        #expect(transitionFired, "Transition should fire when status changes to waiting")
        #expect(transitionSessionId == "s1")
        #expect(transitionFromStatus == .working)
    }

    @Test("No duplicate transition when already in waiting state")
    @MainActor
    func noTransitionWhenAlreadyWaiting() {
        let (dir, path) = makeTmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let json = """
        {
          "sessions": {
            "s1": {
              "project": "test",
              "cwd": "/tmp",
              "status": "waiting",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:00:00.000Z",
              "waiting_context": "test"
            }
          }
        }
        """
        writeState(json, to: path)

        let watcher = StateWatcher(stateFilePath: path)
        var transitionCount = 0
        watcher.onTransition = { _, _, _ in transitionCount += 1 }

        watcher.poll() // First poll: new session in waiting -> fires
        #expect(transitionCount == 1)

        Thread.sleep(forTimeInterval: 0.01)
        writeState(json, to: path)
        watcher.poll()

        #expect(transitionCount == 1, "Should not re-fire when status hasn't changed")
    }

    @Test("Missing file returns empty sessions")
    @MainActor
    func missingFileReturnsEmptySessions() {
        let watcher = StateWatcher(stateFilePath: "/tmp/nonexistent-\(UUID().uuidString).json")
        watcher.poll()

        #expect(watcher.sessions.isEmpty)
        #expect(watcher.attentionCount == 0)
    }

    @Test("Sorted sessions orders attention-needed first")
    @MainActor
    func sortedSessionsOrdersAttentionFirst() {
        let (dir, path) = makeTmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let json = """
        {
          "sessions": {
            "s1": {
              "project": "alpha",
              "cwd": "/tmp",
              "status": "working",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:05:00.000Z"
            },
            "s2": {
              "project": "beta",
              "cwd": "/tmp",
              "status": "waiting",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:01:00.000Z",
              "waiting_context": "needs approval"
            },
            "s3": {
              "project": "gamma",
              "cwd": "/tmp",
              "status": "error",
              "started_at": "2026-03-15T12:00:00.000Z",
              "last_event": "Test",
              "last_event_at": "2026-03-15T12:03:00.000Z",
              "waiting_context": "broke"
            }
          }
        }
        """
        writeState(json, to: path)

        let watcher = StateWatcher(stateFilePath: path)
        watcher.poll()

        let sorted = watcher.sortedSessions

        // First two should be attention-needed (error + waiting), sorted by last_event_at desc
        #expect(sorted[0].session.status.isAttentionNeeded)
        #expect(sorted[1].session.status.isAttentionNeeded)
        #expect(!sorted[2].session.status.isAttentionNeeded)

        // Among attention-needed: gamma (12:03) before beta (12:01)
        #expect(sorted[0].session.project == "gamma")
        #expect(sorted[1].session.project == "beta")
        #expect(sorted[2].session.project == "alpha")
    }
}
