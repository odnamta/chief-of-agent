# Changelog

All notable changes to Chief of Agent will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
