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
      cost_alert_threshold: 5,
    }, cooldownPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('plays sound via afplay (bypasses Focus mode)', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'error', project: 'secbot',
      cwd: '/path', context: 'Bash: npm test', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith('afplay', ['/System/Library/Sounds/Basso.aiff']);
  });

  it('sends visual notification via terminal-notifier', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'permission', project: 'gis-erp',
      cwd: '/path', context: 'Bash: git push', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.arrayContaining(['-title', 'Chief of Agent', '-subtitle', 'gis-erp needs approval']),
    );
  });

  it('includes -ignoreDnD to bypass Focus mode', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'permission', project: 'proj',
      cwd: '/path', context: 'test', raw: {},
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'terminal-notifier',
      expect.arrayContaining(['-ignoreDnD']),
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

  it('suppresses duplicate notification within cooldown', () => {
    const event = { sessionId: 'abc', eventType: 'permission' as EventType, project: 'proj', cwd: '/path', raw: {} };
    dispatcher.dispatch(event);
    dispatcher.dispatch(event);
    const notifyCalls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'terminal-notifier');
    expect(notifyCalls.length).toBe(1);
  });

  it('allows notification from different session within cooldown', () => {
    dispatcher.dispatch({ sessionId: 'abc', eventType: 'permission', project: 'proj1', cwd: '/path1', raw: {} });
    dispatcher.dispatch({ sessionId: 'def', eventType: 'permission', project: 'proj2', cwd: '/path2', raw: {} });
    const notifyCalls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'terminal-notifier');
    expect(notifyCalls.length).toBe(2);
  });

  it('skips sound when sound_enabled is false', () => {
    dispatcher = new NotificationDispatcher({
      sounds: { permission: '/System/Library/Sounds/Ping.aiff', error: '/System/Library/Sounds/Basso.aiff', stop: '/System/Library/Sounds/Glass.aiff', idle: '/System/Library/Sounds/Ping.aiff' },
      cooldown_seconds: 10, quiet_hours: { start: '03:00', end: '04:00' },
      sound_enabled: false, notification_enabled: true, cost_alert_threshold: 5,
    }, cooldownPath);
    dispatcher.dispatch({ sessionId: 'abc', eventType: 'error', project: 'proj', cwd: '/path', raw: {} });
    const afplayCalls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'afplay');
    expect(afplayCalls.length).toBe(0);
  });

  it('sound and notification are independent calls', () => {
    dispatcher.dispatch({
      sessionId: 'abc', eventType: 'permission', project: 'proj',
      cwd: '/path', context: 'test', raw: {},
    });
    // Should have both afplay AND terminal-notifier calls
    const afplayCalls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'afplay');
    const notifyCalls = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'terminal-notifier');
    expect(afplayCalls.length).toBe(1);
    expect(notifyCalls.length).toBe(1);
  });
});
