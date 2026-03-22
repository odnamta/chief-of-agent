#!/usr/bin/env node
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { readStdin } from './stdin.js';
import { parseHookInput } from './parser.js';
import { StateManager } from './state.js';
import { ConfigManager } from './config.js';
import { NotificationDispatcher } from './notify.js';
import { installHooks, installDashboardHook, installHTTPHook, uninstallHooks, ensureConfigDir } from './setup.js';
import { loadPolicies, matchRule } from './rules.js';
import { classifyWithAI } from './ai-classifier.js';
import { logAudit, readAudit, suggestRules } from './audit.js';
import { ensurePoliciesFile, writePolicies } from './policies.js';
import { writePendingRequest, removePendingRequest, pollForResponse } from './pending.js';
import type { AuditEntry } from './audit.js';

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
  .description('Show all registered agent sessions and system state')
  .action(async () => {
    const configDir = path.join(os.homedir(), '.chief-of-agent');
    const sessions = await stateManager.getAll();
    const entries = Object.entries(sessions);

    console.log('\n  ╔══════════════════════════════════════╗');
    console.log('  ║        Chief of Agent — Status       ║');
    console.log('  ╚══════════════════════════════════════╝\n');

    // System health
    const policiesFile = path.join(configDir, 'policies.json');
    let ruleCount = 0;
    if (fs.existsSync(policiesFile)) {
      try {
        const pol = JSON.parse(fs.readFileSync(policiesFile, 'utf-8'));
        ruleCount = pol.rules?.length ?? 0;
      } catch { /* ignore */ }
    }

    const pendingFile = path.join(configDir, 'pending.json');
    let pendingCount = 0;
    if (fs.existsSync(pendingFile)) {
      try {
        const pf = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
        pendingCount = Object.keys(pf.requests ?? {}).length;
      } catch { /* ignore */ }
    }

    // Cost data
    const costsFile = path.join(configDir, 'costs.json');
    let totalCost = 0;
    const sessionCosts: Record<string, number> = {};
    if (fs.existsSync(costsFile)) {
      try {
        const costs = JSON.parse(fs.readFileSync(costsFile, 'utf-8')) as Record<string, { estimatedCostUSD?: number }>;
        for (const [id, c] of Object.entries(costs)) {
          const cost = c.estimatedCostUSD ?? 0;
          sessionCosts[id] = cost;
          totalCost += cost;
        }
      } catch { /* ignore */ }
    }

    // Check services
    let hookServerUp = false;
    try {
      const res = await fetch('http://127.0.0.1:19222/health', { signal: AbortSignal.timeout(1000) });
      hookServerUp = res.ok;
    } catch { /* not running */ }

    let dashboardUp = false;
    try {
      const res = await fetch('http://localhost:3400', { signal: AbortSignal.timeout(1000) });
      dashboardUp = res.ok;
    } catch { /* not running */ }

    console.log('  ── System ──\n');
    console.log(`  Rules:      ${ruleCount > 0 ? `${ruleCount} loaded` : 'none (run setup --auto)'}`);
    console.log(`  Pending:    ${pendingCount > 0 ? `${pendingCount} awaiting approval` : 'none'}`);
    console.log(`  Cost:       ${totalCost > 0 ? `$${totalCost.toFixed(2)} total` : 'no data yet'}`);
    console.log(`  HookServer: ${hookServerUp ? '● running (127.0.0.1:19222)' : '○ not running'}`);
    console.log(`  Dashboard:  ${dashboardUp ? '● running (localhost:3400)' : '○ not running'}`);

    // Sessions
    if (entries.length === 0) {
      console.log('\n  ── Sessions ──\n');
      console.log('  No active sessions. Start Claude Code to see them here.\n');
      return;
    }

    console.log(`\n  ── Sessions (${entries.length}) ──\n`);

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
      const cost = sessionCosts[id];
      const costStr = cost != null && cost > 0 ? ` $${cost.toFixed(2)}` : '';
      console.log(`  ${icon} ${session.project.padEnd(18)} ${session.status.padEnd(10)} ${age.padEnd(10)} [${shortId}]${costStr}`);
      if (session.waiting_context) {
        console.log(`     \u2514\u2500 ${session.waiting_context}`);
      }
    }
    console.log('');
  });

