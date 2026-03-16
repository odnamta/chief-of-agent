import SwiftUI
import UserNotifications
import ChiefOfAgentCore

@main
struct ChiefOfAgentApp: App {
    @StateObject private var stateWatcher = StateWatcher()
    @StateObject private var notificationManager = NotificationManager()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(stateWatcher: stateWatcher)
                .onAppear {
                    setupNotificationBridge()
                    stateWatcher.start()
                    notificationManager.requestPermission()
                }
        } label: {
            MenuBarLabel(attentionCount: stateWatcher.attentionCount)
        }
        .menuBarExtraStyle(.window)
    }

    private func setupNotificationBridge() {
        stateWatcher.onTransition = { [weak notificationManager] sessionId, session, from in
            Task { @MainActor in
                notificationManager?.notifyIfNeeded(sessionId: sessionId, session: session)
            }
        }
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
