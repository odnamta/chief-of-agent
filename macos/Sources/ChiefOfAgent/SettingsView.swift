import SwiftUI
import ServiceManagement

struct SettingsView: View {
    @State private var launchAtLogin = false
    @State private var quietHoursEnabled = true
    @State private var quietStart = "23:00"
    @State private var quietEnd = "07:00"
    @State private var notificationsEnabled = true

    private let configPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.chief-of-agent/config.json"
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Title
            Text("Settings")
                .font(.system(size: 14, weight: .bold))

            Divider()

            // Launch at Login
            Toggle("Launch at login", isOn: $launchAtLogin)
                .font(.system(size: 13))
                .onChange(of: launchAtLogin) { _, newValue in
                    setLaunchAtLogin(newValue)
                }

            // Notifications
            Toggle("Banner notifications", isOn: $notificationsEnabled)
                .font(.system(size: 13))
                .onChange(of: notificationsEnabled) { _, _ in
                    saveConfig()
                }

            Divider()

            // Quiet Hours
            VStack(alignment: .leading, spacing: 8) {
                Toggle("Quiet hours", isOn: $quietHoursEnabled)
                    .font(.system(size: 13))
                    .onChange(of: quietHoursEnabled) { _, _ in
                        saveConfig()
                    }

                if quietHoursEnabled {
                    HStack(spacing: 8) {
                        Text("From")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        TextField("23:00", text: $quietStart)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(width: 60)
                            .onSubmit { saveConfig() }

                        Text("to")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        TextField("07:00", text: $quietEnd)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(width: 60)
                            .onSubmit { saveConfig() }
                    }
                    .padding(.leading, 20)
                }
            }

            Divider()

            // Version
            Text("Chief of Agent v0.2.0")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .frame(width: 280)
        .onAppear { loadConfig() }
    }

    // MARK: - Launch at Login

    private func setLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            print("[ChiefOfAgent] Launch at login error: \(error.localizedDescription)")
        }
    }

    private func checkLaunchAtLogin() -> Bool {
        return SMAppService.mainApp.status == .enabled
    }

    // MARK: - Config Persistence

    private func loadConfig() {
        launchAtLogin = checkLaunchAtLogin()

        guard let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        if let enabled = json["notification_enabled"] as? Bool {
            notificationsEnabled = enabled
        }

        if let qh = json["quiet_hours"] as? [String: String] {
            quietHoursEnabled = true
            quietStart = qh["start"] ?? "23:00"
            quietEnd = qh["end"] ?? "07:00"
        } else {
            quietHoursEnabled = false
        }
    }

    private func saveConfig() {
        // Read existing config to preserve other fields
        var config: [String: Any] = [:]
        if let data = FileManager.default.contents(atPath: configPath),
           let existing = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            config = existing
        }

        config["notification_enabled"] = notificationsEnabled

        if quietHoursEnabled {
            config["quiet_hours"] = ["start": quietStart, "end": quietEnd]
        } else {
            config.removeValue(forKey: "quiet_hours")
        }

        // Write atomically
        if let data = try? JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys]) {
            let configDir = (configPath as NSString).deletingLastPathComponent
            try? FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)
            let tmpPath = configPath + ".tmp"
            try? data.write(to: URL(fileURLWithPath: tmpPath))
            try? FileManager.default.moveItem(atPath: tmpPath, toPath: configPath)
        }
    }
}
