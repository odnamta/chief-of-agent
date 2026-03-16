import SwiftUI
import ChiefOfAgentCore

struct MenuBarView: View {
    @ObservedObject var stateWatcher: StateWatcher

    var body: some View {
        Text("Chief of Agent")
            .padding()
    }
}
