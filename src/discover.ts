/**
 * Discover — Scan Claude Code setup and surface unused capabilities.
 *
 * Reads ~/.claude/ directory to find plugins, skills, MCP servers,
 * hooks, and settings. Generates tips based on what's installed
 * vs what's being used.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveryReport {
  plugins: { name: string; scope: string }[];
  skills: string[];
  commands: string[];
  hooks: { event: string; count: number }[];
  mcpServers: string[];
  permissions: { allow: number; deny: number };
  autoMode: boolean;
  tips: Tip[];
  warnings: Warning[];
}

export interface Tip {
  icon: string;
  message: string;
  command?: string;
}

export interface Warning {
  icon: string;
  message: string;
}

// ── Scanner ──────────────────────────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

export function discover(): DiscoveryReport {
  const report: DiscoveryReport = {
    plugins: [],
    skills: [],
    commands: [],
    hooks: [],
    mcpServers: [],
    permissions: { allow: 0, deny: 0 },
    autoMode: false,
    tips: [],
    warnings: [],
  };

  // ── Plugins ──
  const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
  if (fs.existsSync(pluginsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(pluginsFile, 'utf-8'));
      const plugins = data.plugins ?? {};
      for (const [fullName, entries] of Object.entries(plugins)) {
        const name = fullName.split('@')[0];
        const scope = (entries as Array<{ scope: string }>)[0]?.scope ?? 'user';
        report.plugins.push({ name, scope });
      }
    } catch { /* ignore */ }
  }

  // ── Skills ──
  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      report.skills = fs.readdirSync(skillsDir).filter(f => !f.startsWith('.'));
    } catch { /* ignore */ }
  }

  // Also count skills from plugins
  const pluginCacheDir = path.join(CLAUDE_DIR, 'plugins', 'cache');
  let totalPluginSkills = 0;
  if (fs.existsSync(pluginCacheDir)) {
    try {
      for (const marketplace of fs.readdirSync(pluginCacheDir)) {
        const mpDir = path.join(pluginCacheDir, marketplace);
        if (!fs.statSync(mpDir).isDirectory()) continue;
        for (const plugin of fs.readdirSync(mpDir)) {
          const pluginDir = path.join(mpDir, plugin);
          if (!fs.statSync(pluginDir).isDirectory()) continue;
          // Look for skills in plugin
          for (const version of fs.readdirSync(pluginDir)) {
            const skillsInPlugin = path.join(pluginDir, version, 'skills');
            if (fs.existsSync(skillsInPlugin) && fs.statSync(skillsInPlugin).isDirectory()) {
              totalPluginSkills += fs.readdirSync(skillsInPlugin).filter(f => !f.startsWith('.')).length;
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // ── Custom Commands ──
  const commandsDir = path.join(CLAUDE_DIR, 'commands');
  if (fs.existsSync(commandsDir)) {
    try {
      report.commands = fs.readdirSync(commandsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => '/' + f.replace('.md', ''));
    } catch { /* ignore */ }
  }

  // ── Settings ──
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));

      // Hooks
      const hooks = settings.hooks ?? {};
      for (const [event, entries] of Object.entries(hooks)) {
        report.hooks.push({ event, count: (entries as unknown[]).length });
      }

      // MCP servers
      const mcp = settings.mcpServers ?? {};
      report.mcpServers = Object.keys(mcp);

      // Permissions
      const perms = settings.permissions ?? {};
      report.permissions.allow = (perms.allow ?? []).length;
      report.permissions.deny = (perms.deny ?? []).length;

      // Auto Mode
      const autoConfig = settings.autoMode ?? {};
      report.autoMode = Object.keys(autoConfig).length > 0;
    } catch { /* ignore */ }
  }

  // ── Generate Tips ──
  generateTips(report, totalPluginSkills);

  return report;
}

// ── Tip Generator ────────────────────────────────────────────────────────────

function generateTips(report: DiscoveryReport, totalPluginSkills: number) {
  // PostCompact hook check
  const hasPostCompact = report.hooks.some(h => h.event === 'PostCompact');
  if (!hasPostCompact) {
    report.tips.push({
      icon: '🧠',
      message: 'Add PostCompact hook to preserve context in long sessions',
      command: 'chief-of-agent setup',
    });
  }

  // Auto Mode
  if (!report.autoMode) {
    report.tips.push({
      icon: '⚡',
      message: 'Configure Auto Mode environment for smarter auto-approve',
      command: 'claude auto-mode config',
    });
  }

  // Agent Teams
  const agentTeamsEnabled = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === 'true';
  if (!agentTeamsEnabled) {
    report.tips.push({
      icon: '👥',
      message: 'Enable Agent Teams for multi-agent orchestration',
      command: 'export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true',
    });
  }

  // Worktree tip for parallel users
  report.tips.push({
    icon: '🌲',
    message: 'Use worktrees for isolated parallel sessions',
    command: 'claude --worktree --tmux',
  });

  // Skill budget warning
  if (totalPluginSkills > 50) {
    report.warnings.push({
      icon: '⚠️',
      message: `${totalPluginSkills} plugin skills detected — Claude Code has a ~15K char budget. Skills beyond this are silently hidden from the agent.`,
    });
  }

  // Voice mode tip
  report.tips.push({
    icon: '🎤',
    message: 'Try voice mode for hands-free coding',
    command: '/voice (then hold spacebar)',
  });

  // Remote control tip
  report.tips.push({
    icon: '📱',
    message: 'Continue sessions from your phone via Remote Control',
    command: 'Visit claude.ai/code from mobile',
  });

  // Plugin-specific tips
  const pluginNames = report.plugins.map(p => p.name);
  if (!pluginNames.includes('superpowers')) {
    report.tips.push({
      icon: '💪',
      message: 'Install superpowers plugin for TDD, debugging, and planning workflows',
      command: '/install-plugin superpowers',
    });
  }

  // Custom output styles
  const stylesDir = path.join(CLAUDE_DIR, 'output-styles');
  if (!fs.existsSync(stylesDir)) {
    report.tips.push({
      icon: '🎨',
      message: 'Create custom output styles for different work modes',
      command: 'mkdir ~/.claude/output-styles/',
    });
  }
}

// ── Formatter ────────────────────────────────────────────────────────────────

export function formatReport(report: DiscoveryReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  ╔══════════════════════════════════════╗');
  lines.push('  ║    Chief of Agent — Discover         ║');
  lines.push('  ║    Your Claude Code capabilities     ║');
  lines.push('  ╚══════════════════════════════════════╝');
  lines.push('');

  // Setup summary
  lines.push('  ── What You Have ──');
  lines.push('');
  lines.push(`  Plugins:     ${report.plugins.length} installed`);
  if (report.plugins.length > 0) {
    const names = report.plugins.map(p => p.name).sort();
    // Show in columns of 3
    for (let i = 0; i < names.length; i += 3) {
      const row = names.slice(i, i + 3).map(n => n.padEnd(22)).join('');
      lines.push(`               ${row}`);
    }
  }

  lines.push(`  Skills:      ${report.skills.length} custom + plugin skills`);
  lines.push(`  Commands:    ${report.commands.length} custom (${report.commands.join(', ') || 'none'})`);
  lines.push(`  Hooks:       ${report.hooks.length} events configured`);
  for (const h of report.hooks) {
    lines.push(`               ${h.event} (${h.count})`);
  }
  lines.push(`  MCP Servers: ${report.mcpServers.length > 0 ? report.mcpServers.join(', ') : 'none in settings (may be via claude.ai OAuth)'}`);
  lines.push(`  Permissions: ${report.permissions.allow} allow, ${report.permissions.deny} deny`);
  lines.push(`  Auto Mode:   ${report.autoMode ? 'configured' : 'defaults only'}`);

  // Warnings
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('  ── Warnings ──');
    lines.push('');
    for (const w of report.warnings) {
      lines.push(`  ${w.icon}  ${w.message}`);
    }
  }

  // Tips
  if (report.tips.length > 0) {
    lines.push('');
    lines.push('  ── Tips to Get More From Claude Code ──');
    lines.push('');
    for (const t of report.tips) {
      lines.push(`  ${t.icon}  ${t.message}`);
      if (t.command) {
        lines.push(`     → ${t.command}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
