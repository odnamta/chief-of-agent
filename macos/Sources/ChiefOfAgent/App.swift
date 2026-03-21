import SwiftUI
import UserNotifications
import ChiefOfAgentCore

@main
struct ChiefOfAgentApp: App {
    @StateObject private var stateWatcher: StateWatcher
    @StateObject private var notificationManager: NotificationManager
    @StateObject private var summaryManager: SummaryManager
    @StateObject private var sessionStore: SessionStore
    @StateObject private var hookServer: HookServer

    init() {
        let watcher = StateWatcher()
        let notifier = NotificationManager()
        let summarizer = SummaryManager()
        let store = SessionStore()
        let server = HookServer()

        watcher.onTransition = { sessionId, session, from in
            Task { @MainActor in
                notifier.notifyIfNeeded(sessionId: sessionId, session: session)
            }
        }

        // Trigger summary refresh when sessions change
        watcher.onSessionsChanged = { sessions in
            Task { @MainActor in
                summarizer.refreshIfNeeded(sessions: sessions)
            }
        }

        // Hook server receives events directly from Claude Code over HTTP
        server.onHookEvent = { event in
            // For now, pass through to file-based state management
            // The CLI hooks will write to state.json as before
            // This server provides a fast path for future direct event handling
            let hookEvent = event["hookEvent"] as? String ?? ""
            let sessionId = event["sessionId"] as? String ?? ""
            print("[HookServer] Received \(hookEvent) for session \(sessionId.prefix(8))...")
            return ["permissionDecision": "ask"] as [String: Any]
        }

        watcher.start()
        summarizer.start()
        server.start()
        notifier.requestPermission()
        HotkeyManager.shared.register()

        _stateWatcher = StateObject(wrappedValue: watcher)
        _notificationManager = StateObject(wrappedValue: notifier)
        _summaryManager = StateObject(wrappedValue: summarizer)
        _sessionStore = StateObject(wrappedValue: store)
        _hookServer = StateObject(wrappedValue: server)
    }

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(stateWatcher: stateWatcher, summaryManager: summaryManager, sessionStore: sessionStore, hookServerRunning: hookServer.isRunning)
        } label: {
            let pendingCount = stateWatcher.pendingRequests.count
            let attentionCount = stateWatcher.attentionCount
            if pendingCount > 0 {
                // Pending actions trump everything — use orange triangle
                Label("\(pendingCount)", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            } else if attentionCount > 0 {
                Label("\(attentionCount)", systemImage: "exclamationmark.circle.fill")
            } else {
                Label("", systemImage: "cpu")
            }
        }
        .menuBarExtraStyle(.window)
    }
}

struct MenuBarLabel: View {
    let attentionCount: Int

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "cpu")
            if attentionCount > 0 {
                Text("\(attentionCount)")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Color.red, in: Capsule())
            }
        }
    }
}
