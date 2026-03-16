/**
 * Rules Engine — Phase 4
 * Loads policies.json and matches rules against tool calls.
 * Per-project rules checked first, then global rules. First match wins.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface Rule {
  tool: string;
  pattern: string;
  action: 'allow' | 'deny';
}

export interface AIConfig {
  enabled: boolean;
  confidence_threshold: number;
}

export interface PerProjectConfig {
  rules: Rule[];
}

export interface Policy {
  rules: Rule[];
  ai?: AIConfig;
  per_project?: Record<string, PerProjectConfig>;
}

export interface RuleResult {
  action: 'allow' | 'deny';
  pattern: string;
  source: 'project' | 'global';
}

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const POLICIES_PATH = path.join(CONFIG_DIR, 'policies.json');

/**
 * Loads policies.json from ~/.chief-of-agent/policies.json.
 * Returns empty policy (no rules, AI disabled) if file doesn't exist or is malformed.
 */
export function loadPolicies(): Policy {
  try {
    if (!fs.existsSync(POLICIES_PATH)) {
      return { rules: [], ai: { enabled: false, confidence_threshold: 0.8 } };
    }
    const raw = fs.readFileSync(POLICIES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Policy;
    // Ensure required fields exist
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      ai: parsed.ai ?? { enabled: false, confidence_threshold: 0.8 },
      per_project: parsed.per_project ?? {},
    };
  } catch {
    return { rules: [], ai: { enabled: false, confidence_threshold: 0.8 } };
  }
}

/**
 * Compiles a rule pattern into a RegExp.
 * Returns null if pattern is malformed (logs a warning and skips it).
 */
function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    console.warn(`[chief-of-agent] Malformed rule pattern (skipped): ${pattern}`);
    return null;
  }
}

/**
 * Tests a single rule against the given tool and detail string.
 * tool is exact-matched, pattern is partial regex match.
 */
function testRule(rule: Rule, tool: string, detail: string): boolean {
  if (rule.tool !== tool) return false;
  const re = compilePattern(rule.pattern);
  if (!re) return false;
  return re.test(detail);
}

/**
 * Matches the first applicable rule against project/tool/detail.
 * Per-project rules checked first, then global rules.
 * Returns the matched RuleResult or null if nothing matches.
 */
export function matchRule(
  policies: Policy,
  project: string,
  tool: string,
  detail: string,
): RuleResult | null {
  // Tier 1: per-project rules
  const projectConfig = policies.per_project?.[project];
  if (projectConfig?.rules) {
    for (const rule of projectConfig.rules) {
      if (testRule(rule, tool, detail)) {
        return { action: rule.action, pattern: rule.pattern, source: 'project' };
      }
    }
  }

  // Tier 2: global rules
  for (const rule of policies.rules) {
    if (testRule(rule, tool, detail)) {
      return { action: rule.action, pattern: rule.pattern, source: 'global' };
    }
  }

  return null;
}
