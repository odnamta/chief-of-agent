import fs from 'node:fs';
import path from 'node:path';

export interface Config {
  sounds: { permission: string; error: string; stop: string; idle: string; };
  cooldown_seconds: number;
  quiet_hours: { start: string; end: string };
  sound_enabled: boolean;
  notification_enabled: boolean;
  cost_alert_threshold: number;
}

const DEFAULTS: Config = {
  sounds: {
    permission: '/System/Library/Sounds/Ping.aiff',
    error: '/System/Library/Sounds/Basso.aiff',
    stop: '/System/Library/Sounds/Glass.aiff',
    idle: '/System/Library/Sounds/Ping.aiff',
  },
  cooldown_seconds: 10,
  quiet_hours: { start: '23:00', end: '07:00' },
  sound_enabled: true,
  notification_enabled: true,
  cost_alert_threshold: 5,
};

export class ConfigManager {
  private configDir: string;
  private configPath: string;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.configPath = path.join(configDir, 'config.json');
  }

  load(): Config {
    if (!fs.existsSync(this.configPath)) {
      return { ...DEFAULTS, sounds: { ...DEFAULTS.sounds } };
    }
    const content = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    return { ...DEFAULTS, ...content, sounds: { ...DEFAULTS.sounds, ...(content.sounds || {}) } };
  }

  private static readonly ALLOWED_KEYS = new Set([
    'cooldown_seconds', 'quiet_hours', 'sound_enabled', 'notification_enabled',
    'sounds', 'cost_alert_threshold',
  ]);

  set(key: string, value: unknown): void {
    if (!ConfigManager.ALLOWED_KEYS.has(key)) {
      throw new Error(`Unknown config key: "${key}". Allowed: ${[...ConfigManager.ALLOWED_KEYS].join(', ')}`);
    }
    const cfg = this.load();
    (cfg as unknown as Record<string, unknown>)[key] = value;
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2));
  }

  isInQuietHours(): boolean {
    const cfg = this.load();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = cfg.quiet_hours.start.split(':').map(Number);
    const [endH, endM] = cfg.quiet_hours.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}