program
  .command('rename')
  .description('Rename a session (match by short ID prefix)')
  .argument('<id>', 'session ID prefix (e.g., first 4-8 chars from status)')
  .argument('<name>', 'new project name')
  .action(async (idPrefix: string, name: string) => {
    const sessions = await stateManager.getAll();
    const match = Object.keys(sessions).find(id => id.startsWith(idPrefix));
    if (!match) {
      console.log(`  No session found matching "${idPrefix}". Run: chief-of-agent status`);
      return;
    }
    await stateManager.updateStatus(match, sessions[match].status, sessions[match].last_event);
    // Direct state mutation for rename
    const state = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'state.json'), 'utf-8'));
    if (state.sessions[match]) {
      state.sessions[match].project = name;
      fs.writeFileSync(path.join(CONFIG_DIR, 'state.json'), JSON.stringify(state, null, 2));
      console.log(`  Renamed [${match.slice(0, 8)}] → ${name}`);
    }
  });

program
  .command('scan')
  .description('Discover and register running Claude Code sessions')
  .action(async () => {
    const { execFileSync } = await import('node:child_process');
    try {
      // Find running claude processes
      const psOutput = execFileSync('ps', ['-eo', 'pid,tty,args']).toString();
      const lines = psOutput.split('\n').filter(l => /\bclaude\b/.test(l) && !/grep|Claude\.app/.test(l));

      let registered = 0;
      const existing = await stateManager.getAll();

      for (const line of lines) {
        const match = line.trim().match(/^(\d+)\s+(\S+)\s+claude\s*(--resume\s+(\S+))?/);
        if (!match) continue;

        const pid = match[1];
        const tty = match[2];
        const resumeId = match[4];

        // Get cwd from lsof
        let cwd = '/Users/dioatmando/Vibecode';
        try {
          const lsofOut = execFileSync('lsof', ['-p', pid, '-Fn']).toString();
          const cwdMatch = lsofOut.match(/fcwd\nn(.*)/);
          if (cwdMatch) cwd = cwdMatch[1];
        } catch { /* use default */ }

        // Determine session ID — use resume ID or generate from pid+tty
        const sessionId = resumeId || `scan-${pid}-${tty.replace(/\//g, '-')}`;

        // Skip if already registered
        if (existing[sessionId]) continue;

        // Derive project from cwd
        const project = cwd.split('/').filter(Boolean).pop() || 'unknown';

        await stateManager.register(sessionId, cwd, project);
        registered++;
        console.log(`  Registered: ${project} [${sessionId.slice(0, 8)}] (${tty})`);
      }

      if (registered === 0) {
        console.log('  No new sessions found. All running sessions are already registered.');
      } else {
        console.log(`\n  Registered ${registered} new session(s).`);
      }
    } catch (e) {
      console.error('  Scan failed:', (e as Error).message);
    }
  });

