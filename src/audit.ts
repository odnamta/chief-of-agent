/**
 * Audit Log — Phase 4
 * Append-only JSONL log of all auto-decisions.
 * Rotates at 10MB, keeps 2 rotated files.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const AUDIT_PATH = path.join(CONFIG_DIR, 'audit.jsonl');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROTATED_FILES = 2;

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  project: string;
  tool: string;
  detail: string;
  decision: 'allow' | 'deny' | 'ask';
  tier: 'rule' | 'ai' | 'dashboard';
  // Rule tier
  rule?: string;
  // AI tier
  confidence?: number;
  reason?: string;
  latency_ms: number;
}

/**
 * Rotates audit.jsonl if it exceeds MAX_SIZE_BYTES.
 * Keeps the last MAX_ROTATED_FILES rotated copies.
 */
function maybeRotate(): void {
  try {
    if (!fs.existsSync(AUDIT_PATH)) return;
    const stat = fs.statSync(AUDIT_PATH);
    if (stat.size < MAX_SIZE_BYTES) return;

    // Shift existing rotated files
    for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
      const older = `${AUDIT_PATH}.${i}`;
      const newer = `${AUDIT_PATH}.${i + 1}`;
      if (fs.existsSync(older)) {
        fs.renameSync(older, newer);
      }
    }

    // Remove overflow if more than MAX_ROTATED_FILES
    const overflow = `${AUDIT_PATH}.${MAX_ROTATED_FILES + 1}`;
    if (fs.existsSync(overflow)) {
      try { fs.unlinkSync(overflow); } catch { /* ignore */ }
    }

    // Rotate current file to .1
    fs.renameSync(AUDIT_PATH, `${AUDIT_PATH}.1`);
  } catch {
    // Rotation failure is non-fatal — don't block the decision chain
  }
}

/**
 * Ensures ~/.chief-of-agent directory exists.
 */
function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Appends a single audit entry to audit.jsonl.
 * Checks rotation before each append.
 */
export function logAudit(entry: AuditEntry): void {
  try {
    ensureDir();
    maybeRotate();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(AUDIT_PATH, line, 'utf-8');
  } catch {
    // Audit failure is non-fatal — don't block the decision chain
  }
}

/**
 * Reads the last N entries from audit.jsonl.
 * Returns entries in chronological order (oldest first).
 */
export function readAudit(limit = 20): AuditEntry[] {
  try {
    if (!fs.existsSync(AUDIT_PATH)) return [];
    const content = fs.readFileSync(AUDIT_PATH, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const tail = lines.slice(-limit);
    return tail
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is AuditEntry => e !== null);
  } catch {
    return [];
  }
}

export interface RuleSuggestion {
  tool: string;
  pattern: string;
  action: 'allow' | 'deny';
  approvalCount: number;
  denialCount: number;
  consistent: boolean;
}

/**
 * Analyzes the audit log for patterns and suggests rules.
 * Groups entries by (tool, detail) and finds consistent patterns.
 *
 * Only suggests rules for patterns that:
 * - Have been seen 3+ times
 * - Are 100% consistent (all same decision, no conflicts)
 * - Were handled by the dashboard tier (human decisions worth automating)
 */
export function suggestRules(entries: AuditEntry[]): RuleSuggestion[] {
  // Group dashboard-tier decisions by (tool, detail)
  const groups = new Map<string, { allow: number; deny: number; tool: string; detail: string }>();

  for (const entry of entries) {
    if (entry.tier !== 'dashboard') continue;
    const key = `${entry.tool}||${entry.detail}`;
    const existing = groups.get(key) ?? { allow: 0, deny: 0, tool: entry.tool, detail: entry.detail };
    if (entry.decision === 'allow') existing.allow++;
    else if (entry.decision === 'deny') existing.deny++;
    groups.set(key, existing);
  }

  const suggestions: RuleSuggestion[] = [];

  for (const { allow, deny, tool, detail } of groups.values()) {
    const total = allow + deny;
    if (total < 3) continue;

    const consistent = allow === 0 || deny === 0;
    const action: 'allow' | 'deny' = allow > deny ? 'allow' : 'deny';

    suggestions.push({
      tool,
      pattern: escapeRegExp(detail),
      action,
      approvalCount: allow,
      denialCount: deny,
      consistent,
    });
  }

  // Sort by total count descending
  return suggestions.sort((a, b) => (b.approvalCount + b.denialCount) - (a.approvalCount + a.denialCount));
}

/**
 * Escapes special regex characters in a literal string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
