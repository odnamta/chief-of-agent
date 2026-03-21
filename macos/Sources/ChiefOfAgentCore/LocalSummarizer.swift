import Foundation

/// Fast local pattern matching for session summaries.
/// Tries to generate a 3-8 word summary without calling the Claude API.
/// Returns nil if no pattern matches (falls through to API call).
public struct LocalSummarizer {

    /// Try to summarize the session content using local pattern matching.
    /// Returns nil if no pattern matches.
    public static func summarize(content: String, project: String) -> String? {
        let lower = content.lowercased()

        // Check each pattern group in priority order
        for group in patternGroups {
            for pattern in group.patterns {
                if lower.contains(pattern) {
                    return group.summary(project)
                }
            }
        }

        return nil
    }

    // MARK: - Pattern Groups

    private struct PatternGroup {
        let patterns: [String]
        let summary: (String) -> String
    }

    private static let patternGroups: [PatternGroup] = [
        // Testing
        PatternGroup(
            patterns: ["npm test", "npx vitest", "npm run test", "swift test", "pytest", "cargo test", "go test"],
            summary: { "Running tests for \($0)" }
        ),

        // Git operations
        PatternGroup(
            patterns: ["git push", "git merge", "git rebase"],
            summary: { "Git push/merge on \($0)" }
        ),
        PatternGroup(
            patterns: ["git pull", "git fetch"],
            summary: { "Pulling latest changes in \($0)" }
        ),
        PatternGroup(
            patterns: ["git commit", "git add"],
            summary: { "Committing changes in \($0)" }
        ),
        PatternGroup(
            patterns: ["git checkout", "git switch", "git branch"],
            summary: { "Branch management in \($0)" }
        ),

        // Build commands
        PatternGroup(
            patterns: ["swift build", "npm run build", "next build", "cargo build", "go build", "make"],
            summary: { "Building \($0)" }
        ),
        PatternGroup(
            patterns: ["npm install", "npm ci", "pip install", "cargo add", "brew install"],
            summary: { "Installing dependencies for \($0)" }
        ),

        // Development servers
        PatternGroup(
            patterns: ["npm run dev", "next dev", "vite", "cargo run", "go run"],
            summary: { "Running dev server for \($0)" }
        ),

        // Database
        PatternGroup(
            patterns: ["migration", "migrate", "prisma", "drizzle", "supabase"],
            summary: { "Database work on \($0)" }
        ),

        // Code generation / scaffolding
        PatternGroup(
            patterns: ["npx create-", "npm init", "cargo init", "swift package init"],
            summary: { "Scaffolding new project in \($0)" }
        ),

        // Deployment
        PatternGroup(
            patterns: ["vercel deploy", "docker build", "docker push", "kubectl"],
            summary: { "Deploying \($0)" }
        ),

        // Refactoring signals
        PatternGroup(
            patterns: ["refactor", "rename", "extract", "move file", "reorganiz"],
            summary: { "Refactoring \($0)" }
        ),

        // Bug fixing signals
        PatternGroup(
            patterns: ["fix bug", "fixing", "debug", "troubleshoot", "investigate"],
            summary: { "Debugging issue in \($0)" }
        ),

        // Documentation
        PatternGroup(
            patterns: ["readme", "documentation", "docs", "changelog", "jsdoc"],
            summary: { "Writing docs for \($0)" }
        ),

        // Linting / formatting
        PatternGroup(
            patterns: ["eslint", "prettier", "swiftlint", "rustfmt", "black", "isort"],
            summary: { "Linting/formatting \($0)" }
        ),

        // CI/CD
        PatternGroup(
            patterns: [".github/workflows", "ci.yml", "github actions", "pipeline"],
            summary: { "CI/CD config for \($0)" }
        ),

        // API work
        PatternGroup(
            patterns: ["api route", "endpoint", "route handler", "rest api", "graphql"],
            summary: { "API development on \($0)" }
        ),

        // UI/Frontend
        PatternGroup(
            patterns: ["component", "stylesheet", "css", "tailwind", "shadcn"],
            summary: { "UI work on \($0)" }
        ),

        // Auth
        PatternGroup(
            patterns: ["auth", "login", "signup", "session", "jwt", "oauth", "clerk"],
            summary: { "Auth work on \($0)" }
        ),
    ]
}
