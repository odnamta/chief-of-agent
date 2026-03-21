import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface CommandHook {
  type: 'command';
  command: string;
  async?: boolean;
  timeout?: number;
}

interface HTTPHook {
  type: 'http';
  url: string;
  timeout?: number;
}

interface HookEntry {
  matcher: string;
  hooks: Array<CommandHook | HTTPHook>;
}
type HooksConfig = Record<string, HookEntry[]>;

export function generateHooksConfig(): HooksConfig {
  return {
    Notification: [
      { matcher: 'permission_prompt', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] },
      { matcher: 'idle_prompt', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] },
    ],
    PostToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent notify', async: true }] }],
    PostToolUseFailure: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] }],
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent notify' }] }],
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent register', async: true }] }],
    SessionEnd: [{ matcher: '', hooks: [{ type: 'command', command: 'chief-of-agent unregister', async: true }] }],
  };
}

function isChiefOfAgentHook(entry: HookEntry): boolean {
  return entry.hooks.some((h) => {
    if (h.type === 'command' && 'command' in h) return (h as CommandHook).command.startsWith('chief-of-agent');
    if (h.type === 'http' && 'url' in h) return (h as HTTPHook).url.includes('19222');
    return false;
  });
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

/**
 * Generates the PreToolUse hook config for Control Tower permission routing.
 * Only called when user runs `chief-of-agent setup --dashboard`.
 */
export function generateDashboardHookConfig(): HooksConfig {
  return {
    PreToolUse: [
      {
        matcher: 'Bash|Edit|Write',
        hooks: [{ type: 'command', command: 'chief-of-agent respond', timeout: 120 }],
      },
    ],
  };
}

/**
 * Generates HTTP hook config for the macOS menu bar app's HookServer.
 * Events are POSTed directly to localhost:19222 — no Node.js spawn (~5ms vs ~200ms).
 * Only called when user runs `chief-of-agent setup --http`.
 */
export function generateHTTPHookConfig(): HooksConfig {
  return {
    PreToolUse: [
      {
        matcher: 'Bash|Edit|Write',
        hooks: [{ type: 'http', url: 'http://127.0.0.1:19222/hook', timeout: 30 }],
      },
    ],
    // Also send session events via HTTP for faster state updates
    SessionStart: [
      {
        matcher: '',
        hooks: [{ type: 'http', url: 'http://127.0.0.1:19222/hook', timeout: 5 }],
      },
    ],
    SessionEnd: [
      {
        matcher: '',
        hooks: [{ type: 'http', url: 'http://127.0.0.1:19222/hook', timeout: 5 }],
      },
    ],
  };
}

/**
 * Installs HTTP hooks pointing to the macOS app's HookServer on :19222.
 * Replaces command-based hooks with faster HTTP-based ones.
 */
export function installHTTPHook(): { settingsPath: string } {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }

  const result = mergeHooks(existing, generateHTTPHookConfig());
  fs.writeFileSync(settingsPath, JSON.stringify(result, null, 2));
  return { settingsPath };
}

/**
 * Installs the PreToolUse hook for the Control Tower dashboard.
 * Additive — does not remove existing hooks.
 */
export function installDashboardHook(): { settingsPath: string } {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }

  const result = mergeHooks(existing, generateDashboardHookConfig());
  fs.writeFileSync(settingsPath, JSON.stringify(result, null, 2));
  return { settingsPath };
}
