import AppKit

/// Detects which terminal app the user is running and provides
/// methods to activate it or open new tabs.
public enum TerminalApp: String, CaseIterable {
    case warp = "dev.warp.Warp-Stable"
    case iterm2 = "com.googlecode.iterm2"
    case terminal = "com.apple.Terminal"

    public var displayName: String {
        switch self {
        case .warp: return "Warp"
        case .iterm2: return "iTerm2"
        case .terminal: return "Terminal"
        }
    }
}

public enum TerminalDetector {

    /// Detect which terminal app is currently running, in preference order.
    /// Returns the first running terminal found, or .terminal as default.
    public static func detect() -> TerminalApp {
        let running = NSWorkspace.shared.runningApplications
        for app in TerminalApp.allCases {
            if running.contains(where: { $0.bundleIdentifier == app.rawValue }) {
                return app
            }
        }
        return .terminal
    }

    /// Activate (bring to foreground) the detected terminal app.
    public static func activate() {
        let app = detect()
        if let running = NSWorkspace.shared.runningApplications.first(where: {
            $0.bundleIdentifier == app.rawValue
        }) {
            running.activate()
        } else {
            // Terminal not running — launch it
            let config = NSWorkspace.OpenConfiguration()
            config.activates = true
            if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: app.rawValue) {
                NSWorkspace.shared.openApplication(at: url, configuration: config)
            }
        }
    }

    /// Open a new tab in the detected terminal and run a command.
    /// Returns the path to a temp script file (caller should clean up after delay).
    public static func openNewTab(command: String) {
        let app = detect()

        switch app {
        case .warp:
            // Warp: use `open -a Warp` with a script file
            runViaScript(command: command, appName: "Warp")

        case .iterm2:
            // iTerm2: use AppleScript to create new tab
            let script = """
            tell application "iTerm"
                activate
                tell current window
                    create tab with default profile
                    tell current session
                        write text \(appleScriptQuoted(command))
                    end tell
                end tell
            end tell
            """
            runAppleScript(script)

        case .terminal:
            // Terminal.app: use `do script` to open new tab
            runViaScript(command: command, appName: "Terminal")
        }
    }

    // MARK: - Helpers

    /// Run a command by writing a temp script and opening it with the specified app.
    /// Safe from injection — uses shell escaping.
    private static func runViaScript(command: String, appName: String) {
        let tmpDir = NSTemporaryDirectory()
        let scriptPath = "\(tmpDir)coa-\(UUID().uuidString).sh"
        let content = "#!/bin/bash\n\(command)\n"

        guard let data = content.data(using: .utf8),
              FileManager.default.createFile(atPath: scriptPath, contents: data) else {
            return
        }

        try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptPath)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", appName, scriptPath]
        try? process.run()

        // Clean up after 5s
        let pathToClean = scriptPath
        DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
            try? FileManager.default.removeItem(atPath: pathToClean)
        }
    }

    /// Escape a string for safe embedding in AppleScript.
    private static func appleScriptQuoted(_ s: String) -> String {
        let escaped = s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }

    private static func runAppleScript(_ script: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        try? process.run()
    }

    /// Shell-safe escaping using POSIX single-quote wrapping.
    public static func shellEscape(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
