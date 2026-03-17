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
 * Returns aggressive default policies for a power-user setup.
 *
 * Philosophy:
 *   - Non-destructive operations are auto-approved (no interruptions)
 *   - Destructive operations are auto-denied (require menu bar approval)
 *   - Everything else falls through to the menu bar pending queue
 *
 * Rules are evaluated top-to-bottom; first match wins.
 * DENY rules are listed first so they take priority over broad ALLOW patterns.
 */
export function getDefaultPolicies(): Policy {
  return {
    rules: [
      // ── DENY: destructive operations (checked first) ─────────────────────
      { tool: 'Bash', pattern: 'rm\\s+-rf', action: 'deny' },
      { tool: 'Bash', pattern: 'rm\\s+.*-rf', action: 'deny' },
      { tool: 'Bash', pattern: 'git push.*--force', action: 'deny' },
      { tool: 'Bash', pattern: 'git push.*-f(\\s|$)', action: 'deny' },
      { tool: 'Bash', pattern: 'git reset --hard', action: 'deny' },
      { tool: 'Bash', pattern: 'git clean -fd', action: 'deny' },
      { tool: 'Bash', pattern: 'docker rm\\b', action: 'deny' },
      { tool: 'Bash', pattern: 'docker rmi\\b', action: 'deny' },
      { tool: 'Bash', pattern: 'docker system prune', action: 'deny' },
      { tool: 'Bash', pattern: 'kill -9\\b', action: 'deny' },
      { tool: 'Bash', pattern: 'killall\\b', action: 'deny' },
      { tool: 'Bash', pattern: '> /dev/null', action: 'deny' },
      { tool: 'Bash', pattern: '\\bdd\\s+if=', action: 'deny' },
      { tool: 'Bash', pattern: 'chmod 777', action: 'deny' },

      // ── ALLOW: file operations (Edit/Write are always safe) ───────────────
      { tool: 'Edit', pattern: '.*', action: 'allow' },
      { tool: 'Write', pattern: '.*', action: 'allow' },

      // ── ALLOW: safe read-only shell commands ──────────────────────────────
      { tool: 'Bash', pattern: '^(ls|cat|head|tail|wc|echo|pwd|find|which|env|du|sort|test|true|false)(\\s|$)', action: 'allow' },
      { tool: 'Bash', pattern: '^mkdir\\b', action: 'allow' },

      // ── ALLOW: npm / npx / pnpm (all subcommands) ─────────────────────────
      { tool: 'Bash', pattern: '^npm\\b', action: 'allow' },
      { tool: 'Bash', pattern: '^npx\\b', action: 'allow' },
      { tool: 'Bash', pattern: '^pnpm\\b', action: 'allow' },

      // ── ALLOW: git safe operations ────────────────────────────────────────
      { tool: 'Bash', pattern: '^git (add|status|log|diff|commit|branch|checkout|stash|fetch|init|remote|show)(\\s|$)', action: 'allow' },
      { tool: 'Bash', pattern: '^git push(\\s|$)', action: 'allow' },

      // ── ALLOW: Swift build/test/run ───────────────────────────────────────
      { tool: 'Bash', pattern: '^swift (build|test|run)(\\s|$)', action: 'allow' },

      // ── ALLOW: docker read-only ───────────────────────────────────────────
      { tool: 'Bash', pattern: '^docker (ps|logs|images)(\\s|$)', action: 'allow' },

      // ── ALLOW: network ops ────────────────────────────────────────────────
      { tool: 'Bash', pattern: '^(ssh|scp|rsync|curl|wget)(\\s|$)', action: 'allow' },

      // ── ALLOW: script execution ───────────────────────────────────────────
      { tool: 'Bash', pattern: '^(python3|node|tsx|bash)(\\s|$)', action: 'allow' },

      // ── ALLOW: file ops ───────────────────────────────────────────────────
      { tool: 'Bash', pattern: '^(cp|mv|chmod|chown)(\\s|$)', action: 'allow' },

      // ── ALLOW: search ─────────────────────────────────────────────────────
      { tool: 'Bash', pattern: '^(grep|rg|find|fd)(\\s|$)', action: 'allow' },

      // ── ALLOW: navigation ─────────────────────────────────────────────────
      { tool: 'Bash', pattern: '^(cd|pushd|popd)(\\s|$)', action: 'allow' },
    ],
    ai: {
      // AI classifier is disabled by default — it is opt-in.
      // To enable: set ANTHROPIC_API_KEY env var and change enabled to true.
      enabled: false,
      confidence_threshold: 0.8,
    },
    per_project: {},
  };
}

/**
 * Ensures ~/.chief-of-agent/policies.json exists.
 * Creates it with defaults if missing. Does NOT overwrite existing file.
 * Returns the path to the policies file.
 *
 * The generated file includes a _comment field explaining how to enable AI.
 */
export function ensurePoliciesFile(): string {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(POLICIES_PATH)) {
    const defaults = getDefaultPolicies();
    // Inject a human-readable comment explaining how to enable AI classifier.
    // JSON has no real comment syntax, so we use a _comment field.
    const withComment = {
      _comment: [
        'Chief of Agent — policies.json',
        'Rules are evaluated top-to-bottom; first match wins.',
        'To enable AI classifier (Tier 2): set ANTHROPIC_API_KEY env var',
        '  and change ai.enabled to true below.',
        'Pending actions (no rule match) are routed to the menu bar app.',
      ],
      ...defaults,
    };
    fs.writeFileSync(POLICIES_PATH, JSON.stringify(withComment, null, 2), 'utf-8');
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
