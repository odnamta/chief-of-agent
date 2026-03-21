# Chief of Agent — Roadmap

> From "attention manager for one developer" to "enterprise agent governance platform."
> Last updated: 2026-03-19

## Current State (Phases 1–4 Complete)

| Phase | What | Status |
|-------|------|--------|
| 1 | CLI hooks, notifications, session tracking, config | Done |
| 2 | macOS menu bar app (SwiftUI, pending UI, settings) | Done |
| 3 | Next.js web dashboard (SSE, long-poll, agent grid) | Done |
| 4 | Rules engine, AI classifier, audit log, 3-tier responder | Done |

**112 tests, 34 default rules, 3-tier auto-responder, dual UI (menu bar + web).**

---

## Phase 5 — Steal & Delight

> Steal the best ideas from Command. Make CoA a joy to use, not just functional.
> Target: 1–2 weeks.

### 5.1 AI Session Summaries

**Problem:** Menu bar shows "chief-of-agent — Working" but not *what* the agent is doing. Users have to switch tabs to find out.

**Solution:** Periodically read Claude Code session JSONL files and generate 3–8 word summaries of the current task.

- Read `~/.claude/projects/<hash>/sessions/<id>.jsonl` for active sessions
- Extract last N tool calls + assistant messages
- Batch all active sessions into one `claude -p --model haiku` call (cost-efficient)
- Fingerprint content (SHA256 of normalized text) to skip unchanged sessions
- Cache summaries in `~/.chief-of-agent/summaries.json`
- Refresh: every 3 minutes + on session status change
- Display in both menu bar and web dashboard

**Files to create/modify:**
- `src/summarizer.ts` — New module: read JSONL, batch summarize, cache
- `macos/Sources/ChiefOfAgentCore/StateWatcher.swift` — Poll summaries.json
- `macos/Sources/ChiefOfAgent/SessionRowView.swift` — Show summary text
- `dashboard/src/components/AgentGrid.tsx` — Show summary in session cards

**Steal from Command:** Their batch-to-Haiku approach is smart. One API call for all sessions.

### 5.2 Global Hotkey

**Problem:** Must click the menu bar icon to open. Power users want keyboard access.

**Solution:** Register a global hotkey (default: `Ctrl+Cmd+.`) via Carbon `RegisterEventHotKey`.

- Register in App.swift on launch
- Toggle popover open/close on key press
- Make configurable in Settings view
- Show current hotkey in footer

**Files to modify:**
- `macos/Sources/ChiefOfAgent/App.swift` — Register hotkey
- `macos/Sources/ChiefOfAgent/SettingsView.swift` — Hotkey picker
- New: `macos/Sources/ChiefOfAgent/HotkeyManager.swift`

### 5.3 Keyboard Navigation

**Problem:** No way to navigate sessions without mouse.

**Solution:** Arrow keys + Enter in the menu bar dropdown.

- Up/Down arrows to navigate sessions
- Enter to activate (switch to terminal)
- Cmd+1–9 to jump to session by index
- Esc to close popover

**Files to modify:**
- `macos/Sources/ChiefOfAgent/MenuBarView.swift` — Key event handler + focus tracking
- `macos/Sources/ChiefOfAgent/SessionRowView.swift` — Focus ring styling

### 5.4 Session Save & Restore

**Problem:** Long-running Claude sessions get lost when terminals close or machine restarts.

**Solution:** Bookmark active sessions, restore them later with `claude --resume`.

- **Save:** Capture session ID (from `--resume` arg via `ps`), CWD, project name, summary
- **Restore:** Open new terminal tab, `cd <cwd> && claude --resume <id>`
- **Persist:** `~/.chief-of-agent/saved_sessions.json`
- **UI:** "Save" button on each session row, "Saved" section in menu bar
- **History:** Auto-track last 20 closed sessions (from SessionEnd hook)

**Files to create/modify:**
- `src/session-store.ts` — New module: save/restore/history logic
- `src/cli.ts` — New commands: `save <id>`, `restore <id>`, `history`
- `macos/Sources/ChiefOfAgentCore/SessionStore.swift` — Persistence + restore
- `macos/Sources/ChiefOfAgent/MenuBarView.swift` — Saved sessions section

---

## Phase 6 — Developer Experience

> Make installation and daily use frictionless.
> Target: 2–3 weeks.

### 6.1 One-Command Install

**Current:** `npm install -g` + `setup` + manually build Swift app. Too many steps.

**Solution:** Homebrew formula that installs everything.

```bash
brew install --cask chief-of-agent
# Installs: CLI (npm global), macOS app (to ~/Applications), hooks (auto-setup)
```

- Create Homebrew cask formula
- Post-install script runs `chief-of-agent setup --auto`
- Pre-built universal binary (arm64 + x86_64) for the macOS app
- GitHub Releases with signed .app.zip artifacts

