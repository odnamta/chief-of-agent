import SwiftUI

struct SettingsView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Settings")
                .font(.headline)
            Text("Coming soon")
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(width: 250)
    }
}
