/**
 * Policies Manager — Phase 4
 * Default policy definitions and policies.json bootstrapper.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Policy } from './rules.js';

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const POLICIES_PATH = path.join(CONFIG_DIR, 'policies.json');

/**
 * Returns sensible default policies for a new setup.
 * - Allow: common read/write/build operations
 * - Deny: destructive operations
 * - AI enabled with 0.8 threshold
 */
export function getDefaultPolicies(): Policy {
  return {
    rules: [
      // Safe read-only Bash commands
      { tool: 'Bash', pattern: 'mkdir', action: 'allow' },
      { tool: 'Bash', pattern: '^(ls|cat|head|tail|wc|echo|pwd)(\\s|$)', action: 'allow' },
      // npm/npx operations
      { tool: 'Bash', pattern: 'npm (test|run|install|run build)', action: 'allow' },
      { tool: 'Bash', pattern: 'npx (vitest|tsc|next|prettier)', action: 'allow' },
      // git safe operations
      { tool: 'Bash', pattern: 'git (add|status|log|diff|commit)', action: 'allow' },
      // Swift
      { tool: 'Bash', pattern: 'swift (build|test)', action: 'allow' },
      // Destructive — deny
      { tool: 'Bash', pattern: 'rm -rf', action: 'deny' },
      { tool: 'Bash', pattern: 'git push.*--force', action: 'deny' },
      { tool: 'Bash', pattern: 'git reset --hard', action: 'deny' },
      // File edits are safe
      { tool: 'Edit', pattern: '.*', action: 'allow' },
      { tool: 'Write', pattern: '.*', action: 'allow' },
    ],
    ai: {
      enabled: true,
      confidence_threshold: 0.8,
    },
    per_project: {},
  };
}

/**
 * Ensures ~/.chief-of-agent/policies.json exists.
 * Creates it with defaults if missing. Does NOT overwrite existing file.
 * Returns the path to the policies file.
 */
export function ensurePoliciesFile(): string {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(POLICIES_PATH)) {
    const defaults = getDefaultPolicies();
    fs.writeFileSync(POLICIES_PATH, JSON.stringify(defaults, null, 2), 'utf-8');
  }

  return POLICIES_PATH;
}

/**
 * Writes policies to the file (used by suggest command to append approved rules).
 */
export function writePolicies(policies: Policy): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(POLICIES_PATH, JSON.stringify(policies, null, 2), 'utf-8');
}
