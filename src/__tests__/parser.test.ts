import { describe, it, expect } from 'vitest';
import { parseHookInput, type HookEvent } from '../parser.js';

describe('parseHookInput', () => {
  it('parses Notification permission_prompt event', () => {
    const input = JSON.stringify({
      session_id: 'abc123',
      hook_event_name: 'Notification',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
      transcript_path: '/tmp/transcript.jsonl',
      permission_mode: 'default',
      notification_type: 'permission_prompt',
      message: 'Bash: git push origin main',
    });
    const event = parseHookInput(input);
    expect(event.sessionId).toBe('abc123');
    expect(event.eventType).toBe('permission');
    expect(event.project).toBe('gis-erp');
    expect(event.context).toBe('Bash: git push origin main');
    expect(event.cwd).toBe('/Users/dio/Vibecode/gama/gis-erp');
  });

  it('parses Notification idle_prompt event', () => {
    const input = JSON.stringify({
      session_id: 'abc123',
      hook_event_name: 'Notification',
      cwd: '/Users/dio/Vibecode/experiments/secbot',
      notification_type: 'idle_prompt',
    });
    const event = parseHookInput(input);
    expect(event.eventType).toBe('idle');
    expect(event.project).toBe('secbot');
  });

  it('parses PostToolUseFailure event', () => {
    const input = JSON.stringify({
      session_id: 'def456',
      hook_event_name: 'PostToolUseFailure',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      error: 'Process exited with code 1',
    });
    const event = parseHookInput(input);
    expect(event.eventType).toBe('error');
    expect(event.context).toBe('Bash: npm test — Process exited with code 1');
  });

  it('parses Stop event', () => {
    const input = JSON.stringify({
      session_id: 'ghi789',
      hook_event_name: 'Stop',
      cwd: '/Users/dio/project',
      stop_hook_active: false,
      last_assistant_message: 'Done! All tests pass.',
    });
    const event = parseHookInput(input);
    expect(event.eventType).toBe('stop');
    expect(event.context).toBe('Done! All tests pass.');
  });

  it('parses SessionStart event', () => {
    const input = JSON.stringify({
      session_id: 'new123',
      hook_event_name: 'SessionStart',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
      source: 'startup',
    });
    const event = parseHookInput(input);
    expect(event.eventType).toBe('session_start');
    expect(event.project).toBe('gis-erp');
  });

  it('parses SessionEnd event', () => {
    const input = JSON.stringify({
      session_id: 'old123',
      hook_event_name: 'SessionEnd',
      cwd: '/Users/dio/project',
    });
    const event = parseHookInput(input);
    expect(event.eventType).toBe('session_end');
  });

  it('derives project name from last cwd segment', () => {
    const input = JSON.stringify({
      session_id: 'x',
      hook_event_name: 'Stop',
      cwd: '/deep/nested/path/my-project',
    });
    const event = parseHookInput(input);
    expect(event.project).toBe('my-project');
  });

  it('truncates long context to 100 chars', () => {
    const longMessage = 'A'.repeat(200);
    const input = JSON.stringify({
      session_id: 'x',
      hook_event_name: 'Stop',
      cwd: '/project',
      last_assistant_message: longMessage,
    });
    const event = parseHookInput(input);
    expect(event.context!.length).toBeLessThanOrEqual(103);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseHookInput('not json')).toThrow();
  });

  it('throws on missing session_id', () => {
    expect(() => parseHookInput(JSON.stringify({
      hook_event_name: 'Stop',
      cwd: '/project',
    }))).toThrow();
  });

  it('throws on missing hook_event_name', () => {
    expect(() => parseHookInput(JSON.stringify({
      session_id: 'x',
      cwd: '/project',
    }))).toThrow();
  });

  it('defaults to unknown project when cwd is missing', () => {
    const input = JSON.stringify({
      session_id: 'x',
      hook_event_name: 'Stop',
    });
    const event = parseHookInput(input);
    expect(event.project).toBe('unknown');
  });
});
