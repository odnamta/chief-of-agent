import Testing
import Foundation
@testable import ChiefOfAgentCore

@Suite("TerminalDetector Tests")
struct TerminalDetectorTests {

    @Test("Shell escape wraps in single quotes")
    func shellEscapeBasic() {
        let result = TerminalDetector.shellEscape("hello world")
        #expect(result == "'hello world'")
    }

    @Test("Shell escape handles single quotes")
    func shellEscapeSingleQuotes() {
        let result = TerminalDetector.shellEscape("it's a test")
        #expect(result == "'it'\\''s a test'")
    }

    @Test("Shell escape handles empty string")
    func shellEscapeEmpty() {
        let result = TerminalDetector.shellEscape("")
        #expect(result == "''")
    }

    @Test("Shell escape handles special characters")
    func shellEscapeSpecialChars() {
        let result = TerminalDetector.shellEscape("$(rm -rf /)")
        #expect(result == "'$(rm -rf /)'")
    }

    @Test("Shell escape handles backslashes")
    func shellEscapeBackslash() {
        let result = TerminalDetector.shellEscape("path\\to\\file")
        #expect(result == "'path\\to\\file'")
    }

    @Test("Shell escape handles double quotes")
    func shellEscapeDoubleQuotes() {
        let result = TerminalDetector.shellEscape("say \"hello\"")
        #expect(result == "'say \"hello\"'")
    }

    @Test("TerminalApp has correct display names")
    func displayNames() {
        #expect(TerminalApp.warp.displayName == "Warp")
        #expect(TerminalApp.iterm2.displayName == "iTerm2")
        #expect(TerminalApp.terminal.displayName == "Terminal")
    }

    @Test("TerminalApp bundle IDs are correct")
    func bundleIds() {
        #expect(TerminalApp.warp.rawValue == "dev.warp.Warp-Stable")
        #expect(TerminalApp.iterm2.rawValue == "com.googlecode.iterm2")
        #expect(TerminalApp.terminal.rawValue == "com.apple.Terminal")
    }

    @Test("Detect returns a valid terminal app")
    func detectReturnsValid() {
        let detected = TerminalDetector.detect()
        #expect(TerminalApp.allCases.contains(detected))
    }
}
