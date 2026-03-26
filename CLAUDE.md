# Chief of Agent

Agent governance platform for Claude Code CLI. Monitors sessions, enforces rules, approves/denies destructive actions via menu bar or web dashboard.

## Commands
- `npm run build` — compile TypeScript
- `npm test` — run tests (vitest, 97 tests)
- `npm run dev` — watch mode compilation
- `cd macos && swift build` — compile macOS app
- `cd macos && swift test` — run Swift tests (31 tests)
- `cd dashboard && npm run dev` — start web dashboard on :3400
- `cd dashboard && npm run build` — production build dashboard

## CLI Commands
- `chief-of-agent setup` — install hooks into ~/.claude/settings.json
- `chief-of-agent setup --dashboard` — also install PreToolUse hook for approve/deny
- `chief-of-agent setup --http` — install HTTP hooks pointing to macOS app (:19222)
- `chief-of-agent status` — show all active sessions
- `chief-of-agent scan` — discover running Claude Code processes
- `chief-of-agent rename <id> <name>` — rename session project name
- `chief-of-agent config` — manage configuration
- `chief-of-agent audit` — view decision log
- `chief-of-agent suggest` — analyze audit log and recommend new rules
- `chief-of-agent respond` — 3-tier auto-responder (called by PreToolUse hook)
- `chief-of-agent uninstall [--purge]` — remove hooks (and optionally config dir)
- `chief-of-agent webhook add/list/remove/test` — manage webhook notifications
- `chief-of-agent policy export/import/diff` — team policy sharing
- `chief-of-agent discover` — scan Claude Code setup, find unused capabilities
- `chief-of-agent compact-context` — re-inject context after PostCompact (hook)

## Architecture — CLI (src/)
- `src/cli.ts` — CLI entry point (commander.js, 10+ commands)
- `src/parser.ts` — Parse hook stdin JSON
- `src/state.ts` — Session state management (atomic writes + file locking)
- `src/notify.ts` — macOS notification dispatch (osascript + afplay)
- `src/config.ts` — User configuration management
- `src/setup.ts` — Hook installation into ~/.claude/settings.json
- `src/pending.ts` — File-based pending request queue (pending.json + responses/)
- `src/rules.ts` — Rule engine (regex matching, first-match-wins)
- `src/policies.ts` — 34 default rules (destructive deny list + safe allow list)
- `src/audit.ts` — Append-only JSONL audit log with rotation + rule suggestion
- `src/webhooks.ts` — Webhook notifications (Slack/Discord/custom, HMAC signing)
- `src/policy-exchange.ts` — Policy export/import/diff for team sharing
- `src/discover.ts` — Scan Claude Code setup, surface unused capabilities
- `src/ai-classifier.ts` — Claude Haiku AI classifier (Tier 2, opt-in)

## Architecture — macOS Menu Bar App (macos/)
- `Sources/ChiefOfAgent/App.swift` — @main, MenuBarExtra, wires all components
- `Sources/ChiefOfAgent/MenuBarView.swift` — Main dropdown (pending, sessions, saved, footer)
- `Sources/ChiefOfAgent/SessionRowView.swift` — Session card with summary, bookmark, Cmd+N
- `Sources/ChiefOfAgent/PendingActionView.swift` — Approve/Deny cards with expiry detection
- `Sources/ChiefOfAgent/SettingsView.swift` — Launch at login, quiet hours, notifications
- `Sources/ChiefOfAgent/HotkeyManager.swift` — Global Ctrl+Cmd+. hotkey (Carbon Events)
- `Sources/ChiefOfAgent/KeyEventHandler.swift` — Arrow keys + Cmd+1-9 keyboard navigation
- `Sources/ChiefOfAgentCore/SessionState.swift` — Codable models matching CLI state.json
- `Sources/ChiefOfAgentCore/PendingState.swift` — PendingRequest model with staleness detection
- `Sources/ChiefOfAgentCore/StateWatcher.swift` — Polls state.json + pending.json every 1s
- `Sources/ChiefOfAgentCore/NotificationManager.swift` — UNUserNotificationCenter + quiet hours
- `Sources/ChiefOfAgentCore/WarpActivator.swift` — 3-tier Warp activation fallback
- `Sources/ChiefOfAgentCore/HookServer.swift` — HTTP server on 127.0.0.1:19222 for direct hook events
- `Sources/ChiefOfAgentCore/SummaryManager.swift` — AI session summaries (local heuristics + Haiku)
- `Sources/ChiefOfAgentCore/LocalSummarizer.swift` — 20+ pattern groups for instant summaries
- `Sources/ChiefOfAgentCore/SessionStore.swift` — Save/restore/history for Claude sessions

