import AppKit

public enum WarpActivator {

    /// Bring Warp to the foreground.
    /// Tries the running application first (fastest), then falls back to URL scheme,
    /// then to launch by bundle identifier.
    public static func activate() {
        // Try to find Warp in running applications first
        if let warpApp = NSWorkspace.shared.runningApplications.first(where: {
            $0.bundleIdentifier == "dev.warp.Warp-Stable"
        }) {
            warpApp.activate()
            return
        }

        // Fallback: try URL scheme
        if let url = URL(string: "warp://") {
            NSWorkspace.shared.open(url)
            return
        }

        // Last resort: open by bundle ID
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        if let warpURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "dev.warp.Warp-Stable") {
            NSWorkspace.shared.openApplication(at: warpURL, configuration: config)
        }
    }
}
