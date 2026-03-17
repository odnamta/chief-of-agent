import SwiftUI
import UserNotifications
import ChiefOfAgentCore

@main
struct ChiefOfAgentApp: App {
    @StateObject private var stateWatcher: StateWatcher
    @StateObject private var notificationManager: NotificationManager

    init() {
        let watcher = StateWatcher()
        let notifier = NotificationManager()

        watcher.onTransition = { sessionId, session, from in
            Task { @MainActor in
                notifier.notifyIfNeeded(sessionId: sessionId, session: session)
            }
        }

        watcher.start()
        notifier.requestPermission()

        _stateWatcher = StateObject(wrappedValue: watcher)
        _notificationManager = StateObject(wrappedValue: notifier)
    }

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(stateWatcher: stateWatcher)
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
