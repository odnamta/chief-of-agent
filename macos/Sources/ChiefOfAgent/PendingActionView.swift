import SwiftUI
import ChiefOfAgentCore

/// A card showing a single pending destructive action with Approve/Deny buttons.
struct PendingActionView: View {
    let request: PendingRequest
    let onApprove: () -> Void
    let onDeny: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Top row: tool badge + project + age
            HStack(spacing: 6) {
                // Tool badge
                Text(request.tool.uppercased())
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color.red.opacity(0.85), in: RoundedRectangle(cornerRadius: 3))

                // Project name
                Text(request.project)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)

                Spacer()

                // Age
                Text(request.timeSinceRequest)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }

            // Rule label
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(.orange)
                Text("Matched rule: \(request.rule)")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            // Command detail
            Text(request.detail)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.primary)
                .lineLimit(3)
                .padding(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 4))

            // Action buttons
            HStack(spacing: 8) {
                Spacer()

                Button(action: onDeny) {
                    Label("Deny", systemImage: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.red)
                }
                .buttonStyle(PendingButtonStyle(color: .red))
                .keyboardShortcut(.escape, modifiers: [])

                Button(action: onApprove) {
                    Label("Approve", systemImage: "checkmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.green)
                }
                .buttonStyle(PendingButtonStyle(color: .green))
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.orange.opacity(0.07))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(Color.orange.opacity(0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
    }
}

// MARK: - Button Style

private struct PendingButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(color.opacity(configuration.isPressed ? 0.2 : 0.1))
            )
    }
}
