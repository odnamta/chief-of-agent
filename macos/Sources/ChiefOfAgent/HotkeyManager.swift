import Carbon
import Cocoa

/// Registers a global hotkey (Ctrl+Cmd+.) using Carbon Events API.
/// On trigger, simulates a click on the menu bar status item to toggle the popover.
final class HotkeyManager {
    static let shared = HotkeyManager()

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandler: EventHandlerRef?

    private init() {}

    /// Register Ctrl+Cmd+. as global hotkey.
    func register() {
        // kVK_ANSI_Period = 0x2F
        let hotKeyID = EventHotKeyID(signature: fourCharCode("CoAg"), id: 1)
        let modifiers: UInt32 = UInt32(cmdKey | controlKey)

        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(
            UInt32(kVK_ANSI_Period),
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &ref
        )

        if status == noErr {
            hotKeyRef = ref
        } else {
            print("[HotkeyManager] Failed to register hotkey: \(status)")
        }

        // Install event handler for kEventHotKeyPressed
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let handler: EventHandlerUPP = { _, event, _ -> OSStatus in
            HotkeyManager.shared.handleHotKey()
            return noErr
        }

        InstallEventHandler(
            GetApplicationEventTarget(),
            handler,
            1,
            &eventType,
            nil,
            &eventHandler
        )
    }

    /// Unregister the global hotkey.
    func unregister() {
        if let ref = hotKeyRef {
            UnregisterEventHotKey(ref)
            hotKeyRef = nil
        }
        if let handler = eventHandler {
            RemoveEventHandler(handler)
            eventHandler = nil
        }
    }

    /// Toggle the menu bar popover by finding and toggling the MenuBarExtra panel.
    private func handleHotKey() {
        DispatchQueue.main.async {
            self.toggleStatusItem()
        }
    }

    /// Find the Chief of Agent status item and simulate a click to toggle the popover.
    private func toggleStatusItem() {
        // NSStatusBar doesn't expose items directly. We use accessibility to find ours.
        // Simpler approach: post a synthetic mouse event on the status item's button frame.
        //
        // The most reliable way with MenuBarExtra(.window) is to find the NSStatusItem
        // via the shared status bar, but Apple doesn't provide a public API for that.
        //
        // Best approach: use NSApp's windows to find the MenuBarExtra panel and toggle it.
        let panelClass = "NSStatusBarWindow"
        for window in NSApp.windows {
            let className = String(describing: type(of: window))
            if className == panelClass || className.contains("MenuBarExtra") || window.title.isEmpty && window.level.rawValue > NSWindow.Level.normal.rawValue {
                if window.isVisible {
                    window.orderOut(nil)
                } else {
                    window.makeKeyAndOrderFront(nil)
                    NSApp.activate(ignoringOtherApps: true)
                }
                return
            }
        }

        // Fallback: try to find the SwiftUI MenuBarExtra panel
        for window in NSApp.windows {
            // MenuBarExtra panels are typically NSPanel with specific characteristics
            if let panel = window as? NSPanel, panel.styleMask.contains(.nonactivatingPanel) {
                if panel.isVisible {
                    panel.orderOut(nil)
                } else {
                    panel.makeKeyAndOrderFront(nil)
                    NSApp.activate(ignoringOtherApps: true)
                }
                return
            }
        }
    }

    // MARK: - Helpers

    private func fourCharCode(_ string: String) -> OSType {
        var result: OSType = 0
        for char in string.utf8.prefix(4) {
            result = result << 8 + OSType(char)
        }
        return result
    }
}
