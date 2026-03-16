# Chief of Agent

Agent attention manager for Claude Code CLI.

## Commands
- `npm run build` — compile TypeScript
- `npm test` — run tests (vitest)
- `npm run dev` — watch mode compilation

## Architecture
- `src/parser.ts` — Parse hook stdin JSON
- `src/state.ts` — Session state management (atomic writes + locking)
- `src/notify.ts` — macOS notification dispatch (osascript + afplay)
- `src/config.ts` — User configuration management
- `src/setup.ts` — Hook installation into ~/.claude/settings.json
- `src/cli.ts` — CLI entry point (commander.js)

## Security
- Use `execFileSync` for all subprocess calls (never `execSync`)
- Pass arguments as arrays, never interpolated strings

## Testing
- vitest with globals
- Test files: `src/__tests__/*.test.ts`
- Run single test: `npx vitest run src/__tests__/parser.test.ts`

## Phase 2 — macOS Menu Bar App

Native Swift/SwiftUI app in `macos/` directory.

### Commands
- `cd macos && swift build` — compile (debug)
- `cd macos && swift test` — run unit tests (11 tests)
- `cd macos && swift run` — run in development (bare binary, notifications may not work)
- `cd macos && swift build -c release` — release build
- `./scripts/install-macos.sh` — build + create .app bundle in ~/Applications

### Architecture
- `Sources/ChiefOfAgent/App.swift` — @main, MenuBarExtra entry point
- `Sources/ChiefOfAgent/MenuBarView.swift` — SwiftUI dropdown UI
- `Sources/ChiefOfAgent/SessionRowView.swift` — Individual session row
- `Sources/ChiefOfAgent/SettingsView.swift` — Launch at login, quiet hours config
- `Sources/ChiefOfAgentCore/SessionState.swift` — Codable models matching Phase 1 JSON
- `Sources/ChiefOfAgentCore/StateWatcher.swift` — Polls state.json every 1s, publishes changes
- `Sources/ChiefOfAgentCore/NotificationManager.swift` — UNUserNotificationCenter + quiet hours
- `Sources/ChiefOfAgentCore/WarpActivator.swift` — NSWorkspace Warp activation (3-tier fallback)

### Key Notes
- Must be built as .app bundle for UNUserNotificationCenter to work
- Uses `scripts/install-macos.sh` to create proper bundle with Info.plist
- LSUIElement=true — no Dock icon, menu bar only
- Reads `~/.chief-of-agent/state.json` (written by Phase 1)
- Reads/writes `~/.chief-of-agent/config.json` for quiet hours + notification prefs
- macOS 14+ (Sonoma) required, Swift 5.9+ (Xcode 15+)
