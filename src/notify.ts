import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { HookEvent, EventType } from './parser.js';
import type { Config } from './config.js';

const TITLES: Record<EventType, string> = {
  permission: 'needs approval', idle: 'is idle', error: 'hit an error',
  stop: 'finished', session_start: 'started', session_end: 'ended',
};

export class NotificationDispatcher {
  private config: Config;
  private cooldownPath: string;

  constructor(config: Config, cooldownPath?: string) {
    this.config = config;
    this.cooldownPath = cooldownPath || path.join(os.homedir(), '.chief-of-agent', 'cooldowns.json');
  }

  private loadCooldowns(): Record<string, number> {
    try {
      if (fs.existsSync(this.cooldownPath)) {
        return JSON.parse(fs.readFileSync(this.cooldownPath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  private saveCooldown(sessionId: string): void {
    const cooldowns = this.loadCooldowns();
    cooldowns[sessionId] = Date.now();
    const cutoff = Date.now() - 3600000;
    for (const [k, v] of Object.entries(cooldowns)) {
      if (v < cutoff) delete cooldowns[k];
    }
    try { fs.writeFileSync(this.cooldownPath, JSON.stringify(cooldowns)); } catch { /* ignore */ }
  }

  private isOnCooldown(sessionId: string): boolean {
    const cooldowns = this.loadCooldowns();
    const last = cooldowns[sessionId];
    if (!last) return false;
    return Date.now() - last < this.config.cooldown_seconds * 1000;
  }

  dispatch(event: HookEvent): void {
    if (event.eventType === 'session_start' || event.eventType === 'session_end') return;
    if (this.isOnCooldown(event.sessionId)) return;
    this.saveCooldown(event.sessionId);

    // Sound via afplay — plays directly through audio system, NOT affected by Focus mode
    if (this.config.sound_enabled) {
      const soundKey = event.eventType as keyof Config['sounds'];
      const soundPath = this.config.sounds[soundKey];
      if (soundPath) {
        try { execFileSync('afplay', [soundPath]); } catch { /* silent */ }
      }
    }

    // Visual notification via terminal-notifier — may be blocked by Focus mode
    if (this.config.notification_enabled) {
      const subtitle = `${event.project} ${TITLES[event.eventType]}`;
      const body = event.context || '';

      try {
        execFileSync('terminal-notifier', [
          '-title', 'Chief of Agent',
          '-subtitle', subtitle,
          '-message', body || ' ',
          '-activate', 'dev.warp.Warp-Stable',
          '-group', `coa-${event.sessionId}`,
          '-ignoreDnD',
        ]);
      } catch {
        // Fallback to osascript if terminal-notifier not installed
        try {
          const escapedSubtitle = subtitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const escapedBody = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          execFileSync('osascript', ['-e', `display notification "${escapedBody}" with title "Chief of Agent" subtitle "${escapedSubtitle}"`]);
        } catch { /* silent */ }
      }
    }

  }
}