program
  .command('setup')
  .description('Install hooks into ~/.claude/settings.json')
  .option('--dashboard', 'Also install PreToolUse hook for Control Tower permission routing')
  .option('--http', 'Install HTTP hooks pointing to macOS menu bar app (:19222)')
  .option('--auto', 'Create default policies.json with sensible rules')
  .action((options: { dashboard?: boolean; http?: boolean; auto?: boolean }) => {
    const configDir = ensureConfigDir();
    const { settingsPath, created } = installHooks();

    if (options.http) {
      installHTTPHook();
    } else if (options.dashboard) {
      installDashboardHook();
    }

    let policiesPath: string | null = null;
    if (options.auto) {
      policiesPath = ensurePoliciesFile();
    }

    const cfgPath = path.join(configDir, 'config.json');
    const config = configManager.load();
    if (!fs.existsSync(cfgPath)) {
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    }

    // Count rules if policies exist
    const policiesFile = path.join(configDir, 'policies.json');
    let ruleCount = 0;
    if (fs.existsSync(policiesFile)) {
      try {
        const pol = JSON.parse(fs.readFileSync(policiesFile, 'utf-8'));
        ruleCount = (pol.rules?.length ?? 0);
      } catch { /* ignore */ }
    }

    console.log('\n  ✓ Chief of Agent — Setup Complete\n');
    console.log(`  Hooks:    ${created ? 'created' : 'updated'} ${settingsPath}`);
    if (options.http) {
      console.log('  Mode:     HTTP hooks → 127.0.0.1:19222 (macOS menu bar app)');
    } else if (options.dashboard) {
      console.log('  Mode:     Dashboard hooks → localhost:3400');
    } else {
      console.log('  Mode:     Notifications only (add --dashboard or --http for governance)');
    }
    console.log(`  Config:   ${cfgPath}`);
    if (policiesPath) {
      console.log(`  Policies: ${policiesPath} (${ruleCount} rules)`);
    }

    console.log('\n  ── Next Steps ──\n');

    if (options.http) {
      console.log('  1. Install the macOS menu bar app:');
      console.log('     ./scripts/install-macos.sh\n');
      console.log('  2. Launch "Chief of Agent" from ~/Applications\n');
      console.log('  3. Start a Claude Code session:');
      console.log('     claude\n');
      console.log('  4. Watch pending actions appear in the menu bar\n');
    } else if (options.dashboard) {
      console.log('  1. Start the web dashboard:');
      console.log('     cd dashboard && npm run dev\n');
      console.log('  2. Open http://localhost:3400\n');
      console.log('  3. Start a Claude Code session:');
      console.log('     claude\n');
      console.log('  4. Watch pending actions appear in the dashboard\n');
    } else {
      console.log('  1. Start a Claude Code session:');
      console.log('     claude\n');
      console.log('  2. You\'ll get macOS notifications when agents need attention\n');
      console.log('  Tip: Run again with --dashboard or --http for approve/deny:\n');
      console.log('     chief-of-agent setup --http --auto\n');
    }

    console.log('  ── Useful Commands ──\n');
    console.log('  chief-of-agent status    — see all active sessions');
    console.log('  chief-of-agent audit     — view decision log');
    console.log('  chief-of-agent suggest   — get rule recommendations');
    console.log('');
  });

