import SwiftUI
import ChiefOfAgentCore

struct SessionRowView: View {
    let sessionId: String
    let session: SessionData
    var summary: String? = nil
    var index: Int = 0
    var isSelected: Bool = false
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    // Index badge (Cmd+N shortcut hint)
                    if index < 9 {
                        Text("⌘\(index + 1)")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.quaternary)
                            .frame(width: 22)
                    } else {
                        Spacer().frame(width: 22)
                    }

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

                // AI summary (what the agent is doing)
                if let summary = summary {
                    Text(summary)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .padding(.leading, 44) // align past index badge + status icon
                }

                // Waiting context (secondary text)
                if session.status.isAttentionNeeded, let context = session.waiting_context {
                    Text(context)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.leading, 44) // align past index badge + status icon
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(backgroundForState)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var backgroundForState: some ShapeStyle {
        if isSelected {
            return AnyShapeStyle(Color.accentColor.opacity(0.15))
        }
        switch session.status {
        case .waiting:
            return AnyShapeStyle(Color.yellow.opacity(0.08))
        case .error:
            return AnyShapeStyle(Color.red.opacity(0.08))
        default:
            return AnyShapeStyle(Color.clear)
        }
    }
}
