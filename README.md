# Chief of Agent

**Know which Claude Code agent needs you — without checking every tab.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## The Problem

You run 5–10 Claude Code CLI sessions in parallel Warp tabs — one for GIS-ERP, one for Cekatan, one for the migration script, one for the website. Each agent is mid-task. Some are waiting on your approval. Some hit an error ten minutes ago.

You have no idea which tab needs you.

So you click through every tab manually. You break your flow. You interrupt yourself to check agents that are fine, and you miss the one that's been stuck for eight minutes.

---

## The Solution

Chief of Agent hooks directly into Claude Code's hook system. When an agent needs you, you know immediately — without switching tabs.

- **macOS native notifications** pop up with the project name and what the agent is waiting on
- **Sound alerts** distinguish between permission requests, errors, and completions
- **`chief-of-agent status`** shows all sessions at a glance — who's working, who's waiting, who errored

---

## Install

```bash
npm install -g chief-of-agent
chief-of-agent setup
```

That's it. The `setup` command merges the required hooks into your `~/.claude/settings.json`. Every Claude Code session you open from that point forward is tracked automatically.

**Requirements:** macOS, Node.js 18+, Claude Code CLI

---

## What Happens Automatically

Once installed, Chief of Agent runs silently in the background via Claude Code hooks. You don't run anything manually.

**Agent needs permission:**
```
Chief of Agent — GIS-ERP
Needs approval: git push origin main
```

**Agent hits an error:**
```
Chief of Agent — Secbot
Error: npm test — Process exited with code 1
```

**Agent finishes:**
```
Chief of Agent — Migration
Task complete
```

Sound alerts fire on each event type. Sounds use macOS system sounds — no extra files to install.

---

## `chief-of-agent status`

Run this anytime to see the state of all active sessions:

```
  Chief of Agent — 5 active session(s)

  🟢 gis-erp              working    2m ago     [abc12345]
  🟡 secbot                waiting    30s ago    [def45678]
     └─ Bash: rm -rf node_modules
  🔴 website               error      1m ago     [ghi78901]
     └─ Bash: npm test — Process exited with code 1
  🟢 migration             working    5m ago     [jkl01234]
  🟢 cekatan               working    3m ago     [mno56789]
```

Color codes: green = working, yellow = waiting for approval, red = errored.

---

## Configuration

```bash
# View current config
chief-of-agent config show

# Adjust notification cooldown (default: 60s per session)
chief-of-agent config set cooldown_seconds 30

# Disable sounds
chief-of-agent config set sound_enabled false

# Set quiet hours (no notifications between 11pm and 7am)
chief-of-agent config set quiet_hours '{"start":"23:00","end":"07:00"}'
```

Config is stored at `~/.chief-of-agent/config.json`. State is tracked at `~/.chief-of-agent/state.json`.

---

## How It Works

Claude Code exposes a hooks system in `~/.claude/settings.json`. Chief of Agent registers handlers for five hook types:

| Hook | Fires when |
|------|-----------|
| `Notification` | Agent sends a notification (permission request, message) |
| `Stop` | Agent session ends normally |
| `PostToolUseFailure` | A tool call fails (bash error, file write failure, etc.) |
| `SessionStart` | A new Claude Code session opens |
| `SessionEnd` | A session closes |

Each hook calls the `chief-of-agent` binary with the event type and the JSON payload from Claude Code's stdin. The binary updates session state atomically (with file locking) and fires the appropriate macOS notification and sound.

---

## Menu Bar App (Phase 2)

A native macOS menu bar app that gives you at-a-glance status for all Claude Code sessions.

- **Menu bar icon** with red badge showing how many agents need attention
- **Dropdown** with all active sessions — status dots, project names, time-ago, context
- **Real notification banners** via macOS native UNUserNotificationCenter
- **Click to jump** — click a session row or notification to bring Warp to foreground
- **Quiet hours** — suppress notifications during configured hours
- **Launch at login** — starts automatically with your Mac

### Install

```bash
./scripts/install-macos.sh
```

This builds the Swift package, creates a proper `.app` bundle in `~/Applications/`, and reports success. First launch will ask for notification permission.

**Requirements:** macOS 14+ (Sonoma), Swift 5.9+ (included with Xcode 15+)

### Build from Source

```bash
cd macos
swift build          # debug build
swift test           # run unit tests (11 tests)
swift build -c release  # release build
```

---

## Roadmap

**Phase 3 — Web Control Tower**
A local web UI where you can see all sessions, read full context, and respond to agents directly from your browser.

**Phase 4 — Auto-Approval Engine**
An AI-powered policy layer. Define rules like "auto-approve git commands in read-only repos" and let the engine handle routine approvals without interrupting you.

---

## Contributing

PRs welcome. The areas most needed:

- **Linux support** — `notify-send` integration for Ubuntu/Debian
- **Windows support** — PowerShell notification support
- **Sound customization** — user-defined sounds per event type

Please read the source in `src/` before opening a PR — the architecture is intentional and the security constraints (no `execSync` with interpolated strings, always `execFileSync` with argument arrays) are non-negotiable.

---

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Dio Atmando](https://dioatmando.com). Built with [Claude Code](https://claude.ai/code).
