import { describe, it, expect } from 'vitest';
import { generateHooksConfig, mergeHooks } from '../setup.js';

describe('setup', () => {
  it('generates valid hooks config', () => {
    const hooks = generateHooksConfig();
    expect(hooks.Notification).toBeDefined();
    expect(hooks.Notification.length).toBe(2);
    expect(hooks.PostToolUseFailure).toBeDefined();
    expect(hooks.Stop).toBeDefined();
    expect(hooks.SessionStart).toBeDefined();
    expect(hooks.SessionEnd).toBeDefined();
  });

  it('hook commands reference chief-of-agent without flags', () => {
    const hooks = generateHooksConfig();
    const hook = hooks.Notification[0].hooks[0];
    const cmd = hook.type === 'command' ? hook.command : '';
    expect(cmd).toBe('chief-of-agent notify');
    expect(cmd).not.toContain('--event');
    expect(cmd).not.toContain('--session');
  });

  it('merges into empty settings', () => {
    const existing = {};
    const result = mergeHooks(existing, generateHooksConfig());
    const hooks = result.hooks as Record<string, unknown>;
    expect(hooks.Notification).toBeDefined();
  });

  it('preserves existing hooks when merging', () => {
    const existing = {
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo existing' }] }] },
    };
    const result = mergeHooks(existing, generateHooksConfig());
    const hooks = result.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>;
    expect(hooks.PreToolUse).toBeDefined();
    expect(hooks.PreToolUse[0].hooks[0].command).toBe('echo existing');
    expect(hooks.Notification).toBeDefined();
  });

  it('replaces existing chief-of-agent hooks on re-run', () => {
    const existing = {
      hooks: { Notification: [{ matcher: 'permission_prompt', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] }] },
    };
    const result = mergeHooks(existing, generateHooksConfig());
    const hooks = result.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>;
    const permHooks = hooks.Notification.filter((h: { matcher: string }) => h.matcher === 'permission_prompt');
    expect(permHooks.length).toBe(1);
  });
});
