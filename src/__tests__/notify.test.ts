import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationDispatcher } from '../notify.js';
import type { EventType } from '../parser.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('NotificationDispatcher', () => {
  let dispatcher: NotificationDispatcher;
  let tmpDir: string;
  let cooldownPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-notify-'));
    cooldownPath = path.join(tmpDir, 'cooldowns.json');
    dispatcher = new NotificationDispatcher({
      sounds: {
        permission: '/System/Library/Sounds/Ping.aiff',
        error: '/System/Library/Sounds/Basso.aiff',
        stop: '/System/Library/Sounds/Glass.aiff',
        idle: '/System/Library/Sounds/Ping.aiff',
      },
      cooldown_seconds: 10,
      quiet_hours: { start: '03:00', end: '04:00' },
      sound_enabled: true,
      notification_enabled: true,
    }, cooldownPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sends notification via terminal-notifier for permission event', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'permission', project: 'gis-erp',
      cwd: '/path', context: 'Bash: git push', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.arrayContaining(['-title', 'Chief of Agent', '-subtitle', 'gis-erp needs approval']),
    );
  });

  it('includes sound name from config in notification', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'error', project: 'secbot',
      cwd: '/path', context: 'Bash: npm test', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.arrayContaining(['-sound', 'Basso']),
    );
  });

  it('activates Warp on notification click', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'permission', project: 'proj',
      cwd: '/path', context: 'test', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.arrayContaining(['-activate', 'dev.warp.Warp-Stable']),
    );
  });

  it('groups notifications by session', () => {
    dispatcher.dispatch({
      sessionId: 'abc123', eventType: 'permission', project: 'proj',
      cwd: '/path', context: 'test', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.arrayContaining(['-group', 'coa-abc123']),
    );
  });

  it('suppresses duplicate notification within cooldown', () => {
    const event = { sessionId: 'abc', eventType: 'permission' as EventType, project: 'proj', cwd: '/path', raw: {} };
    dispatcher.dispatch(event);
    dispatcher.dispatch(event);
    const calls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'terminal-notifier');
    expect(calls.length).toBe(1);
  });

  it('allows notification from different session within cooldown', () => {
    dispatcher.dispatch({ sessionId: 'abc', eventType: 'permission', project: 'proj1', cwd: '/path1', raw: {} });
    dispatcher.dispatch({ sessionId: 'def', eventType: 'permission', project: 'proj2', cwd: '/path2', raw: {} });
    const calls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'terminal-notifier');
    expect(calls.length).toBe(2);
  });

  it('skips sound when sound_enabled is false', () => {
    dispatcher = new NotificationDispatcher({
      sounds: { permission: '/System/Library/Sounds/Ping.aiff', error: '/System/Library/Sounds/Basso.aiff', stop: '/System/Library/Sounds/Glass.aiff', idle: '/System/Library/Sounds/Ping.aiff' },
      cooldown_seconds: 10, quiet_hours: { start: '03:00', end: '04:00' },
      sound_enabled: false, notification_enabled: true,
    }, cooldownPath);
    dispatcher.dispatch({ sessionId: 'abc', eventType: 'error', project: 'proj', cwd: '/path', raw: {} });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.not.arrayContaining(['-sound']),
    );
  });
});
