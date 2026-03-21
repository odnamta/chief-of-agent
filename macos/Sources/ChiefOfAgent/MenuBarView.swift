import SwiftUI
import ChiefOfAgentCore

struct MenuBarView: View {
    @ObservedObject var stateWatcher: StateWatcher
    @ObservedObject var summaryManager: SummaryManager
    @State private var showSettings = false
    @State private var selectedIndex: Int? = nil

    var body: some View {
        VStack(spacing: 0) {
            // Header
            header

            Divider()

            // Pending actions (destructive, awaiting approval) — shown at top
            if !stateWatcher.pendingRequests.isEmpty {
                pendingSection
                Divider()
            }

            // Session list
            if stateWatcher.sessions.isEmpty {
                emptyState
            } else {
                sessionList
            }

            Divider()

            // Footer
            footer
        }
        .frame(width: 360)
        .background(KeyEventHandler(onKeyDown: handleKeyDown))
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("CHIEF OF AGENT")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)

            Spacer()

            // Show pending badge if any
            let pendingCount = stateWatcher.pendingRequests.count
            if pendingCount > 0 {
                Text("\(pendingCount) PENDING")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.orange, in: Capsule())
            }

            let count = stateWatcher.sessions.count
            Text("\(count) SESSION\(count == 1 ? "" : "S")")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Pending Actions Section

    private var pendingSection: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.orange)
                Text("PENDING APPROVAL")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(.orange)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 4)

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(stateWatcher.pendingRequests) { request in
                        PendingActionView(
                            request: request,
                            onApprove: {
                                stateWatcher.respondToPending(requestId: request.requestId, decision: "allow")
                            },
                            onDeny: {
                                stateWatcher.respondToPending(requestId: request.requestId, decision: "deny")
                            },
                            onDismiss: {
                                stateWatcher.dismissPending(requestId: request.requestId)
                            }
                        )
                    }
                }
                .padding(.bottom, 4)
            }
            .frame(maxHeight: 280)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "cpu")
                .font(.system(size: 24))
                .foregroundStyle(.tertiary)
            Text("No active sessions")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            Text("Start a Claude Code session to see it here")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Session List

    private var sessionList: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(stateWatcher.sortedSessions.enumerated()), id: \.element.id) { index, item in
                    SessionRowView(
                        sessionId: item.id,
                        session: item.session,
                        summary: summaryManager.summaries[item.id],
                        index: index,
                        isSelected: selectedIndex == index,
                        onTap: {
                            WarpActivator.activate()
                        }
                    )

                    if item.id != stateWatcher.sortedSessions.last?.id {
                        Divider()
                            .padding(.leading, 34)
                    }
                }
            }
        }
        .frame(maxHeight: 400)
    }

    // MARK: - Keyboard Navigation

    private func handleKeyDown(_ event: NSEvent) {
        let sessions = stateWatcher.sortedSessions
        guard !sessions.isEmpty else { return }

        switch Int(event.keyCode) {
        case 125: // Down arrow
            if let idx = selectedIndex {
                selectedIndex = min(idx + 1, sessions.count - 1)
            } else {
                selectedIndex = 0
            }
        case 126: // Up arrow
            if let idx = selectedIndex {
                selectedIndex = max(idx - 1, 0)
            } else {
                selectedIndex = sessions.count - 1
            }
        case 36: // Enter/Return — activate selected session
            if selectedIndex != nil {
                WarpActivator.activate()
            }
        case 53: // Escape — close popover
            selectedIndex = nil
            // Close the menu bar panel
            for window in NSApp.windows {
                if let panel = window as? NSPanel, panel.styleMask.contains(.nonactivatingPanel) {
                    panel.orderOut(nil)
                    return
                }
            }
        default:
            // Cmd+1-9 to jump to session by index
            if event.modifierFlags.contains(.command) {
                let chars = event.charactersIgnoringModifiers ?? ""
                if let digit = chars.first?.wholeNumberValue, digit >= 1, digit <= 9 {
                    let idx = digit - 1
                    if idx < sessions.count {
                        selectedIndex = idx
                        WarpActivator.activate()
                    }
                }
            }
        }
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    showSettings.toggle()
                } label: {
                    Image(systemName: "gear")
                        .font(.system(size: 12))
                    Text("Settings")
                        .font(.system(size: 12))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .popover(isPresented: $showSettings) {
                    SettingsView()
                }

                Spacer()

                if stateWatcher.staleCount > 0 {
                    Button("Clean stale (\(stateWatcher.staleCount))") {
                        stateWatcher.removeStale()
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
                }

                Spacer()

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
                .buttonStyle(.plain)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Text("⌃⌘. to toggle")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.quaternary)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 4)
        }
    }
}
