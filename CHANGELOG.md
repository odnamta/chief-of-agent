# Changelog

All notable changes to Chief of Agent will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-03-16

### Added — Phase 3: Control Tower

- **`dashboard/`** — Next.js 14 web app on port 3400 (dark theme, Tailwind CSS)
- **Pending store** — In-memory Map of Promises using `globalThis` for HMR safety
- **`POST /api/pending`** — CLI long-polls until user responds or 120s timeout
- **`GET /api/pending`** — Returns all current pending requests
- **`POST /api/respond`** — Resolves a pending request with allow/deny/ask
- **`GET /api/events`** — SSE stream for real-time pending:new and pending:resolved events
- **`GET /api/sessions`** — Reads `~/.chief-of-agent/state.json` for agent grid
- **`PendingCard` component** — Approve/Deny/Terminal buttons with live elapsed timer
- **`AgentGrid` component** — 2-column grid of all agent sessions with status dots
- **`Header` component** — Top bar with agent count and pending count indicator
- **`chief-of-agent respond`** — New CLI command: reads PreToolUse hook stdin, POSTs to dashboard, awaits decision, outputs `permissionDecision` JSON
- **`chief-of-agent setup --dashboard`** — Opt-in flag that installs PreToolUse hook (matcher: Bash|Edit|Write). Regular `setup` unchanged.
- **`generateDashboardHookConfig()`** and **`installDashboardHook()`** in `setup.ts`
- **15 new Phase 3 tests** — dashboard hook config, mergeHooks with PreToolUse, extractDetail logic, output format verification

---

## [0.1.0] - 2026-03-15

Initial release.

### Added

- Claude Code hooks integration — handles `Notification`, `Stop`, `PostToolUseFailure`, `SessionStart`, and `SessionEnd` hook types
- macOS native notifications via `osascript` — project name and context in every alert
- Sound alerts via `afplay` — configurable, defaults to macOS system sounds (no extra files needed)
- Session state tracking at `~/.chief-of-agent/state.json` — atomic writes with file locking via `proper-lockfile`
- Per-session notification cooldown — prevents alert spam, persisted to disk across restarts
- Quiet hours configuration — suppress notifications during specified time windows
- `chief-of-agent setup` — one-command hook installation that merges with existing `~/.claude/settings.json`
- `chief-of-agent status` — colored terminal output showing all active agent sessions with state, last-seen time, and pending tool context
- `chief-of-agent config show` — display current configuration
- `chief-of-agent config set <key> <value>` — update individual config values
- Warp terminal activation on notification — brings the right tab to focus when an alert fires
- Security-first subprocess handling — all external calls use `execFileSync` with argument arrays, never string interpolation
