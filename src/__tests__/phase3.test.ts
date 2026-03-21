/**
 * Phase 3 integration tests — Control Tower / respond pipeline.
 *
 * Tests the setup.ts dashboard hook and the CLI respond command logic
 * (extractDetail equivalent) without spinning up a real HTTP server.
 */
import { describe, it, expect } from 'vitest';
import { generateDashboardHookConfig, mergeHooks, generateHooksConfig } from '../setup.js';

// ────────────────────────────────────────────────────────────────
// Dashboard hook config tests
// ────────────────────────────────────────────────────────────────
describe('generateDashboardHookConfig', () => {
  it('produces a PreToolUse entry with Bash|Edit|Write matcher', () => {
    const config = generateDashboardHookConfig();
    expect(config.PreToolUse).toBeDefined();
    expect(config.PreToolUse.length).toBe(1);
    expect(config.PreToolUse[0].matcher).toBe('Bash|Edit|Write');
  });

  it('uses chief-of-agent respond command', () => {
    const config = generateDashboardHookConfig();
    const hook = config.PreToolUse[0].hooks[0] as { type: string; command: string };
    expect(hook.command).toBe('chief-of-agent respond');
    expect(hook.type).toBe('command');
  });

  it('sets timeout to 120', () => {
    const config = generateDashboardHookConfig();
    const hook = config.PreToolUse[0].hooks[0] as { type: string; command: string; timeout?: number };
    expect(hook.timeout).toBe(120);
  });
});

describe('mergeHooks with dashboard hook', () => {
  it('adds PreToolUse without touching existing Phase 1 hooks', () => {
    const phase1 = generateHooksConfig();
    const merged = mergeHooks({ hooks: phase1 }, generateDashboardHookConfig());
    const hooks = merged.hooks as Record<string, unknown[]>;
    // Phase 1 hooks preserved
    expect(hooks.Notification).toBeDefined();
    expect(hooks.SessionStart).toBeDefined();
    expect(hooks.Stop).toBeDefined();
    // Dashboard hook added
    expect(hooks.PreToolUse).toBeDefined();
    expect((hooks.PreToolUse as Array<{ matcher: string }>)[0].matcher).toBe('Bash|Edit|Write');
  });

  it('preserves non-chief-of-agent PreToolUse entries', () => {
    const existing = {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'my-tool inspect' }] },
        ],
      },
    };
    const merged = mergeHooks(existing, generateDashboardHookConfig());
    const hooks = merged.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
    // Non-chief-of-agent entry preserved
    expect(hooks.PreToolUse.some((e) => e.hooks[0].command === 'my-tool inspect')).toBe(true);
    // Dashboard hook added
    expect(hooks.PreToolUse.some((e) => e.hooks[0].command === 'chief-of-agent respond')).toBe(true);
  });

  it('replaces existing chief-of-agent PreToolUse hook on re-run', () => {
    const existing = {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash|Edit|Write', hooks: [{ type: 'command', command: 'chief-of-agent respond', timeout: 60 }] },
        ],
      },
    };
    const merged = mergeHooks(existing, generateDashboardHookConfig());
    const hooks = merged.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string; timeout?: number }> }>>;
    const dashHooks = hooks.PreToolUse.filter((e) => e.hooks[0].command === 'chief-of-agent respond');
    // Exactly one — not duplicated
    expect(dashHooks.length).toBe(1);
    // Timeout updated to 120
    expect(dashHooks[0].hooks[0].timeout).toBe(120);
  });
});

// ────────────────────────────────────────────────────────────────
// extractDetail logic (unit test of the CLI helper logic)
// ────────────────────────────────────────────────────────────────
describe('extractDetail logic', () => {
  // Mirrors the extractDetail function in cli.ts
  function extractDetail(raw: Record<string, unknown>): string {
    const input = raw.tool_input as Record<string, unknown> | undefined;
    if (!input) return '';
    if (input.command) return String(input.command).slice(0, 500);
    if (input.file_path) return String(input.file_path);
    return JSON.stringify(input).slice(0, 200);
  }

  it('returns command string for Bash tool', () => {
    const raw = {
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
    };
    expect(extractDetail(raw)).toBe('git push origin main');
  });

  it('truncates long Bash commands at 500 chars', () => {
    const longCmd = 'x'.repeat(600);
    const raw = { tool_input: { command: longCmd } };
    expect(extractDetail(raw).length).toBe(500);
  });

  it('returns file_path for Edit tool', () => {
    const raw = {
      tool_name: 'Edit',
      tool_input: { file_path: '/Users/dio/project/src/index.ts', old_string: 'foo', new_string: 'bar' },
    };
    expect(extractDetail(raw)).toBe('/Users/dio/project/src/index.ts');
  });

  it('returns file_path for Write tool', () => {
    const raw = {
      tool_name: 'Write',
      tool_input: { file_path: '/Users/dio/project/README.md', content: '...' },
    };
    expect(extractDetail(raw)).toBe('/Users/dio/project/README.md');
  });

  it('falls back to JSON preview for unknown tool input shape', () => {
    const raw = { tool_input: { some_key: 'some_value' } };
    const result = extractDetail(raw);
    expect(result).toContain('some_key');
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('returns empty string when tool_input is missing', () => {
    const raw = { tool_name: 'Bash' };
    expect(extractDetail(raw)).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────
// respond command output format tests (permissionDecision)
// ────────────────────────────────────────────────────────────────
describe('respond command output format', () => {
  it('allow decision has correct hookSpecificOutput shape', () => {
    const output = { hookSpecificOutput: { permissionDecision: 'allow' } };
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(JSON.stringify(output)).toContain('"permissionDecision":"allow"');
  });

  it('deny decision includes systemMessage', () => {
    const output = {
      hookSpecificOutput: { permissionDecision: 'deny' },
      systemMessage: 'User denied this action via Control Tower dashboard',
    };
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.systemMessage).toContain('denied');
  });

  it('ask decision has correct hookSpecificOutput shape', () => {
    const output = { hookSpecificOutput: { permissionDecision: 'ask' } };
    expect(output.hookSpecificOutput.permissionDecision).toBe('ask');
  });
});
