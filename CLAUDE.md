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

## Phase 3 — Control Tower Web Dashboard

Next.js dashboard in `dashboard/` directory. Runs on port 3400.

### Commands
- `cd dashboard && npm run dev` — start dev server on :3400
- `cd dashboard && npm run build` — production build
- `cd dashboard && npm start` — start production server on :3400

### Architecture
- `dashboard/src/app/page.tsx` — Main dashboard page (SSE + session polling)
- `dashboard/src/app/api/pending/route.ts` — POST creates pending request (long-poll), GET lists all
- `dashboard/src/app/api/respond/route.ts` — POST resolves pending with allow/deny/ask
- `dashboard/src/app/api/events/route.ts` — GET SSE stream for real-time updates
- `dashboard/src/app/api/sessions/route.ts` — GET reads ~/.chief-of-agent/state.json
- `dashboard/src/lib/pending-store.ts` — In-memory Map of Promises (globalThis-safe for HMR)
- `dashboard/src/components/Header.tsx` — Top bar with agent/pending counts
- `dashboard/src/components/PendingCard.tsx` — Pending request card with Approve/Deny/Terminal
- `dashboard/src/components/AgentGrid.tsx` — 2-column agent session grid

### Setup with Dashboard (opt-in)
```bash
chief-of-agent setup --dashboard
```
Adds PreToolUse hook (matcher: Bash|Edit|Write) that runs `chief-of-agent respond`.
Regular `chief-of-agent setup` does NOT install the PreToolUse hook.

### Key Notes
- Pending store uses `globalThis` to survive Next.js HMR reloads
- Long-poll timeout: 120s → falls back to `permissionDecision: "ask"`
- Dashboard not running → immediate `ask` fallback (connection refused catch)
- SSE heartbeat every 25s to keep connection alive through proxies

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
