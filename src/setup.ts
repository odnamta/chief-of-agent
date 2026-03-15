import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface HookEntry {
  matcher: string;
  hooks: Array<{ type: string; command: string; async?: boolean }>;
}
type HooksConfig = Record<string, HookEntry[]>;

export function generateHooksConfig(): HooksConfig {
  return {
    Notification: [
      { matcher: 'permission_prompt', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] },
      { matcher: 'idle_prompt', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] },
    ],
    PostToolUseFailure: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] }],
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] }],
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent register', async: true }] }],
    SessionEnd: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent unregister', async: true }] }],
  };
}

function isChiefOfAgentHook(entry: HookEntry): boolean {
  return entry.hooks.some((h) => h.command.startsWith('chief-of-agent'));
}

export function mergeHooks(existingSettings: Record<string, unknown>, newHooks: HooksConfig): Record<string, unknown> {
  const existing = (existingSettings.hooks || {}) as HooksConfig;
  const merged: HooksConfig = { ...existing };
  for (const [eventName, newEntries] of Object.entries(newHooks)) {
    const existingEntries = merged[eventName] || [];
    const filtered = existingEntries.filter((e) => !isChiefOfAgentHook(e));
    merged[eventName] = [...filtered, ...newEntries];
  }
  return { ...existingSettings, hooks: merged };
}

export function installHooks(): { settingsPath: string; created: boolean } {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
  let existing: Record<string, unknown> = {};
  let created = false;
  if (fs.existsSync(settingsPath)) {
    existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } else { created = true; }
  const result = mergeHooks(existing, generateHooksConfig());
  fs.writeFileSync(settingsPath, JSON.stringify(result, null, 2));
  return { settingsPath, created };
}

export function ensureConfigDir(): string {
  const configDir = path.join(os.homedir(), '.chief-of-agent');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  return configDir;
}
