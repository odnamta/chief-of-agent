import SwiftUI
import ChiefOfAgentCore

struct SessionRowView: View {
    let sessionId: String
    let session: SessionData
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    // Status indicator
                    Image(systemName: session.status.symbol)
                        .foregroundStyle(session.status.color)
                        .font(.system(size: 10))
                        .frame(width: 14)

                    // Project name
                    Text(session.project)
                        .fontWeight(.semibold)
                        .font(.system(size: 13))
                        .lineLimit(1)

                    Spacer()

                    // Status + time
                    Text(session.status.displayText)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)

                    Text(session.timeSinceLastEvent)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }

                // Waiting context (secondary text)
                if session.status.isAttentionNeeded, let context = session.waiting_context {
                    Text(context)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.leading, 22) // align with project name
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(backgroundForStatus(session.status))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func backgroundForStatus(_ status: SessionStatus) -> some ShapeStyle {
        switch status {
        case .waiting:
            return AnyShapeStyle(Color.yellow.opacity(0.08))
        case .error:
            return AnyShapeStyle(Color.red.opacity(0.08))
        default:
            return AnyShapeStyle(Color.clear)
        }
    }
}
