# Chief of Agent — Phase 3: Control Tower Design Spec

**Date:** 2026-03-16
**Author:** Dio Atmando
**Status:** Approved
**Repo:** odnamta/chief-of-agent (same repo, `dashboard/` directory)

## Problem

Phase 1+2 notify you when an agent needs attention (sounds + menu bar). But you still have to switch to Warp, find the right tab, and type a response. With 8+ tabs, this context switch breaks flow and wastes time.

## Solution

A web dashboard (localhost:3400) that shows all agents and their pending requests. You approve or deny permission prompts directly from the browser. The response is piped back to Claude Code natively via the `PreToolUse` hook — no clipboard hacks, no AppleScript injection.

## Key Insight

Claude Code's `PreToolUse` hook fires before every tool invocation and can return a `permissionDecision` of `allow`, `deny`, or `ask`. The hook command can block, wait for the dashboard response, and return the decision. The hook IS the response pipe.

## Filtering Strategy

`PreToolUse` fires on ALL tool calls, not just permission prompts. Without filtering, every Read, Grep, and Glob would block waiting for dashboard approval. The solution:

**Matcher-based filtering:** The hook config uses regex matchers to only intercept tools that commonly need permission:

```json
{ "matcher": "Bash|Edit|Write" }
```

This means only Bash, Edit, and Write tool calls go through the dashboard. Read, Grep, Glob, and other safe tools pass through unaffected.

**Dashboard-not-running fast path:** If localhost:3400 is unreachable, the CLI returns `permissionDecision: "ask"` immediately (falls back to normal terminal prompt). No blocking, no delay.

## Architecture

```
Phase 1 (unchanged): hooks → CLI → state.json → sounds
Phase 2 (unchanged): state.json → Menu Bar App → native notifications
Phase 3 (new):       PreToolUse hook (Bash|Edit|Write) → CLI respond → Dashboard → User → CLI returns decision
```

### Components

1. **Dashboard** — Next.js app on localhost:3400
   - Shows all agent sessions (reads state.json)
   - Shows pending permission requests in real-time
   - Approve/Deny/Ask-in-Terminal buttons that resolve pending requests
   - SSE (Server-Sent Events) for real-time updates

2. **Response Server** — API routes in the Next.js dashboard
   - `POST /api/pending` — CLI pushes a new pending request (long-poll, resolves when user responds)
   - `GET /api/pending` — Dashboard fetches all pending requests
   - `POST /api/respond` — Dashboard sends approve/deny/ask for a request
   - `GET /api/events` — SSE stream for real-time updates
   - `GET /api/sessions` — Returns current state.json contents

3. **CLI `respond` command** — New command in chief-of-agent CLI
   - Called by PreToolUse hook
   - Reads stdin (hook JSON with tool_name, tool_input, session context)
   - Sends HTTP POST to localhost:3400/api/pending with request details
   - **Long-polls** until dashboard returns a response (or timeout)
   - Returns hook-compatible JSON with `permissionDecision`
   - Timeout: 120 seconds (configurable), falls back to `ask` (normal terminal prompt)

4. **Updated hooks config** — New PreToolUse hook added via `chief-of-agent setup`

## Response Pipeline (detailed flow)

```
1. Claude Code wants to run: Bash("git push origin main")
2. PreToolUse hook fires (matcher: "Bash" matches)
3. Hook runs: chief-of-agent respond (reads stdin JSON)
4. CLI extracts: session_id, tool_name, tool_input from stdin
5. CLI sends HTTP POST to http://localhost:3400/api/pending:
   {
     "requestId": "uuid",
     "sessionId": "abc123",
     "project": "secbot",
     "tool": "Bash",
     "detail": "git push origin main",
     "timestamp": "ISO8601"
   }
6. Dashboard receives via SSE → shows pending card with [Approve] [Deny] [Terminal]
7. User clicks [Approve]
8. Dashboard POST /api/respond: { "requestId": "uuid", "decision": "allow" }
9. /api/pending long-poll resolves → returns to CLI
10. CLI outputs JSON to stdout:
    {
      "hookSpecificOutput": {
        "permissionDecision": "allow"
      }
    }
11. Claude Code reads output → permission granted → runs git push
```

### Timeout Behavior

If the user doesn't respond within 120 seconds:
- CLI returns `{ "hookSpecificOutput": { "permissionDecision": "ask" } }`
- Claude Code shows the normal terminal permission prompt
- User responds in terminal as before (Phase 1 behavior)