program
  .command('uninstall')
  .description('Remove all Chief of Agent hooks from ~/.claude/settings.json')
  .option('--purge', 'Also remove ~/.chief-of-agent/ config directory')
  .action((options: { purge?: boolean }) => {
    const { settingsPath, removed } = uninstallHooks();

    if (removed === 0) {
      console.log('\n  No Chief of Agent hooks found in settings.json.\n');
    } else {
      console.log(`\n  Removed ${removed} hook(s) from ${settingsPath}\n`);
    }

    if (options.purge) {
      const configDir = path.join(os.homedir(), '.chief-of-agent');
      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
        console.log(`  Removed config directory: ${configDir}\n`);
      }
    }

    console.log('  Chief of Agent has been uninstalled. Hooks removed, Claude Code unaffected.\n');
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
  .description('Handle PreToolUse hook — three-tier auto-responder (reads stdin)')
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

    const startTime = Date.now();
    const requestId = randomUUID();
    const cwd = (raw.cwd as string) || '/unknown';
    const project = cwd.split('/').filter(Boolean).pop() || 'unknown';
    const tool = String(raw.tool_name || 'Unknown');
    const detail = extractDetail(raw);
    const sessionId = String(raw.session_id || 'unknown');

    const auditContext = {
      sessionId,
      project,
      tool,
      detail,
    };

    // ─────────────────────────────────────────────
    // Tier 1: Rules Engine
    // ─────────────────────────────────────────────
    const policies = loadPolicies();
    const ruleResult = matchRule(policies, project, tool, detail);
    if (ruleResult) {
      if (ruleResult.action === 'allow') {
        // Allow rules fire immediately — no interruption
        const latency = Date.now() - startTime;
        logAudit({
          timestamp: new Date().toISOString(),
          ...auditContext,
          decision: 'allow',
          tier: 'rule',
          rule: ruleResult.pattern,
          latency_ms: latency,
        });
        broadcastAutoDecision({
          project,
          tool,
          detail,
          decision: 'allow',
          tier: 'rule',
          rule: ruleResult.pattern,
          latency_ms: latency,
          timestamp: new Date().toISOString(),
        });
        outputDecision('allow');
      } else {
        // Deny rules: write to pending.json and wait for menu bar response.
        // If the user approves (overrides) or times out → fall through to ask.
        writePendingRequest(requestId, {
          sessionId,
          project,
          tool,
          detail,
          timestamp: new Date().toISOString(),
          rule: ruleResult.pattern,
        });

        // Short timeout for menu bar: if app isn't running, fall through to dashboard quickly
        const decision = await pollForResponse(requestId, 15_000);
        removePendingRequest(requestId);

        const latency = Date.now() - startTime;

        if (decision === 'allow' || decision === 'deny') {
          logAudit({
            timestamp: new Date().toISOString(),
            ...auditContext,
            decision,
            tier: 'rule',
            rule: ruleResult.pattern,
            latency_ms: latency,
          });
          broadcastAutoDecision({
            project,
            tool,
            detail,
            decision,
            tier: 'rule',
            rule: ruleResult.pattern,
            latency_ms: latency,
            timestamp: new Date().toISOString(),
          });
          outputDecision(decision);
        }
        // decision === 'ask' → fall through to terminal
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask' } }));
        process.exit(0);
      }
    }

    // ─────────────────────────────────────────────
    // Tier 2: AI Classifier
    // ─────────────────────────────────────────────
    if (policies.ai?.enabled && process.env.ANTHROPIC_API_KEY) {
      const threshold = policies.ai.confidence_threshold ?? 0.8;
      const aiResult = await classifyWithAI(project, tool, detail);
      if (
        aiResult &&
        aiResult.confidence >= threshold &&
        (aiResult.decision === 'allow' || aiResult.decision === 'deny')
      ) {
        const latency = Date.now() - startTime;
        logAudit({
          timestamp: new Date().toISOString(),
          ...auditContext,
          decision: aiResult.decision,
          tier: 'ai',
          confidence: aiResult.confidence,
          reason: aiResult.reason,
          latency_ms: latency,
        });
        broadcastAutoDecision({
          project,
          tool,
          detail,
          decision: aiResult.decision,
          tier: 'ai',
          confidence: aiResult.confidence,
          reason: aiResult.reason,
          latency_ms: latency,
          timestamp: new Date().toISOString(),
        });
        outputDecision(aiResult.decision);
      }
      // AI said "ask" or confidence too low — fall through to dashboard
    }

    // ─────────────────────────────────────────────
    // Tier 3: Dashboard (Phase 3 long-poll)
    // ─────────────────────────────────────────────
    await handleDashboardTier(raw, requestId, project, tool, detail, sessionId, auditContext, startTime);
  });

/**
 * Outputs a decision and exits. Used by tiers 1 and 2.
 */
