#!/usr/bin/env node
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readStdin } from './stdin.js';
import { parseHookInput } from './parser.js';
import { StateManager } from './state.js';
import { ConfigManager } from './config.js';
import { NotificationDispatcher } from './notify.js';
import { installHooks, installDashboardHook, ensureConfigDir } from './setup.js';

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const stateManager = new StateManager(CONFIG_DIR);
const configManager = new ConfigManager(CONFIG_DIR);

const program = new Command();

program
  .name('chief-of-agent')
  .description('Agent attention manager for Claude Code CLI')
  .version('0.1.0');

program
  .command('notify')
  .description('Process hook event and send notification (reads stdin)')
  .action(async () => {
    try {
      const input = await readStdin();
      const event = parseHookInput(input);
      const config = configManager.load();

      const statusMap: Record<string, 'waiting' | 'error' | 'working'> = {
        permission: 'waiting',
        idle: 'waiting',
        error: 'error',
        stop: 'working',
      };
      const status = statusMap[event.eventType] || 'working';
      await stateManager.updateStatus(
        event.sessionId,
        status,
        `${event.raw.hook_event_name}${event.raw.notification_type ? ':' + event.raw.notification_type : ''}`,
        event.context,
      );

      if (configManager.isInQuietHours()) return;

      const dispatcher = new NotificationDispatcher(config);
      dispatcher.dispatch(event);
    } catch {
      process.exit(0);
    }
  });

program
  .command('register')
  .description('Register a new session (reads stdin)')
  .action(async () => {
    try {
      const input = await readStdin();
      const event = parseHookInput(input);
      await stateManager.register(event.sessionId, event.cwd, event.project);
    } catch {
      process.exit(0);
    }
  });

program
  .command('unregister')
  .description('Unregister a session (reads stdin)')
  .action(async () => {
    try {
      const input = await readStdin();
      const event = parseHookInput(input);
      await stateManager.unregister(event.sessionId);
    } catch {
      process.exit(0);
    }
  });

program
  .command('status')
  .description('Show all registered agent sessions')
  .action(async () => {
    const sessions = await stateManager.getAll();
    const entries = Object.entries(sessions);

    if (entries.length === 0) {
      console.log('No active sessions.');
      return;
    }

    console.log(`\n  Chief of Agent — ${entries.length} active session(s)\n`);

    const statusIcon: Record<string, string> = {
      working: '\u{1F7E2}',
      waiting: '\u{1F7E1}',
      error: '\u{1F534}',
      idle: '\u26AA',
      done: '\u2705',
    };

    for (const [id, session] of entries) {
      const icon = statusIcon[session.status] || '?';
      const shortId = id.slice(0, 8);
      const age = timeSince(new Date(session.last_event_at));
      console.log(`  ${icon} ${session.project.padEnd(20)} ${session.status.padEnd(10)} ${age.padEnd(10)} [${shortId}]`);
      if (session.waiting_context) {
        console.log(`     \u2514\u2500 ${session.waiting_context}`);
      }
    }
    console.log('');
  });

program
  .command('setup')
  .description('Install hooks into ~/.claude/settings.json')
  .option('--dashboard', 'Also install PreToolUse hook for Control Tower permission routing')
  .action((options: { dashboard?: boolean }) => {
    const configDir = ensureConfigDir();
    const { settingsPath, created } = installHooks();

    if (options.dashboard) {
      installDashboardHook();
    }

    const cfgPath = path.join(configDir, 'config.json');
    const config = configManager.load();
    if (!fs.existsSync(cfgPath)) {
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    }

    console.log('\n  Chief of Agent — Setup Complete\n');
    console.log(`  Hooks: ${created ? 'created' : 'merged into'} ${settingsPath}`);
    if (options.dashboard) {
      console.log('  Dashboard hook: PreToolUse (Bash|Edit|Write) → localhost:3400');
    }
    console.log(`  Config: ${cfgPath}`);
    if (options.dashboard) {
      console.log('\n  Control Tower enabled. Start the dashboard: cd dashboard && npm run dev');
    }
    console.log('\n  You\'re all set. Start Claude Code sessions and get notified!\n');
  });

const configCmd = program
  .command('config')
  .description('View or update configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const config = configManager.load();
    console.log(JSON.stringify(config, null, 2));
  });

configCmd
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'config key')
  .argument('<value>', 'value to set')
  .action((key: string, value: string) => {
    let parsed: unknown = value;
    if (value === 'true') parsed = true;
    else if (value === 'false') parsed = false;
    else if (!isNaN(Number(value))) parsed = Number(value);
    configManager.set(key, parsed);
    console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
  });

configCmd.action(() => {
  const config = configManager.load();
  console.log(JSON.stringify(config, null, 2));
});

program
  .command('respond')
  .description('Handle PreToolUse hook — long-polls dashboard for approve/deny/ask decision (reads stdin)')
  .action(async () => {
    let raw: Record<string, unknown>;
    try {
      const input = await readStdin();
      raw = JSON.parse(input) as Record<string, unknown>;
    } catch {
      // Can't parse input — fall through to terminal
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask' } }));
      process.exit(0);
    }

    const requestId = randomUUID();
    const cwd = (raw.cwd as string) || '/unknown';
    const project = cwd.split('/').filter(Boolean).pop() || 'unknown';

    try {
      const body = JSON.stringify({
        requestId,
        sessionId: raw.session_id || 'unknown',
        project,
        tool: raw.tool_name || 'Unknown',
        detail: extractDetail(raw),
        timestamp: new Date().toISOString(),
      });

      const response = await fetch('http://localhost:3400/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120_000),
      });

      const result = await response.json() as { decision?: string };
      const decision = result.decision;

      if (decision === 'allow' || decision === 'deny') {
        const output: Record<string, unknown> = {
          hookSpecificOutput: { permissionDecision: decision },
        };
        if (decision === 'deny') {
          output.systemMessage = 'User denied this action via Control Tower dashboard';
        }
        process.stdout.write(JSON.stringify(output));
      }
      // "ask" or unknown → no output, falls through to terminal
    } catch {
      // Dashboard not running, timeout, connection reset, etc.
      // Return "ask" so Claude Code falls back to terminal prompt
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask' } }));
    }
    process.exit(0);
  });

/**
 * Extracts a human-readable detail string from PreToolUse hook input.
 * Bash: the command string. Edit/Write: the file path. Fallback: JSON preview.
 */
function extractDetail(raw: Record<string, unknown>): string {
  const input = raw.tool_input as Record<string, unknown> | undefined;
  if (!input) return '';
  if (input.command) return String(input.command).slice(0, 500);
  if (input.file_path) return String(input.file_path);
  return JSON.stringify(input).slice(0, 200);
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

program.parse();
