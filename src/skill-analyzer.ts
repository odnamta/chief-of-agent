/**
 * Skill Analyzer — Scan, categorize, and optimize Claude Code skills.
 *
 * Claude Code has a ~15K char budget for skill descriptions in the system prompt.
 * When you exceed this, skills are silently dropped. This analyzer helps you
 * understand what you have and what to keep.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SkillInfo {
  plugin: string;
  skill: string;
  description: string;
  category: string;
  descriptionLength: number;
  filePath: string;
}

export interface SkillReport {
  total: number;
  budget: number;
  budgetUsed: number;
  budgetPercent: number;
  overBudget: number;
  byPlugin: Array<{ plugin: string; count: number; chars: number }>;
  byCategory: Array<{ category: string; count: number; skills: string[] }>;
  skills: SkillInfo[];
  recommendations: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SKILL_BUDGET_CHARS = 15_700; // Approximate system prompt budget for skill descriptions

// ── Categories ───────────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /test|tdd|vitest|jest|playwright|e2e/i, category: 'Testing' },
  { pattern: /debug|fix|error|troubleshoot|investigation/i, category: 'Debugging' },
  { pattern: /deploy|ci|cd|vercel|build|bundle/i, category: 'Deployment' },
  { pattern: /design|ui|css|tailwind|shadcn|component|frontend/i, category: 'Design & UI' },
  { pattern: /ai|llm|chat|agent|sdk|model|prompt/i, category: 'AI & LLM' },
  { pattern: /git|commit|pr|review|branch/i, category: 'Git & Code Review' },
  { pattern: /security|auth|permission|firewall/i, category: 'Security' },
  { pattern: /database|sql|migration|supabase|postgres/i, category: 'Database' },
  { pattern: /api|route|endpoint|rest|graphql|mcp/i, category: 'API & Networking' },
  { pattern: /docs|readme|changelog|markdown/i, category: 'Documentation' },
  { pattern: /perf|cache|optimize|speed|bundle/i, category: 'Performance' },
  { pattern: /plan|brainstorm|architect|design/i, category: 'Planning' },
  { pattern: /config|setup|bootstrap|env|install/i, category: 'Configuration' },
  { pattern: /monitor|observe|log|metric|trace/i, category: 'Observability' },
  { pattern: /sentry|error.*track/i, category: 'Error Tracking' },
  { pattern: /figma|implement.*design/i, category: 'Design Implementation' },
  { pattern: /storage|blob|file|upload/i, category: 'Storage' },
  { pattern: /payment|stripe|billing/i, category: 'Payments' },
  { pattern: /email|resend|smtp/i, category: 'Email' },
  { pattern: /flag|feature|rollout|experiment/i, category: 'Feature Flags' },
];

function categorize(skill: string, description: string): string {
  const text = `${skill} ${description}`;
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'Other';
}

// ── Scanner ──────────────────────────────────────────────────────────────────

export function analyzeSkills(): SkillReport {
  const skills: SkillInfo[] = [];
  const cacheDir = path.join(CLAUDE_DIR, 'plugins', 'cache');

  if (!fs.existsSync(cacheDir)) {
    return emptyReport();
  }

  // Scan all plugin skill directories
  for (const marketplace of safeReaddir(cacheDir)) {
    const mpDir = path.join(cacheDir, marketplace);
    if (!isDir(mpDir)) continue;

    for (const plugin of safeReaddir(mpDir)) {
      const pluginDir = path.join(mpDir, plugin);
      if (!isDir(pluginDir)) continue;

      for (const version of safeReaddir(pluginDir)) {
        const skillsDir = path.join(pluginDir, version, 'skills');
        if (!isDir(skillsDir)) continue;

        for (const skill of safeReaddir(skillsDir)) {
          if (skill.startsWith('.')) continue;
          const skillPath = path.join(skillsDir, skill);
          const skillMd = path.join(skillPath, 'SKILL.md');
          let description = '';

          if (fs.existsSync(skillMd)) {
            const content = fs.readFileSync(skillMd, 'utf-8');
            description = extractDescription(content);
          }

          skills.push({
            plugin,
            skill,
            description,
            category: categorize(skill, description),
            descriptionLength: description.length,
            filePath: skillPath,
          });
        }
      }
    }
  }

  // Also scan user skills
  const userSkillsDir = path.join(CLAUDE_DIR, 'skills');
  if (isDir(userSkillsDir)) {
    for (const skill of safeReaddir(userSkillsDir)) {
      if (skill.startsWith('.')) continue;
      const skillPath = path.join(userSkillsDir, skill);
      const skillMd = path.join(skillPath, 'SKILL.md');
      let description = '';
      if (fs.existsSync(skillMd)) {
        description = extractDescription(fs.readFileSync(skillMd, 'utf-8'));
      }
      skills.push({
        plugin: '(user)',
        skill,
        description,
        category: categorize(skill, description),
        descriptionLength: description.length,
        filePath: skillPath,
      });
    }
  }

  // Compute budget
  const totalChars = skills.reduce((sum, s) => sum + s.descriptionLength, 0);
  const overBudget = Math.max(0, totalChars - SKILL_BUDGET_CHARS);

  // Group by plugin
  const pluginMap = new Map<string, { count: number; chars: number }>();
  for (const s of skills) {
    const existing = pluginMap.get(s.plugin) ?? { count: 0, chars: 0 };
    existing.count++;
    existing.chars += s.descriptionLength;
    pluginMap.set(s.plugin, existing);
  }
  const byPlugin = [...pluginMap.entries()]
    .map(([plugin, data]) => ({ plugin, ...data }))
    .sort((a, b) => b.chars - a.chars);

  // Group by category
  const catMap = new Map<string, string[]>();
  for (const s of skills) {
    const list = catMap.get(s.category) ?? [];
    list.push(`${s.plugin}:${s.skill}`);
    catMap.set(s.category, list);
  }
  const byCategory = [...catMap.entries()]
    .map(([category, skillList]) => ({ category, count: skillList.length, skills: skillList }))
    .sort((a, b) => b.count - a.count);

  // Generate recommendations
  const recommendations: string[] = [];

  if (overBudget > 0) {
    recommendations.push(`⚠️  ${overBudget.toLocaleString()} chars over budget — ${Math.round(overBudget / totalChars * 100)}% of skills are hidden from Claude`);
  }

  // Find the biggest budget hog
  if (byPlugin.length > 0 && byPlugin[0].chars > SKILL_BUDGET_CHARS * 0.5) {
    recommendations.push(`💡 "${byPlugin[0].plugin}" uses ${byPlugin[0].chars.toLocaleString()} chars (${byPlugin[0].count} skills) — consider if you need all of them`);
  }

  // Suggest unused categories
  const neverUsedCategories = byCategory.filter(c => c.count <= 2 && c.category !== 'Other');
  if (neverUsedCategories.length > 0) {
    recommendations.push(`🔍 Low-use categories: ${neverUsedCategories.map(c => `${c.category} (${c.count})`).join(', ')}`);
  }

  if (skills.length > 50) {
    recommendations.push(`📊 You have ${skills.length} skills but Claude can only see ~50. Run 'chief-of-agent skills optimize' to trim.`);
  }

  return {
    total: skills.length,
    budget: SKILL_BUDGET_CHARS,
    budgetUsed: totalChars,
    budgetPercent: Math.round(totalChars / SKILL_BUDGET_CHARS * 100),
    overBudget,
    byPlugin,
    byCategory,
    skills,
    recommendations,
  };
}

// ── HTML Report Generator ────────────────────────────────────────────────────

export function generateHTMLReport(report: SkillReport): string {
  const budgetColor = report.budgetPercent > 100 ? '#ef4444' : report.budgetPercent > 80 ? '#f59e0b' : '#22c55e';

  const categoryCards = report.byCategory.map(cat => `
    <div class="card">
      <div class="card-header">
        <span class="category">${cat.category}</span>
        <span class="count">${cat.count}</span>
      </div>
      <div class="skills-list">
        ${cat.skills.slice(0, 10).map(s => `<span class="skill-tag">${s}</span>`).join('')}
        ${cat.count > 10 ? `<span class="skill-tag more">+${cat.count - 10} more</span>` : ''}
      </div>
    </div>
  `).join('');

  const pluginBars = report.byPlugin.map(p => {
    const pct = Math.round(p.chars / report.budgetUsed * 100);
    return `
      <div class="bar-row">
        <span class="bar-label">${p.plugin}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${Math.min(pct * 2, 100)}%"></div>
        </div>
        <span class="bar-value">${p.count} skills · ${(p.chars / 1000).toFixed(1)}K chars</span>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chief of Agent — Skill Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #e4e4e7; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
  .subtitle { color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .metric { background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1rem; }
  .metric-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a; }
  .metric-value { font-size: 1.5rem; font-weight: 700; font-family: 'SF Mono', monospace; margin-top: 0.25rem; }
  .metric-sub { font-size: 0.75rem; color: #52525b; margin-top: 0.25rem; }
  h2 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a; margin: 2rem 0 1rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1rem; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .category { font-weight: 600; font-size: 0.9rem; }
  .count { background: #27272a; color: #a1a1aa; padding: 0.125rem 0.5rem; border-radius: 1rem; font-size: 0.75rem; font-family: monospace; }
  .skills-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
  .skill-tag { background: #27272a; color: #a1a1aa; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.7rem; font-family: monospace; }
  .skill-tag.more { background: #3f3f46; color: #d4d4d8; }
  .bar-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .bar-label { width: 140px; font-size: 0.8rem; font-family: monospace; text-align: right; flex-shrink: 0; }
  .bar-track { flex: 1; height: 20px; background: #27272a; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: #3b82f6; border-radius: 4px; transition: width 0.3s; }
  .bar-value { font-size: 0.7rem; color: #71717a; width: 160px; flex-shrink: 0; }
  .recommendations { background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1rem; margin-top: 1rem; }
  .rec { padding: 0.5rem 0; font-size: 0.85rem; border-bottom: 1px solid #27272a; }
  .rec:last-child { border: none; }
  .budget-bar { height: 8px; background: #27272a; border-radius: 4px; margin-top: 0.5rem; overflow: hidden; }
  .budget-fill { height: 100%; border-radius: 4px; }
</style>
</head>
<body>
  <h1>Skill Report</h1>
  <p class="subtitle">Chief of Agent — Claude Code skill budget analysis</p>

  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Total Skills</div>
      <div class="metric-value">${report.total}</div>
      <div class="metric-sub">across ${report.byPlugin.length} plugins</div>
    </div>
    <div class="metric">
      <div class="metric-label">Budget Used</div>
      <div class="metric-value" style="color: ${budgetColor}">${report.budgetPercent}%</div>
      <div class="budget-bar"><div class="budget-fill" style="width: ${Math.min(report.budgetPercent, 100)}%; background: ${budgetColor}"></div></div>
      <div class="metric-sub">${(report.budgetUsed / 1000).toFixed(1)}K / ${(report.budget / 1000).toFixed(1)}K chars</div>
    </div>
    <div class="metric">
      <div class="metric-label">Over Budget</div>
      <div class="metric-value" style="color: ${report.overBudget > 0 ? '#ef4444' : '#22c55e'}">${report.overBudget > 0 ? (report.overBudget / 1000).toFixed(1) + 'K' : '0'}</div>
      <div class="metric-sub">${report.overBudget > 0 ? 'chars hidden from Claude' : 'all skills visible'}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Categories</div>
      <div class="metric-value">${report.byCategory.length}</div>
      <div class="metric-sub">skill categories detected</div>
    </div>
  </div>

  <h2>Budget Usage by Plugin</h2>
  ${pluginBars}

  <h2>Skills by Category</h2>
  <div class="cards">${categoryCards}</div>

  ${report.recommendations.length > 0 ? `
  <h2>Recommendations</h2>
  <div class="recommendations">
    ${report.recommendations.map(r => `<div class="rec">${r}</div>`).join('')}
  </div>
  ` : ''}

  <p class="subtitle" style="margin-top: 2rem">Generated by Chief of Agent v1.3.0 · ${new Date().toLocaleString()}</p>
</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyReport(): SkillReport {
  return { total: 0, budget: SKILL_BUDGET_CHARS, budgetUsed: 0, budgetPercent: 0, overBudget: 0, byPlugin: [], byCategory: [], skills: [], recommendations: [] };
}

function extractDescription(content: string): string {
  if (!content.includes('---')) return '';
  const parts = content.split('---');
  if (parts.length < 3) return '';
  for (const line of parts[1].split('\n')) {
    if (line.startsWith('description:')) {
      return line.replace('description:', '').trim();
    }
  }
  return '';
}

function safeReaddir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// ── Cache Cleaner ────────────────────────────────────────────────────────────

export interface CleanResult {
  removed: Array<{ plugin: string; version: string; path: string }>;
  kept: Array<{ plugin: string; version: string }>;
  protected: Array<{ plugin: string; version: string; reason: string }>;
}

/**
 * Safely clean stale plugin cache versions.
 * Keeps the newest version + any versions referenced by installed_plugins.json.
 * Returns what was removed/kept without actually deleting (dry run by default).
 */
