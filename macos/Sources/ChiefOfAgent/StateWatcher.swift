import Foundation
import Combine

@MainActor
class StateWatcher: ObservableObject {
    @Published var sessions: [String: SessionData] = [:]
    @Published var attentionCount: Int = 0
}
