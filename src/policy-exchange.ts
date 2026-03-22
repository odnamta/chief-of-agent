/**
 * Policy Export/Import — Phase 8 (Team Features)
 *
 * Export policies with metadata envelope for team sharing.
 * Import with replace or merge mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadPolicies, type Policy, type Rule } from './rules.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportMeta {
  version: 1;
  exported_at: string;
  exported_by: string;
  machine: string;
  chief_of_agent_version: string;
  rule_count: number;
}

export interface ExportedPolicy extends Policy {
  _meta: ExportMeta;
  locked_rules?: number[]; // Indices of rules that cannot be overridden on import
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
  locked: number;
  total: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const POLICIES_PATH = path.join(CONFIG_DIR, 'policies.json');
const VERSION = '1.0.0';

// ── Export ────────────────────────────────────────────────────────────────────

export function exportPolicies(outputPath?: string): { path: string; ruleCount: number } {
  const policies = loadPolicies();
  const userInfo = os.userInfo();

  const exported: ExportedPolicy = {
    ...policies,
    _meta: {
      version: 1,
      exported_at: new Date().toISOString(),
      exported_by: userInfo.username,
      machine: os.hostname(),
      chief_of_agent_version: VERSION,
      rule_count: policies.rules.length,
    },
  };

  const destPath = outputPath || path.join(
    process.cwd(),
    `coa-policies-${new Date().toISOString().slice(0, 10)}.json`,
  );

  fs.writeFileSync(destPath, JSON.stringify(exported, null, 2), 'utf-8');
  return { path: destPath, ruleCount: policies.rules.length };
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validatePolicyFile(content: unknown): content is Policy {
  if (typeof content !== 'object' || content === null) return false;
  const obj = content as Record<string, unknown>;
  if (!Array.isArray(obj.rules)) return false;
  // Validate each rule has required fields
  for (const rule of obj.rules as unknown[]) {
    if (typeof rule !== 'object' || rule === null) return false;
    const r = rule as Record<string, unknown>;
    if (typeof r.tool !== 'string' || typeof r.pattern !== 'string' || typeof r.action !== 'string') return false;
    if (r.action !== 'allow' && r.action !== 'deny') return false;
  }
  return true;
}

// ── Import ───────────────────────────────────────────────────────────────────

export function importPolicies(
  inputPath: string,
  mode: 'replace' | 'merge' = 'merge',
  dryRun = false,
): ImportResult {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const parsed = JSON.parse(raw);

  // Strip _meta if present (ExportedPolicy format)
  const imported: Policy = {
    rules: parsed.rules,
    ai: parsed.ai,
    per_project: parsed.per_project,
  };

  if (!validatePolicyFile(imported)) {
    throw new Error('Invalid policy file: rules array must contain valid {tool, pattern, action} entries');
  }

  const lockedIndices: number[] = parsed.locked_rules ?? [];

  if (mode === 'replace') {
    const result: ImportResult = {
      added: imported.rules.length,
      updated: 0,
      unchanged: 0,
      locked: lockedIndices.length,
      total: imported.rules.length,
    };
    if (!dryRun) {
      writePolicies(imported);
    }
    return result;
  }

  // Merge mode
  const local = loadPolicies();
  const merged = mergePolicies(local, imported, lockedIndices);

  const result: ImportResult = {
    added: merged.rules.length - local.rules.length,
    updated: 0,
    unchanged: local.rules.length,
    locked: lockedIndices.length,
    total: merged.rules.length,
  };

  // Count actual updates (rules that changed action)
  for (const rule of imported.rules) {
    const existing = local.rules.find(r => r.tool === rule.tool && r.pattern === rule.pattern);
    if (existing && existing.action !== rule.action) {
      result.updated++;
      result.unchanged--;
    }
  }

  if (!dryRun) {
    writePolicies(merged);
  }
  return result;
}

// ── Merge ────────────────────────────────────────────────────────────────────

export function mergePolicies(local: Policy, imported: Policy, lockedIndices: number[] = []): Policy {
  const merged: Rule[] = [];
  const seen = new Set<string>();

  // Locked rules from imported go first (immutable)
  for (const idx of lockedIndices) {
    if (idx >= 0 && idx < imported.rules.length) {
      const rule = imported.rules[idx];
      const key = `${rule.tool}||${rule.pattern}`;
      merged.push(rule);
      seen.add(key);
    }
  }

  // Imported rules (non-locked) — imported wins on conflict
  for (const rule of imported.rules) {
    const key = `${rule.tool}||${rule.pattern}`;
    if (seen.has(key)) continue; // Already added as locked
    merged.push(rule);
    seen.add(key);
  }

  // Local rules that don't conflict with imported
  for (const rule of local.rules) {
    const key = `${rule.tool}||${rule.pattern}`;
    if (!seen.has(key)) {
      merged.push(rule);
      seen.add(key);
    }
  }

  // Merge per_project: imported overrides by project name, local-only preserved
  const perProject = { ...(local.per_project ?? {}), ...(imported.per_project ?? {}) };

  return {
    rules: merged,
    ai: imported.ai ?? local.ai,
    per_project: Object.keys(perProject).length > 0 ? perProject : undefined,
  };
}

// ── Diff ─────────────────────────────────────────────────────────────────────

export interface PolicyDiff {
  added: Rule[];
  removed: Rule[];
  changed: Array<{ rule: Rule; localAction: string; importedAction: string }>;
  unchanged: number;
}

export function diffPolicies(inputPath: string): PolicyDiff {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const imported: Policy = { rules: parsed.rules, ai: parsed.ai, per_project: parsed.per_project };

  if (!validatePolicyFile(imported)) {
    throw new Error('Invalid policy file');
  }

  const local = loadPolicies();
  const localMap = new Map(local.rules.map(r => [`${r.tool}||${r.pattern}`, r]));
  const importedMap = new Map(imported.rules.map(r => [`${r.tool}||${r.pattern}`, r]));

  const added: Rule[] = [];
  const changed: PolicyDiff['changed'] = [];
  let unchanged = 0;

  for (const [key, rule] of importedMap) {
    const localRule = localMap.get(key);
    if (!localRule) {
      added.push(rule);
    } else if (localRule.action !== rule.action) {
      changed.push({ rule, localAction: localRule.action, importedAction: rule.action });
    } else {
      unchanged++;
    }
  }

  const removed: Rule[] = [];
  for (const [key, rule] of localMap) {
    if (!importedMap.has(key)) {
      removed.push(rule);
    }
  }

  return { added, removed, changed, unchanged };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function writePolicies(policies: Policy): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = POLICIES_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(policies, null, 2), 'utf-8');
  fs.renameSync(tmp, POLICIES_PATH);
}