export function findStaleCache(dryRun = true): CleanResult {
  const cacheDir = path.join(CLAUDE_DIR, 'plugins', 'cache');
  const result: CleanResult = { removed: [], kept: [], protected: [] };

  if (!isDir(cacheDir)) return result;

  // Load referenced paths from installed_plugins.json
  const referencedPaths = new Set<string>();
  const installedFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
  if (fs.existsSync(installedFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(installedFile, 'utf-8'));
      const plugins = data.plugins ?? {};
      for (const entries of Object.values(plugins)) {
        for (const entry of entries as Array<{ installPath?: string }>) {
          if (entry.installPath) {
            referencedPaths.add(entry.installPath);
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Scan each marketplace
  for (const marketplace of safeReaddir(cacheDir)) {
    const mpDir = path.join(cacheDir, marketplace);
    if (!isDir(mpDir)) continue;

    for (const plugin of safeReaddir(mpDir)) {
      const pluginDir = path.join(mpDir, plugin);
      if (!isDir(pluginDir)) continue;

      const versions = safeReaddir(pluginDir)
        .filter(v => isDir(path.join(pluginDir, v)))
        .sort((a, b) => {
          // Sort by modification time, newest first
          const aTime = fs.statSync(path.join(pluginDir, a)).mtimeMs;
          const bTime = fs.statSync(path.join(pluginDir, b)).mtimeMs;
          return bTime - aTime;
        });

      if (versions.length <= 1) {
        if (versions.length === 1) {
          result.kept.push({ plugin, version: versions[0] });
        }
        continue;
      }

      // Keep newest
      result.kept.push({ plugin, version: versions[0] });

      // Check older versions
      for (const version of versions.slice(1)) {
        const versionPath = path.join(pluginDir, version);

        // Check if referenced by installed_plugins.json
        const isReferenced = [...referencedPaths].some(p => p.includes(version));
        if (isReferenced) {
          result.protected.push({ plugin, version, reason: 'referenced in installed_plugins.json' });
          continue;
        }

        if (dryRun) {
          result.removed.push({ plugin, version, path: versionPath });
        } else {
          try {
            fs.rmSync(versionPath, { recursive: true, force: true });
            result.removed.push({ plugin, version, path: versionPath });
          } catch (err) {
            result.protected.push({ plugin, version, reason: `delete failed: ${err}` });
          }
        }
      }
    }
  }

  return result;
}