### 6.2 HTTP Hooks (Native)

**Current:** CLI command hooks — each hook spawns a new Node.js process. Slow (~200ms startup).

**Solution:** Run a lightweight HTTP server (like Command does) that receives hook events directly.

- `chief-of-agent daemon` — Long-running HTTP server on port 19221
- Auto-configure `~/.claude/settings.json` with `"type": "http"` hooks
- Single process handles all events (no per-event Node.js spawn)
- Graceful degradation: if daemon isn't running, fall back to command hooks
- Launchd plist for auto-start on login

**Impact:** Latency drops from ~200ms to ~5ms per hook event. Massive improvement for Tier 1 rule matching.

### 6.3 Unified Dashboard Launch

**Current:** Dashboard requires `cd dashboard && npm run dev` manually.

**Solution:** `chief-of-agent dashboard` starts it, or the daemon hosts it.

- Bundle dashboard into the daemon process (or spawn as child)
- `chief-of-agent dashboard` — Start dashboard on :3400
- `chief-of-agent dashboard --stop` — Stop
- macOS app Settings: toggle to auto-start dashboard

### 6.4 First-Run Wizard

**Problem:** New users don't know what to configure.

**Solution:** Interactive setup on first run.

- `chief-of-agent setup` detects first run, enters wizard mode
- Choose: notification preferences, quiet hours, dashboard on/off
- Install macOS app (if on macOS)
- Show "You're all set!" with quick-start tips

---

## Phase 7 — Intelligence Layer

> Make CoA learn from usage and provide actionable insights.
> Target: 3–4 weeks.

### 7.1 Cost Tracking

**Problem:** No visibility into how much AI agents are spending.

**Solution:** Track token usage per session from Claude Code's billing data.

- Parse session JSONL for token counts (input/output per call)
- Aggregate per-session, per-project, per-day
- Show in menu bar: "chief-of-agent — Working ($0.42)"
- Show in dashboard: cost chart, daily/weekly breakdown
- Alert thresholds: "Session X has used $5+ in the last hour"
- Persist: `~/.chief-of-agent/costs.jsonl`

### 7.2 Smart Notifications

**Problem:** Notifications fire on every status change. Some are important, some are noise.

**Solution:** AI-prioritized notification routing.

- **P0 (always notify):** Errors, security-sensitive denials, cost spikes
- **P1 (notify if idle >2min):** Permission prompts, approval requests
- **P2 (batch):** Session completions, routine status changes
- **P3 (silent):** Working status updates, safe auto-decisions
- Learn priority from user behavior: which notifications get acted on vs dismissed
- Persist priority model in config

### 7.3 Pattern Learning

**Problem:** `suggest` command requires manual run. Users forget.

**Solution:** Auto-learn from audit log and proactively suggest rules.

- Background analysis on every 50th audit entry
- Auto-promote suggestions with 10+ consistent occurrences to "draft rules"
- Show draft rules in dashboard with one-click accept/reject
- Weekly digest notification: "CoA learned 3 new patterns this week"

### 7.4 Session Analytics

**Problem:** No insight into agent productivity patterns.

**Solution:** Dashboard analytics page.

- Sessions per day/week (chart)
- Average session duration
- Most common tools used
- Approval rate (% auto-approved vs manual)
- Time spent waiting for human (approval latency)
- Top denied patterns
- Exportable as JSON/CSV

---

## Phase 8 — Enterprise Grade

> Multi-user, multi-machine, compliance-ready.
> Target: 4–6 weeks.

### 8.1 Team Policies

**Problem:** Each developer maintains their own policies.json. No organizational consistency.

**Solution:** Shared policy repository.

- `~/.chief-of-agent/team-policies.json` — Fetched from a central source (git repo, URL, or API)
- Merge order: team policies → project policies → user overrides
- `chief-of-agent policy sync` — Pull latest team policies
- Policy versioning with changelog
- Lock specific rules (team admin can mark rules as non-overridable)

### 8.2 Centralized Dashboard

**Problem:** Dashboard only sees local machine sessions.

**Solution:** Multi-machine aggregation.

- Agents on different machines report to a central CoA server
- WebSocket connections from each machine's daemon
- Dashboard shows all team members' active sessions
- Filter by: machine, developer, project, status
- Requires auth (API key per machine)

### 8.3 RBAC (Role-Based Access Control)

**Problem:** No access control — anyone can approve/deny any action.

**Solution:** Role-based permissions.

- **Admin:** Full control — edit policies, approve/deny all, view audit
- **Developer:** Approve/deny own sessions only, view own audit
- **Observer:** Read-only — view sessions and audit, no action buttons
- Roles managed via team config or SSO integration

### 8.4 Webhook Integrations

**Problem:** Notifications only go to the local machine.

**Solution:** Push events to external services.

