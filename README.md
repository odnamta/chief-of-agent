# Chief of Agent

**Agent governance for Claude Code — know what your AI agents are doing, control what they can do.**

[![CI](https://github.com/odnamta/chief-of-agent/actions/workflows/test.yml/badge.svg)](https://github.com/odnamta/chief-of-agent/actions/workflows/test.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/chief-of-agent)](https://www.npmjs.com/package/chief-of-agent)

---

## What It Does

You run multiple Claude Code sessions in parallel. Chief of Agent:

1. **Monitors** all sessions — which are working, waiting, or errored
2. **Enforces rules** — 34 default policies block destructive commands automatically
3. **Approves/denies** — pending actions appear in your menu bar or web dashboard
4. **Audits** — every decision is logged for review and pattern analysis
5. **Summarizes** — AI-generated summaries show what each agent is doing

Three interfaces: **macOS menu bar** + **web dashboard** + **CLI**.

**Requirements:** macOS 14+ (Sonoma), Node.js 18+, Claude Code CLI

---

## Install

```bash
# Install CLI
npm install -g chief-of-agent

# Install hooks (base: notifications + session tracking)
chief-of-agent setup

# Enable approve/deny + rules engine
chief-of-agent setup --dashboard --auto

# OR: use HTTP hooks for ~5ms latency (requires menu bar app)
chief-of-agent setup --http --auto

# Install macOS menu bar app
./scripts/install-macos.sh
```

### Setup Modes

| Mode | What it does | Latency |
|------|-------------|---------|
| `setup` | Notifications + session tracking only | — |
| `setup --dashboard` | + PreToolUse command hook → rules → dashboard | ~200ms |
| `setup --http` | + PreToolUse HTTP hook → menu bar app directly | ~5ms |
| `--auto` | Creates default policies.json with 34 rules | — |

---

## Menu Bar App

Native SwiftUI app in your macOS menu bar.

- **Status at a glance** — green/yellow/red dots for each session
- **Approve/Deny** — pending destructive actions appear as cards with one-click buttons
- **AI summaries** — 3-8 word descriptions of what each agent is doing
- **Keyboard navigation** — `Ctrl+Cmd+.` to toggle, `Cmd+1-9` to jump, arrows to navigate
- **Session save/restore** — bookmark sessions, resume later with `claude --resume`
- **Terminal detection** — works with Warp, iTerm2, and Terminal.app
- **Update checker** — notifies when new versions are available
- **Quiet hours** — suppress notifications during configured hours

### Build

```bash
cd macos
swift build              # debug
swift test               # 31 tests
swift build -c release   # release
./scripts/install-macos.sh  # install to ~/Applications
```

---

## Rules Engine

34 default rules that run in <1ms. No API calls, no latency.

**Auto-deny:** `rm -rf`, `git push --force`, `chmod 777`, `docker rm`, `kill -9`, `dd if=`, `DROP TABLE`, and more.

**Auto-allow:** `Read`, `Glob`, `Grep` tools, read-only bash (`ls`, `cat`, `git status`), build tools (`npm test`, `swift build`), and more.

```bash
# View your policies
cat ~/.chief-of-agent/policies.json

# Analyze your audit log and get rule suggestions
chief-of-agent suggest
```

### 3-Tier Decision Chain

When a PreToolUse hook fires:

1. **Tier 1 — Rules Engine** — match against policies.json (instant, deterministic)
2. **Tier 2 — AI Classifier** — Claude Haiku classifies if enabled (opt-in, confidence-gated)
3. **Tier 3 — Human** — pending card in menu bar or web dashboard (120s timeout → ask)

Every decision is logged to `~/.chief-of-agent/audit.jsonl`.

---

## Web Dashboard

Next.js 15 + React 19 dashboard on `localhost:3400`.

- **Pending actions** — approve/deny from the browser
- **Agent grid** — all sessions with status, CWD, time-ago
- **Auto-decision feed** — live stream of rule/AI decisions
- **SSE** — real-time updates, no polling for pending actions

```bash
cd dashboard
npm install
npm run dev    # localhost:3400
```

---

## CLI Commands

| Command | What |
|---------|------|
| `chief-of-agent setup [--dashboard\|--http] [--auto]` | Install hooks |
| `chief-of-agent status` | Show all active sessions |
| `chief-of-agent scan` | Discover running Claude Code processes |
| `chief-of-agent rename <id> <name>` | Rename a session's project |
| `chief-of-agent config show` | View configuration |
| `chief-of-agent config set <key> <value>` | Update config |
| `chief-of-agent audit [--last N]` | View decision log |
| `chief-of-agent suggest` | Analyze audit log, recommend new rules |
| `chief-of-agent respond` | 3-tier auto-responder (called by hooks) |

---

## Architecture

```
Claude Code ──hook──► chief-of-agent CLI
                          │
                ┌─────────┼─────────┐
                ▼         ▼         ▼
           Rules Engine  AI      Menu Bar / Dashboard
           (policies)  (Haiku)   (approve/deny UI)
                │         │         │
                └─────────┼─────────┘
                          ▼
                     audit.jsonl
```

### Key Files

| File | Purpose |
|------|---------|
| `~/.chief-of-agent/state.json` | Active session states |
| `~/.chief-of-agent/pending.json` | Pending approval requests |
| `~/.chief-of-agent/policies.json` | Rules + AI config |
| `~/.chief-of-agent/audit.jsonl` | Decision audit log (rotates at 10MB) |
| `~/.chief-of-agent/config.json` | User preferences |
| `~/.chief-of-agent/summaries.json` | Cached AI summaries |
| `~/.chief-of-agent/saved_sessions.json` | Bookmarked sessions |
| `~/.chief-of-agent/webhooks.json` | Webhook endpoints config |
| `~/.chief-of-agent/decisions.jsonl` | Recent auto-decisions |
| `~/.chief-of-agent/costs.json` | Per-session cost cache |

---

## Webhooks (Slack / Discord / Custom)

Get notified in Slack or Discord when agents are denied or cost thresholds are exceeded.

```bash
# Add a Slack webhook
chief-of-agent webhook add https://hooks.slack.com/xxx --format slack --events deny,error,cost_alert

# Test it
chief-of-agent webhook test 0

# List configured webhooks
chief-of-agent webhook list
```

Supports HMAC-SHA256 signing via `--secret` for webhook verification.

---

## Team Policy Sharing

Export, import, and diff policies across your team.

```bash
# Export current policies with metadata
chief-of-agent policy export

# Import team policies (merge mode — preserves your local rules)
chief-of-agent policy import team-policies.json

# Replace all local rules with team policies
chief-of-agent policy import team-policies.json --replace

# See what would change before importing
chief-of-agent policy diff team-policies.json
```

Supports locked rules — team admins can mark rules that cannot be overridden locally.

---

## Pattern Intelligence

The `suggest` command analyzes your audit log and recommends rules with smart pattern generalization.

```bash
chief-of-agent suggest          # interactive review
chief-of-agent suggest --apply  # auto-apply all consistent suggestions
```

Shows automation metrics: current rate, potential rate if suggestions adopted, estimated daily savings. The dashboard includes a Pattern Intelligence card with the same data.

---

## HTTP Hook Server

The macOS menu bar app includes a built-in HTTP server on `127.0.0.1:19222`. When you use `setup --http`, Claude Code sends hook events directly to the app via HTTP — no Node.js process spawning, ~5ms latency.

```bash
# Check if the server is running
curl http://127.0.0.1:19222/health
```

---

## Tests

```bash
npm test                          # 133 TypeScript tests
cd macos && swift test            # 31 Swift tests
cd dashboard && npm run build     # verify dashboard builds
```

164 tests total covering: parser, state, config, notifications, setup, integration, rules engine, AI classifier, audit, pending validation, session store, local summarizer, respond pipeline, webhooks, policy exchange.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, security rules, and PR process.

---

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Dio Atmando](https://github.com/odnamta). Built with [Claude Code](https://claude.ai/code).
