import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("LocalSummarizer Tests")
struct LocalSummarizerTests {

    @Test("Matches git push operations")
    func matchGitPush() {
        let content = "assistant: Running git push origin main"
        let result = LocalSummarizer.summarize(content: content, project: "gis-erp")
        #expect(result != nil)
        #expect(result?.contains("gis-erp") == true)
    }

    @Test("Matches npm test")
    func matchNpmTest() {
        let content = "assistant: Running npm test to verify changes"
        let result = LocalSummarizer.summarize(content: content, project: "secbot")
        #expect(result != nil)
        #expect(result?.contains("secbot") == true)
    }

    @Test("Matches swift build")
    func matchSwiftBuild() {
        let content = "assistant: Running swift build to compile"
        let result = LocalSummarizer.summarize(content: content, project: "chief-of-agent")
        #expect(result != nil)
        #expect(result?.contains("chief-of-agent") == true)
    }

    @Test("Matches refactoring")
    func matchRefactor() {
        let content = "user: refactor the auth module"
        let result = LocalSummarizer.summarize(content: content, project: "gis-erp")
        #expect(result != nil)
        #expect(result?.contains("Refactoring") == true)
    }

    @Test("Matches debugging")
    func matchDebug() {
        let content = "user: fix bug in the login flow"
        let result = LocalSummarizer.summarize(content: content, project: "atmando")
        #expect(result != nil)
        #expect(result?.contains("Debug") == true)
    }

    @Test("Returns nil for unrecognized content")
    func noMatchReturnsNil() {
        let content = "user: what is the meaning of life?"
        let result = LocalSummarizer.summarize(content: content, project: "test")
        #expect(result == nil)
    }

    @Test("Matches database migrations")
    func matchMigration() {
        let content = "assistant: Creating a new migration for the users table"
        let result = LocalSummarizer.summarize(content: content, project: "gis-erp")
        #expect(result != nil)
        #expect(result?.contains("Database") == true)
    }

    @Test("Matches npm install")
    func matchNpmInstall() {
        let content = "assistant: npm install commander proper-lockfile"
        let result = LocalSummarizer.summarize(content: content, project: "chief-of-agent")
        #expect(result != nil)
        #expect(result?.contains("dependencies") == true)
    }

    @Test("Case insensitive matching")
    func caseInsensitive() {
        let content = "assistant: Running NPM TEST"
        let result = LocalSummarizer.summarize(content: content, project: "test")
        #expect(result != nil)
    }

    @Test("Matches deployment commands")
    func matchDeploy() {
        let content = "assistant: vercel deploy --prod"
        let result = LocalSummarizer.summarize(content: content, project: "gis-erp")
        #expect(result != nil)
        #expect(result?.contains("Deploying") == true)
    }
}
