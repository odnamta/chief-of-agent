import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager, type Config } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ConfigManager', () => {
  let tmpDir: string;
  let config: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-cfg-'));
    config = new ConfigManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const cfg = config.load();
    expect(cfg.sound_enabled).toBe(true);
    expect(cfg.notification_enabled).toBe(true);
    expect(cfg.cooldown_seconds).toBe(10);
    expect(cfg.sounds.permission).toContain('Ping.aiff');
  });

  it('saves and loads custom config', () => {
    config.set('cooldown_seconds', 30);
    const cfg = config.load();
    expect(cfg.cooldown_seconds).toBe(30);
  });

  it('merges partial config with defaults', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ sound_enabled: false }));
    const cfg = config.load();
    expect(cfg.sound_enabled).toBe(false);
    expect(cfg.notification_enabled).toBe(true);
  });

  it('isInQuietHours returns true during quiet period', () => {
    config.set('quiet_hours', { start: '00:00', end: '23:59' });
    expect(config.isInQuietHours()).toBe(true);
  });
});
