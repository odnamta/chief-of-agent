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
    @StateObject private var decisionFeed: DecisionFeed
    @StateObject private var costTracker: CostTracker

    init() {
        // Duplicate launch detection — if another instance is running, activate it and quit
        let bundleId = Bundle.main.bundleIdentifier ?? "dev.chiefofagent.ChiefOfAgent"
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        if running.count > 1 {
            if let existing = running.first(where: { $0 != NSRunningApplication.current }) {
                existing.activate()
            }
            // Delay termination slightly so SwiftUI can finish init
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }

        let watcher = StateWatcher()
        let notifier = NotificationManager()
        let summarizer = SummaryManager()
        let store = SessionStore()
        let server = HookServer()
        let decisions = DecisionFeed()
        let costs = CostTracker()

        watcher.onTransition = { sessionId, session, from in
            Task { @MainActor in
                notifier.notifyIfNeeded(sessionId: sessionId, session: session)
            }
        }

        // Track closed sessions in history
        watcher.onSessionRemoved = { sessionId, session in
            Task { @MainActor in
                store.addToHistory(
                    sessionId: sessionId,
                    project: session.project,
                    cwd: session.cwd,
                    summary: summarizer.summaries[sessionId]
                )
            }
        }

        // Trigger summary refresh + decision feed + cost tracking when sessions change
        watcher.onSessionsChanged = { sessions in
            Task { @MainActor in
                summarizer.refreshIfNeeded(sessions: sessions)
                decisions.poll()
                costs.update(sessions: sessions)
            }
        }

        // Hook server receives Claude Code hook events over HTTP.
        // For PreToolUse: creates a pending request in the menu bar,
        // blocks the NW thread until user approves/denies, returns decision.
        server.onHookEvent = { event in
            let hookEvent = event["hookEvent"] as? String ?? ""
            let sessionId = event["sessionId"] as? String ?? ""
            print("[HookServer] Received \(hookEvent) for session \(String(sessionId.prefix(8)))...")

            // Only PreToolUse events need permission decisions
            guard hookEvent == "PreToolUse" else {
                return [:] as [String: Any]
            }

            // Create pending request in the UI (runs on MainActor via onHookEvent)
            let requestId = watcher.addHTTPPending(event: event)
            guard let requestId = requestId else {
                return ["permissionDecision": "ask"] as [String: Any]
            }

            // Return special marker — HookServer will call waitForHTTPDecision on NW thread
            return ["__waitForDecision": requestId] as [String: Any]
        }

        // Wait handler runs on NW background thread — blocks until user decides
        server.onWaitForDecision = { requestId, timeout in
            watcher.waitForHTTPDecision(requestId: requestId, timeout: timeout)
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
        _decisionFeed = StateObject(wrappedValue: decisions)
        _costTracker = StateObject(wrappedValue: costs)
    }

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(stateWatcher: stateWatcher, summaryManager: summaryManager, sessionStore: sessionStore, decisionFeed: decisionFeed, costTracker: costTracker, hookServerRunning: hookServer.isRunning)
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