- **Slack:** Post to channel when session needs attention, thread replies for decisions
- **Discord:** Same as Slack
- **PagerDuty:** Route P0 alerts to on-call
- **Custom webhook:** POST JSON to any URL on configurable events
- Config: `~/.chief-of-agent/webhooks.json`

### 8.5 Compliance Reporting

**Problem:** No way to prove governance to auditors.

**Solution:** Exportable compliance reports.

- `chief-of-agent report --from 2026-03-01 --to 2026-03-31` — Generate PDF/HTML report
- Contents: total actions, approval rates, denied patterns, policy changes, response times
- Tamper-evident audit log (hash chain on JSONL entries)
- SOC 2 / ISO 27001 mapping (which controls CoA satisfies)

---

## Phase 9 — Public Release

> Ship it. Get users. Build community.
> Target: 2 weeks after Phase 6.

### 9.1 GitHub Release Automation

- GitHub Actions: build macOS universal binary, create .app.zip, publish release
- Semantic versioning from conventional commits
- Auto-generate changelog from git history
- Signed binaries (Apple Developer ID or ad-hoc with notarization)

### 9.2 Documentation Site

- Single-page docs (or small Docusaurus/Fumadocs site)
- Quick start guide (< 2 minutes to first notification)
- Configuration reference
- Architecture overview with diagrams
- FAQ: "How is this different from Command?" → "Command is a terminal navigator. CoA is agent governance."

### 9.3 Landing Page

- `chiefofagent.dev` (or similar)
- Hero: "Know what your AI agents are doing. Control what they can do."
- Demo GIF/video showing: notification → menu bar → approve → agent continues
- Install command front and center
- Feature comparison table

### 9.4 Community

- GitHub Discussions for feature requests and Q&A
- Discord server for real-time help
- "Show your setup" channel for screenshots/configs
- Contributing guide for PRs

---

## Priority Matrix

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| 5.1 AI Summaries | High | Medium | **P0** — biggest UX gap vs Command |
| 5.2 Global Hotkey | Medium | Low | **P0** — quick win |
| 5.3 Keyboard Nav | Medium | Low | **P1** — power user delight |
| 5.4 Session Save/Restore | High | Medium | **P0** — killer feature we lack |
| 6.1 Homebrew Install | High | Medium | **P0** — blocks public release |
| 6.2 HTTP Hooks | High | Medium | **P1** — performance leap |
| 6.3 Unified Dashboard | Medium | Low | **P1** — removes friction |
| 6.4 First-Run Wizard | Medium | Low | **P2** — nice-to-have |
| 7.1 Cost Tracking | High | Medium | **P1** — unique differentiator |
| 7.2 Smart Notifications | Medium | Medium | **P2** |
| 7.3 Pattern Learning | Medium | Medium | **P2** |
| 7.4 Session Analytics | Medium | High | **P2** |
| 8.x Enterprise | High | High | **P3** — after public release |
| 9.x Public Release | High | Medium | **P1** — do after Phase 5+6 |

---

## Suggested Execution Order

```
Phase 5.2 (Hotkey)          ████░░░░  2 days
Phase 5.3 (Keyboard Nav)    ████░░░░  2 days
Phase 5.1 (AI Summaries)    ████████  5 days
Phase 5.4 (Save/Restore)    ██████░░  4 days
Phase 6.1 (Homebrew)        ██████░░  4 days
Phase 9 (Public Release)    ████████  5 days  ← SHIP HERE
Phase 6.2 (HTTP Hooks)      ██████░░  4 days
Phase 7.1 (Cost Tracking)   ██████░░  4 days
Phase 6.3 (Unified Dash)    ████░░░░  2 days
Phase 7.x (Intelligence)    ████████████  8 days
Phase 8.x (Enterprise)      ████████████████  12 days
```

**Ship public release after Phase 5 + 6.1.** Don't wait for perfection.

---

## Competitive Positioning

```
                    Terminal Awareness
                         ▲
                         │
          Command ●      │
          (navigator)    │
                         │
     ─────────────────────────────────── ▶ Agent Governance
                         │
                         │      ● Chief of Agent
                         │        (governor)
                         │
                         │             ● Chief of Agent v2
                         │               (Phase 5+6: both)
```

**Command** = "Where are my terminals?" (horizontal: all terminals, shallow depth)
**Chief of Agent** = "What can my agents do?" (vertical: Claude only, deep governance)
**Chief of Agent v2** = Both. Terminal awareness + agent governance.

---

## Non-Goals

Things we explicitly won't do:

- **Support non-Claude agents** (yet) — Focus on Claude Code first, expand later
- **Build a full terminal emulator** — We manage agents, not terminals
- **Replace Claude Code's built-in permissions** — We augment them, not replace
- **Cloud-hosted SaaS** (Phase 8 is self-hosted) — Enterprise self-hosts; SaaS is Phase 10+
- **Mobile app** — Web dashboard works on mobile browsers; native app is overkill for now