### Dashboard Not Running

If localhost:3400 is unreachable:
- CLI's HTTP POST fails immediately (connection refused)
- CLI returns `{ "hookSpecificOutput": { "permissionDecision": "ask" } }`
- Normal terminal prompt — no degradation, no delay

### Dashboard Process Crash

If the Next.js process crashes while a CLI respond command is long-polling:
- CLI's fetch gets a connection reset error
- Caught by try/catch → returns `permissionDecision: "ask"`
- All in-memory pending requests are lost (acceptable — they get re-created when the hook fires again)

## Hook Configuration

Added to `~/.claude/settings.json` via `chief-of-agent setup`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "chief-of-agent respond",
          "timeout": 120
        }]
      }
    ]
  }
}
```

This is additive — all existing Phase 1 hooks (Notification, PostToolUse, PostToolUseFailure, Stop, SessionStart, SessionEnd) remain unchanged. The matcher ensures only Bash, Edit, and Write trigger the dashboard flow.

**Important:** This hook is only added when the user runs `chief-of-agent setup --dashboard`. It is NOT installed by default `chief-of-agent setup` (which only installs Phase 1 hooks). This prevents Phase 3 from affecting users who haven't set up the dashboard.

## Dashboard UI

### Layout

```
┌─────────────────────────────────────────────────────┐
│ 🤖 Chief of Agent — Control Tower    5 active · 2 pending │
├─────────────────────────────────────────────────────┤
│ PENDING ACTIONS                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🟡 secbot · 30s ago                             │ │
│ │ Permission: Bash                                 │ │
│ │ ┌─────────────────────────────────────────────┐ │ │
│ │ │ git push origin main                        │ │ │
│ │ └─────────────────────────────────────────────┘ │ │
│ │                   [Approve] [Deny] [Terminal]   │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ ALL AGENTS (2x grid)                                 │
│ 🟢 gis-erp  🟢 migration  🟢 cekatan  🔴 website  │
└─────────────────────────────────────────────────────┘
```

### Pending Action Card

Each pending request shows:
- Agent name + project
- Time waiting
- Tool name (Bash, Edit, Write)
- Tool detail:
  - Bash: the command string (`tool_input.command`)
  - Edit: file path + old_string preview (`tool_input.file_path`)
  - Write: file path (`tool_input.file_path`)
- **[Approve]** button (green) — sends `allow`
- **[Deny]** button (gray) — sends `deny`
- **[Terminal]** button (outline) — sends `ask` (falls back to terminal prompt)

### Agent Grid

- 2-column grid showing all sessions from state.json
- Color-coded status dot
- Project name + status + time since last event

### Real-time Updates

- SSE on `/api/events` for pending request lifecycle (new, resolved)
- `/api/sessions` polled every 2 seconds for agent status updates
- Pending requests ONLY come via SSE + initial GET on page load

## Tech Stack

- **Framework:** Next.js 14+ (App Router) — Dio's stack
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Real-time:** SSE (Server-Sent Events) — simpler than WebSocket for one-way push
- **State:** In-memory pending requests (Map of Promises), state.json for agent sessions
- **Port:** 3400 (doesn't conflict with existing services)

**Note:** The in-memory Map of pending request Promises requires the Next.js process to stay alive between requests. This works in both dev mode (`next dev`) and production (`next start`) since both run a single Node.js process. A process restart loses all pending requests — this is acceptable since the CLI's long-poll will get a connection reset and fall back to terminal.

## Project Structure

```
chief-of-agent/
├── src/                          # Phase 1 CLI (TypeScript)
├── macos/                        # Phase 2 Menu Bar App (Swift)
├── dashboard/                    # Phase 3 Control Tower (Next.js)
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout (dark theme)
│   │   │   ├── page.tsx          # Main dashboard page
│   │   │   ├── api/
│   │   │   │   ├── pending/route.ts    # GET pending, POST new pending (long-poll)
│   │   │   │   ├── respond/route.ts    # POST approve/deny/ask
│   │   │   │   ├── events/route.ts     # GET SSE stream
│   │   │   │   └── sessions/route.ts   # GET state.json contents
│   │   ├── components/
│   │   │   ├── PendingCard.tsx         # Single pending action card
│   │   │   ├── AgentGrid.tsx           # Agent status grid
│   │   │   └── Header.tsx              # Top bar with counts
│   │   └── lib/
│   │       ├── pending-store.ts        # In-memory pending request store (Map of Promises)
│   │       ├── state-reader.ts         # Reads ~/.chief-of-agent/state.json
│   │       └── types.ts               # Shared types
├── package.json                  # Phase 1 CLI
└── CLAUDE.md
```

## API Routes

### POST /api/pending

Called by `chief-of-agent respond`. Long-polls until resolved or timeout.

Request:
```json
{
  "requestId": "uuid",
  "sessionId": "abc123",
  "project": "secbot",
  "tool": "Bash",
  "detail": "git push origin main",
  "timestamp": "2026-03-16T12:00:00.000Z"
}
```

Response (when user responds on dashboard):
```json
{ "decision": "allow" }
```

Response (on timeout — 120s):
```json
{ "decision": "ask" }
```

Implementation: Creates a Promise, stores its `resolve` callback in a Map keyed by `requestId`. When `/api/respond` is called with the matching `requestId`, it resolves the Promise. Timeout resolves with `"ask"`.

### POST /api/respond

Called by the dashboard UI when user clicks Approve/Deny/Terminal.

Request:
```json
{
  "requestId": "uuid",
  "decision": "allow"
}
```

Response:
```json
{ "ok": true }
```

### GET /api/events

SSE stream. Events:
- `pending:new` — new pending request arrived (includes full request data)
- `pending:resolved` — request was approved/denied/asked

### GET /api/sessions

Returns current state.json contents for the agent grid.

### GET /api/pending

Returns all currently pending requests (for initial page load).

## CLI `respond` Command

New command added to `src/cli.ts`:

```typescript
program
  .command('respond')
  .description('Handle PreToolUse hook — blocks until dashboard responds')
  .action(async () => {
    const input = await readStdin();
    const raw = JSON.parse(input);
    const requestId = randomUUID();

    try {
      const response = await fetch('http://localhost:3400/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          sessionId: raw.session_id,
          project: deriveProject(raw.cwd),
          tool: raw.tool_name || 'Unknown',
          detail: extractDetail(raw),
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(120000),
      });

      const result = await response.json();
      if (result.decision === 'allow' || result.decision === 'deny') {
        const output = {
          hookSpecificOutput: {
            permissionDecision: result.decision,
          },
        };
        // Add context message when denying
        if (result.decision === 'deny') {
          output.systemMessage = 'User denied this action via Control Tower dashboard';
        }
        console.log(JSON.stringify(output));
      }
      // "ask" or unknown → no output, falls through to terminal prompt
    } catch {
      // Dashboard not running, timeout, or crash → fall through to terminal
      console.log(JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'ask' },
      }));
    }
  });
