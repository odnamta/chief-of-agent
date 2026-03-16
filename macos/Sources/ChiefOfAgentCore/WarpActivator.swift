import AppKit

public enum WarpActivator {
    /// Bring Warp to the foreground.
    /// Stub — implemented in Task 5.
    public static func activate() {
        NSWorkspace.shared.open(URL(string: "warp://")!)
    }
}