function outputDecision(decision: 'allow' | 'deny'): never {
  const output: Record<string, unknown> = {
    hookSpecificOutput: { permissionDecision: decision },
  };
  if (decision === 'deny') {
    output.systemMessage = 'Action denied by Chief of Agent auto-responder';
  }
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

/**
 * Tier 3: Long-polls the dashboard for a human decision.
 */
async function handleDashboardTier(
  raw: Record<string, unknown>,
  requestId: string,
  project: string,
  tool: string,
  detail: string,
  sessionId: string,
  auditContext: { sessionId: string; project: string; tool: string; detail: string },
  startTime: number,
): Promise<never> {
  try {
    const body = JSON.stringify({
      requestId,
      sessionId,
      project,
      tool,
      detail,
      timestamp: new Date().toISOString(),
    });

    const response = await fetch('http://localhost:3400/api/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(120_000),
    });

    const result = await response.json() as { decision?: string };
    const decision = result?.decision;

    if (!decision || (decision !== 'allow' && decision !== 'deny')) {
      // "ask" or invalid → no output, Claude Code falls through to terminal prompt
      process.exit(0);
    }

    if (decision === 'allow' || decision === 'deny') {
      const latency = Date.now() - startTime;
      logAudit({
        timestamp: new Date().toISOString(),
        ...auditContext,
        decision,
        tier: 'dashboard',
        latency_ms: latency,
      });

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
    // Dashboard not running, timeout, etc. → ask
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask' } }));
  }
  process.exit(0);
}

// ─────────────────────────────────────────────
// audit command
// ─────────────────────────────────────────────

program
  .command('audit')
  .description('Show recent auto-decisions from the audit log')
  .option('--tail', 'Live tail the audit log (not yet implemented, shows last 50)')
  .option('--stats', 'Show summary statistics')
  .option('-n, --limit <number>', 'Number of entries to show (default: 20)', '20')
  .action((options: { tail?: boolean; stats?: boolean; limit?: string }) => {
    const limit = parseInt(options.limit || '20', 10);
    const entries = readAudit(options.tail ? 50 : limit);

    if (entries.length === 0) {
      console.log('\n  No audit entries found. Run some Claude Code sessions first.\n');
      return;
    }

    if (options.stats) {
      printAuditStats(entries);
      return;
    }

    console.log(`\n  Chief of Agent — Audit Log (last ${entries.length})\n`);

    const tierLabel: Record<string, string> = {
      rule: 'Rule',
      ai: 'AI  ',
      dashboard: 'Human',
    };

    for (const entry of entries) {
      const decisionIcon = entry.decision === 'allow' ? '[ALLOW]' : entry.decision === 'deny' ? '[DENY] ' : '[ASK]  ';
      const tier = tierLabel[entry.tier] || entry.tier;
      const ts = new Date(entry.timestamp).toLocaleTimeString();
      const latency = entry.latency_ms < 1000 ? `${entry.latency_ms}ms` : `${(entry.latency_ms / 1000).toFixed(1)}s`;
      console.log(`  ${decisionIcon} ${tier} | ${entry.project.padEnd(15)} ${entry.tool.padEnd(6)} | ${latency.padStart(6)} | ${ts}`);
      console.log(`         ${entry.detail.slice(0, 80)}`);
      if (entry.rule) console.log(`         Rule: ${entry.rule}`);
      if (entry.reason) console.log(`         AI: ${entry.reason} (${(entry.confidence! * 100).toFixed(0)}%)`);
    }
    console.log('');
  });

function printAuditStats(entries: AuditEntry[]): void {
  const total = entries.length;
  const byTier = { rule: 0, ai: 0, dashboard: 0 };
  const byDecision = { allow: 0, deny: 0, ask: 0 };

  for (const e of entries) {
    byTier[e.tier] = (byTier[e.tier] || 0) + 1;
    byDecision[e.decision] = (byDecision[e.decision] || 0) + 1;
  }

  const autoRate = ((byTier.rule + byTier.ai) / total * 100).toFixed(1);

  console.log(`\n  Audit Statistics (${total} decisions)\n`);
  console.log(`  Automation rate: ${autoRate}%`);
  console.log(`  By tier:   Rule=${byTier.rule}  AI=${byTier.ai}  Human=${byTier.dashboard}`);
  console.log(`  By result: Allow=${byDecision.allow}  Deny=${byDecision.deny}  Ask=${byDecision.ask}`);
  console.log('');
}

// ─────────────────────────────────────────────
// suggest command
// ─────────────────────────────────────────────

program
  .command('suggest')
  .description('Analyze audit log and suggest new rules')
  .action(async () => {
    const allEntries = readAudit(10000);

    if (allEntries.length < 10) {
      console.log(`\n  Not enough data yet (${allEntries.length} entries, need 10+). Run more Claude Code sessions.\n`);
      return;
    }

    const suggestions = suggestRules(allEntries);

    if (suggestions.length === 0) {
      console.log('\n  No clear patterns found yet. More sessions needed.\n');
      return;
    }

    console.log(`\n  Suggested Rules (based on ${allEntries.length} decisions)\n`);

    const toApply: Array<{ tool: string; pattern: string; action: 'allow' | 'deny' }> = [];

    for (const s of suggestions) {
      const total = s.approvalCount + s.denialCount;
      if (s.consistent) {
        const icon = s.action === 'allow' ? '[+]' : '[!]';
        console.log(`  ${icon} You ${s.action === 'allow' ? 'approved' : 'denied'} "${s.tool}: ${s.pattern}" ${total} times (0 conflicts)`);
        console.log(`     Suggested: { "tool": "${s.tool}", "pattern": "${s.pattern}", "action": "${s.action}" }\n`);
        toApply.push({ tool: s.tool, pattern: s.pattern, action: s.action });
      } else {
        console.log(`  [~] Mixed results for "${s.tool}: ${s.pattern}" (allow=${s.approvalCount}, deny=${s.denialCount})`);
        console.log(`     No suggestion — inconsistent pattern, keep manual\n`);
      }
    }

    if (toApply.length === 0) {
      console.log('  No consistent patterns to add.\n');
      return;
    }

    const answer = await promptUser(`  Apply ${toApply.length} suggestion(s) to policies.json? (y/n) `);
    if (answer.trim().toLowerCase() === 'y') {
      const policies = loadPolicies();
      policies.rules.push(...toApply);
      writePolicies(policies);
      console.log(`\n  Added ${toApply.length} rule(s) to policies.json.\n`);
    } else {
      console.log('\n  No changes made.\n');
    }
  });

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

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

/**
 * Broadcasts an auto-decision to the dashboard (fire-and-forget, 2s timeout).
 */
function broadcastAutoDecision(payload: Record<string, unknown>): void {
  // Write to file for menu bar app to read
  writeDecisionToFile(payload);

  // Broadcast to dashboard via HTTP (fire-and-forget)
  fetch('http://localhost:3400/api/auto-decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2_000),
  }).catch(() => {
    // Dashboard not running — silently ignore
  });
}

const DECISIONS_PATH = path.join(os.homedir(), '.chief-of-agent', 'decisions.jsonl');
const MAX_DECISIONS = 50;

function writeDecisionToFile(payload: Record<string, unknown>): void {
  try {
    const line = JSON.stringify(payload) + '\n';
    const configDir = path.join(os.homedir(), '.chief-of-agent');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    fs.appendFileSync(DECISIONS_PATH, line, 'utf-8');

    // Trim to last MAX_DECISIONS lines periodically
    const stat = fs.statSync(DECISIONS_PATH);
    if (stat.size > 100_000) { // ~100KB, trim
      const content = fs.readFileSync(DECISIONS_PATH, 'utf-8');
      const lines = content.trim().split('\n');
      const trimmed = lines.slice(-MAX_DECISIONS).join('\n') + '\n';
      fs.writeFileSync(DECISIONS_PATH, trimmed, 'utf-8');
    }
  } catch {
    // Non-critical — don't break the respond flow
  }
}

/**
 * Prompts user for input via readline.
 */
function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

program.parse();