```

### `extractDetail` helper

```typescript
function extractDetail(raw: Record<string, unknown>): string {
  const input = raw.tool_input as Record<string, unknown> | undefined;
  if (!input) return '';

  // Bash: show the command
  if (input.command) return String(input.command).slice(0, 500);

  // Edit/Write: show the file path
  if (input.file_path) return String(input.file_path);

  // Fallback: JSON preview
  return JSON.stringify(input).slice(0, 200);
}
```

## Success Criteria

- [ ] Dashboard shows all active sessions from state.json
- [ ] Pending permission requests appear in real-time when PreToolUse hook fires
- [ ] Clicking Approve sends "allow" back to Claude Code within 1 second
- [ ] Clicking Deny sends "deny" back with systemMessage context
- [ ] Clicking Terminal sends "ask" → falls back to terminal prompt
- [ ] Timeout (120s) falls back to terminal prompt via `permissionDecision: "ask"`
- [ ] Dashboard not running → immediate `ask` fallback, no delay
- [ ] Multiple pending requests from different sessions handled simultaneously
- [ ] SSE updates dashboard in real-time
- [ ] Only Bash/Edit/Write trigger the dashboard (Read/Grep/Glob pass through)
- [ ] Works alongside Phase 1 (sounds) and Phase 2 (menu bar) without conflicts
- [ ] `chief-of-agent setup --dashboard` adds PreToolUse hook without breaking existing hooks
- [ ] Regular `chief-of-agent setup` does NOT install PreToolUse hook

## Non-Goals (Phase 3)

- No text input responses (only allow/deny/ask for permissions)
- No auto-approval rules (Phase 4)
- No AI decision-making (Phase 4)
- No mobile responsiveness (MacBook only)
- No authentication (localhost only)
- No persistent history (pending requests are in-memory only)
- No custom tool matchers (hardcoded Bash|Edit|Write for now)
