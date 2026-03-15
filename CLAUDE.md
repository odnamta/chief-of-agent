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
