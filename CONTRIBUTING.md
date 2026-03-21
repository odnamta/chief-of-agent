# Contributing to Chief of Agent

Thanks for your interest in contributing! Chief of Agent is an agent governance platform for Claude Code.

## Development Setup

### Prerequisites
- **Node.js 18+** — CLI and dashboard
- **Swift 5.9+ / Xcode 15+** — macOS menu bar app
- **macOS 14+ (Sonoma)** — required for the menu bar app

### Getting Started

```bash
# Clone
git clone https://github.com/odnamta/chief-of-agent.git
cd chief-of-agent

# CLI
npm install
npm run build
npm test              # 97 tests

# macOS app
cd macos
swift build
swift test            # 31 tests

# Dashboard
cd dashboard
npm install
npm run dev           # localhost:3400
```

### Install hooks for testing
```bash
npm run build
node dist/cli.js setup --dashboard --auto
```

## Code Structure

| Directory | What | Language |
|-----------|------|----------|
| `src/` | CLI + hooks + rules engine | TypeScript |
| `macos/` | Menu bar app | Swift/SwiftUI |
| `dashboard/` | Web dashboard | Next.js 15 / React 19 |
| `scripts/` | Build + install scripts | Bash |

## Security Rules

These are non-negotiable:

1. **Always use `execFileSync`** with argument arrays — never `execSync` with string interpolation
2. **Validate all requestIds** as UUID format before using in file paths
3. **Shell escape** all user-provided strings (use POSIX single-quote wrapping)
4. **HookServer binds to 127.0.0.1 only** — never expose to network
5. **No secrets in code** — use environment variables

## Pull Request Process

1. Fork the repo and create a feature branch
2. Write tests for new features (vitest for TS, swift-testing for Swift)
3. Run all tests: `npm test` + `cd macos && swift test`
4. Follow conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`
5. Keep PRs focused — one feature or fix per PR

## What to Contribute

- Bug fixes (especially edge cases in pending action flow)
- New default rules for `policies.json`
- Local summary patterns in `LocalSummarizer.swift`
- Terminal app support beyond Warp/iTerm2/Terminal.app
- Dashboard UI improvements
- Documentation improvements
