import SwiftUI
import AppKit

/// NSViewRepresentable that captures key events in a SwiftUI view hierarchy.
/// Used to add keyboard navigation to the MenuBarExtra panel.
struct KeyEventHandler: NSViewRepresentable {
    let onKeyDown: (NSEvent) -> Void

    func makeNSView(context: Context) -> KeyCaptureView {
        let view = KeyCaptureView()
        view.onKeyDown = onKeyDown
        // Must accept first responder to receive key events
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: KeyCaptureView, context: Context) {
        nsView.onKeyDown = onKeyDown
    }
}

/// NSView subclass that can become first responder and forward key events.
final class KeyCaptureView: NSView {
    var onKeyDown: ((NSEvent) -> Void)?

    override var acceptsFirstResponder: Bool { true }

    override func keyDown(with event: NSEvent) {
        onKeyDown?(event)
    }

    // Suppress the system beep for unhandled keys
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        // Let Cmd+1-9 through to our handler
        if event.modifierFlags.contains(.command) {
            let chars = event.charactersIgnoringModifiers ?? ""
            if let digit = chars.first?.wholeNumberValue, digit >= 1, digit <= 9 {
                onKeyDown?(event)
                return true
            }
        }
        return super.performKeyEquivalent(with: event)
    }
}
