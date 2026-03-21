import Foundation
import UserNotifications
import AppKit

@MainActor
public class NotificationManager: NSObject, ObservableObject, UNUserNotificationCenterDelegate {

    private var hasPermission = false

    public override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - Permission

    public func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            Task { @MainActor in
                self.hasPermission = granted
                if let error = error {
                    print("[ChiefOfAgent] Notification permission error: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Fire Notification

    public func notifyIfNeeded(sessionId: String, session: SessionData) {
        guard hasPermission else { return }
        guard isNotificationEnabled() else { return }
        guard !isInQuietHours() else { return }

        let content = UNMutableNotificationContent()
        content.title = "Chief of Agent"

        switch session.status {
        case .waiting:
            content.subtitle = "\(session.project) needs approval"
        case .error:
            content.subtitle = "\(session.project) hit an error"
        default:
            return // Only notify for waiting/error
        }

        if let context = session.waiting_context {
            // Truncate long context for notification body
            content.body = String(context.prefix(200))
        }

        content.sound = .default
        content.threadIdentifier = "chief-of-agent"
        content.categoryIdentifier = "SESSION_ALERT"

        // Use session ID as identifier — replaces previous notification for same session
        let request = UNNotificationRequest(
            identifier: "coa-\(sessionId)",
            content: content,
            trigger: nil // Deliver immediately
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("[ChiefOfAgent] Failed to deliver notification: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Quiet Hours

    private func isInQuietHours() -> Bool {
        let config = loadConfig()
        guard let quietHours = config["quiet_hours"] as? [String: String],
              let startStr = quietHours["start"],
              let endStr = quietHours["end"] else {
            return false
        }

        let now = Date()
        let calendar = Calendar.current
        let currentMinutes = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)

        let startParts = startStr.split(separator: ":").compactMap { Int($0) }
        let endParts = endStr.split(separator: ":").compactMap { Int($0) }

        guard startParts.count == 2, endParts.count == 2 else { return false }

        let startMinutes = startParts[0] * 60 + startParts[1]
        let endMinutes = endParts[0] * 60 + endParts[1]

        if startMinutes <= endMinutes {
            // Same day range (e.g., 09:00 - 17:00)
            return currentMinutes >= startMinutes && currentMinutes < endMinutes
        } else {
            // Overnight range (e.g., 23:00 - 07:00)
            return currentMinutes >= startMinutes || currentMinutes < endMinutes
        }
    }

    private func isNotificationEnabled() -> Bool {
        let config = loadConfig()
        // Default to true if not set
        return (config["notification_enabled"] as? Bool) ?? true
    }

    private func loadConfig() -> [String: Any] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let configPath = "\(home)/.chief-of-agent/config.json"

        guard let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Called when user clicks a notification — activate the user's terminal
    nonisolated public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        Task { @MainActor in
            TerminalDetector.activate()
        }
        completionHandler()
    }

    /// Called when notification arrives while app is in foreground — still show it
    nonisolated public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