## Architecture — Web Dashboard (dashboard/)
- `dashboard/src/app/page.tsx` — Main page (SSE + session polling)
- `dashboard/src/app/api/pending/route.ts` — POST long-poll, GET list pending
- `dashboard/src/app/api/respond/route.ts` — POST resolve pending decision
- `dashboard/src/app/api/events/route.ts` — GET SSE stream for real-time updates
- `dashboard/src/app/api/sessions/route.ts` — GET reads state.json
- `dashboard/src/app/api/auto-decision/route.ts` — POST auto-decision broadcast
- `dashboard/src/lib/pending-store.ts` — In-memory Map (globalThis-safe for HMR)
- `dashboard/src/lib/auto-decision-store.ts` — Auto-decision circular buffer + SSE
- `dashboard/src/components/` — Header, PendingCard, AgentGrid, AutoDecisionFeed

## 3-Tier Auto-Responder (chief-of-agent respond)
1. **Tier 1 — Rules Engine**: Match against policies.json (allow/deny/pending)
2. **Tier 2 — AI Classifier**: Claude Haiku classification (opt-in, confidence-gated)
3. **Tier 3 — Dashboard/Menu Bar**: Long-poll for human decision (120s timeout → ask)

## HTTP Hook Server (macOS app)
- Listens on `127.0.0.1:19222`
- POST /hook — receives Claude Code hook events, creates pending requests
- GET /health — returns server status
- Uses DispatchSemaphore to bridge NW background thread ↔ MainActor
- PreToolUse events create PendingRequest in menu bar, block until user decides
- 30s timeout → falls back to "ask"

## Setup Modes
- `chief-of-agent setup` — Base hooks only (notifications, session tracking)
- `chief-of-agent setup --dashboard` — + PreToolUse command hook (spawns Node.js, ~200ms)
- `chief-of-agent setup --http` — + PreToolUse HTTP hook to :19222 (macOS app, ~5ms)

## Security
- Use `execFileSync` for all subprocess calls (never `execSync`)
- Pass arguments as arrays, never interpolated strings
- UUID validation on all requestIds (prevent path traversal)
- Shell escaping via POSIX single-quote wrapping in session restore
- HookServer binds to 127.0.0.1 only (localhost)

## Testing
- TypeScript: vitest, 133 tests across 12 files (src/__tests__/)
- Total: 164 tests (133 TS + 31 Swift)
- Swift: swift-testing, 31 tests across 5 files (macos/Tests/)
- Run single: `npx vitest run src/__tests__/parser.test.ts`
- Run single: `cd macos && swift test --filter "PendingState"`

## Key Files
- `~/.chief-of-agent/state.json` — Active session states
- `~/.chief-of-agent/pending.json` — Pending approval requests
- `~/.chief-of-agent/responses/<id>.json` — Decision response files
- `~/.chief-of-agent/config.json` — User preferences
- `~/.chief-of-agent/policies.json` — Rules + AI config
- `~/.chief-of-agent/audit.jsonl` — Decision audit log
- `~/.chief-of-agent/summaries.json` — Cached AI summaries
- `~/.chief-of-agent/saved_sessions.json` — Bookmarked sessions
- `~/.chief-of-agent/webhooks.json` — Webhook endpoints config
- `~/.chief-of-agent/decisions.jsonl` — Recent auto-decisions for menu bar

## Key Notes
- macOS 14+ (Sonoma) required for menu bar app
- Must build as .app bundle for notifications: `./scripts/install-macos.sh`
- LSUIElement=true — no Dock icon, menu bar only
- Duplicate launch detection — activates existing instance
- Dashboard runs on Next.js 15 + React 19
