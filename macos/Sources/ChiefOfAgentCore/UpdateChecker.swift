import Foundation

/// Checks GitHub releases for newer versions of Chief of Agent.
/// Caches the result to avoid hammering the API.
@MainActor
public class UpdateChecker: ObservableObject {

    public static let currentVersion = "0.3.0"

    @Published public var latestVersion: String?
    @Published public var updateAvailable = false
    @Published public var releaseURL: String?

    private let repoOwner = "odnamta"
    private let repoName = "chief-of-agent"
    private let checkInterval: TimeInterval = 6 * 60 * 60 // 6 hours
    private var lastCheck: Date?

    public init() {}

    /// Check for updates (respects check interval to avoid API spam).
    public func checkIfNeeded() {
        if let lastCheck = lastCheck, Date().timeIntervalSince(lastCheck) < checkInterval {
            return
        }

        Task {
            await check()
        }
    }

    /// Force an update check.
    public func check() async {
        lastCheck = Date()

        let urlString = "https://api.github.com/repos/\(repoOwner)/\(repoName)/releases/latest"
        guard let url = URL(string: urlString) else { return }

        do {
            var request = URLRequest(url: url)
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            request.timeoutInterval = 10

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tagName = json["tag_name"] as? String,
                  let htmlURL = json["html_url"] as? String else {
                return
            }

            // Strip "v" prefix if present
            let version = tagName.hasPrefix("v") ? String(tagName.dropFirst()) : tagName

            latestVersion = version
            releaseURL = htmlURL
            updateAvailable = isNewer(version, than: Self.currentVersion)
        } catch {
            // Silent failure — don't bother the user about network issues
            print("[UpdateChecker] Failed to check: \(error.localizedDescription)")
        }
    }

    /// Simple semver comparison (major.minor.patch).
    private func isNewer(_ remote: String, than local: String) -> Bool {
        let remoteParts = remote.split(separator: ".").compactMap { Int($0) }
        let localParts = local.split(separator: ".").compactMap { Int($0) }

        for i in 0..<max(remoteParts.count, localParts.count) {
            let r = i < remoteParts.count ? remoteParts[i] : 0
            let l = i < localParts.count ? localParts[i] : 0
            if r > l { return true }
            if r < l { return false }
        }
        return false
    }
}
