# Changelog

All notable changes to Chief of Agent will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-03-22

### Production Release

Chief of Agent is production-ready. 72 commits, 138 tests, 3 platforms.

### Hardened (since 0.3.0)

- **Fix:** Explicit early exit on null dashboard decision (prevent silent fallthrough)
- **Fix:** Remove forced unwrap on HookServer port binding (prevent crash)
- **Fix:** Config key whitelist prevents arbitrary injection via `config set`
- **Fix:** SSE reconnect timer cancelled on component unmount (prevent memory leak)
- **Fix:** Deny-rule pending timeout reduced from 120s to 15s (fast fallback to dashboard)
- **Security:** Regex DoS guard — patterns >500 chars rejected
- **Observability:** Log audit rotation failures, warn-once on notification mechanism failures
- **Tests:** 10 new respond pipeline integration tests (rule matching, pending round-trip, audit, regex guard)
- **Docs:** Sendable safety contract documented on Box<T> in StateWatcher
- **Swift 6:** Sendable compliance in timer/task closures (Box pattern, named captures)

---

## [0.3.0] - 2026-03-21

### Added — Phase 4: Agent Governance

- **Rules engine** — 34 default rules (destructive deny list + safe allow list), regex matching, first-match-wins
- **AI classifier** — Claude Haiku classification (opt-in, confidence-gated) as Tier 2
- **3-tier auto-responder** — Rules → AI → Human decision chain for PreToolUse hooks
- **Audit log** — Append-only JSONL at `~/.chief-of-agent/audit.jsonl` with 10MB rotation
- **`chief-of-agent suggest`** — Analyzes audit log, recommends new rules based on decision patterns
- **`chief-of-agent audit`** — View recent decisions with tier, latency, tool, detail
- **`chief-of-agent scan`** — Discover running Claude Code processes
- **`chief-of-agent rename`** — Rename session project names
- **Auto-decision feed** — Live SSE stream of rule/AI decisions in dashboard

### Added — macOS Menu Bar Improvements

- **HTTP hook server** — NWListener on 127.0.0.1:19222 for ~5ms hook handling
- **Approve/Deny in menu bar** — Pending action cards with one-click buttons
- **Global hotkey** — `Ctrl+Cmd+.` to toggle menu bar popover (Carbon Events)
- **Keyboard navigation** — Arrow keys + `Cmd+1-9` + Enter/Esc
- **AI session summaries** — Batch Haiku + local heuristic fast path (20+ patterns)
- **Session save/restore** — Bookmark sessions, resume with `claude --resume`
- **Terminal detection** — Auto-detect Warp, iTerm2, Terminal.app
- **Expired pending UI** — Dimmed cards with Dismiss button for timed-out requests
- **Stale cleanup** — Auto-remove orphaned pending requests after 5 minutes
- **Duplicate launch detection** — Activates existing instance instead of conflicting
- **Update checker** — GitHub releases API check with semver comparison

### Added — Infrastructure

- **`setup --http`** — Install HTTP hooks pointing to macOS app (type:http in settings.json)
- **GitHub Actions CI** — test.yml (Node + Swift + Dashboard) + release.yml (npm + .app.zip)
- **CONTRIBUTING.md** — Dev setup, security rules, PR process
- **Issue templates** — Bug report + feature request
- **Dependabot** — Auto-update npm + GitHub Actions dependencies

### Changed

- Dashboard upgraded to **Next.js 15.5 + React 19.2**
- `WarpActivator` replaced by `TerminalDetector` (supports all terminals)
- Session history auto-tracked on SessionEnd

### Fixed

- **AppleScript injection** in session restore — replaced with temp script approach
- **Path traversal** via requestId — UUID validation on both Swift and TypeScript sides
- **HookServer async/sync mismatch** — DispatchSemaphore bridge for real decisions
- **Timer pileup** — isPolling guard prevents re-entrant poll callbacks
- **Process timeout** — 30s kill timer on claude CLI for summaries
- **Hotkey dead code** — Removed nonsensical guard statement

### Security

- UUID validation on all requestIds (Swift + TypeScript)
- Shell escaping via POSIX single-quote wrapping
- HookServer localhost-only binding
- .npmignore to exclude non-production files from npm tarball

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
