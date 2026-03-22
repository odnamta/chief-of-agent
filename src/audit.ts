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
  } catch (err) {
    // Rotation failure is non-fatal — don't block the decision chain.
    // But log it so users know the audit log may grow unbounded.
    console.error(`[chief-of-agent] audit log rotation failed: ${err}`);
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
  generalized: boolean; // true if pattern was smart-generalized
  rawDetail: string;    // original detail string before generalization
}

export interface AutomationMetrics {
  totalDecisions: number;
  automatedDecisions: number; // rule + AI tier
  manualDecisions: number;    // dashboard tier
  automationRate: number;     // 0-100
  potentialRate: number;      // 0-100 if suggestions adopted
  savingsPerDay: number;      // estimated manual decisions saved per day
}

/**
 * Analyzes the audit log for patterns and suggests rules.
 * Now with smart pattern generalization:
 * - File paths → dir/.*\\.ext patterns
 * - Bash commands → command.* patterns
 * - npm/git subcommands → grouped by base command
 */
export function suggestRules(entries: AuditEntry[]): RuleSuggestion[] {
  // Group dashboard-tier decisions by (tool, GENERALIZED detail)
  const groups = new Map<string, { allow: number; deny: number; tool: string; detail: string; generalized: string }>();

  for (const entry of entries) {
    if (entry.tier !== 'dashboard') continue;
    const generalized = generalizePattern(entry.tool, entry.detail);
    const key = `${entry.tool}||${generalized}`;
    const existing = groups.get(key) ?? { allow: 0, deny: 0, tool: entry.tool, detail: entry.detail, generalized };
    if (entry.decision === 'allow') existing.allow++;
    else if (entry.decision === 'deny') existing.deny++;
    groups.set(key, existing);
  }

  const suggestions: RuleSuggestion[] = [];

  for (const { allow, deny, tool, detail, generalized } of groups.values()) {
    const total = allow + deny;
    if (total < 2) continue; // Lowered from 3 to catch more patterns with generalization

    const consistent = allow === 0 || deny === 0;
    const action: 'allow' | 'deny' = allow > deny ? 'allow' : 'deny';
    const isGeneralized = generalized !== escapeRegExp(detail);

    suggestions.push({
      tool,
      pattern: generalized,
      action,
      approvalCount: allow,
      denialCount: deny,
      consistent,
      generalized: isGeneralized,
      rawDetail: detail,
    });
  }

  return suggestions.sort((a, b) => (b.approvalCount + b.denialCount) - (a.approvalCount + a.denialCount));
}

/**
 * Compute automation metrics from audit log entries.
 */
export function computeMetrics(entries: AuditEntry[], suggestionsCount: number): AutomationMetrics {
  const total = entries.length;
  const automated = entries.filter(e => e.tier === 'rule' || e.tier === 'ai').length;
  const manual = entries.filter(e => e.tier === 'dashboard').length;
  const rate = total > 0 ? Math.round(automated / total * 100) : 0;

  // Estimate potential: if all consistent suggestions adopted, manual drops by that count
  const potentialManualSaved = Math.min(suggestionsCount * 3, manual); // conservative
  const potentialAutomated = automated + potentialManualSaved;
  const potentialRate = total > 0 ? Math.round(potentialAutomated / total * 100) : 0;

  // Estimate daily savings: assume entries span ~8 hours of work
  const hoursSpan = total > 1
    ? (new Date(entries[entries.length - 1].timestamp).getTime() - new Date(entries[0].timestamp).getTime()) / 3_600_000
    : 8;
  const dailyFactor = hoursSpan > 0 ? 8 / hoursSpan : 1;
  const savingsPerDay = Math.round(potentialManualSaved * dailyFactor);

  return { totalDecisions: total, automatedDecisions: automated, manualDecisions: manual, automationRate: rate, potentialRate, savingsPerDay };
}

/**
 * Smart pattern generalization for common command/path patterns.
 */
export function generalizePattern(tool: string, detail: string): string {
  if (tool === 'Edit' || tool === 'Write' || tool === 'Read') {
    return generalizeFilePath(detail);
  }
  if (tool === 'Bash') {
    return generalizeBashCommand(detail);
  }
  return escapeRegExp(detail);
}

function generalizeFilePath(filepath: string): string {
  // Extract directory and extension
  const lastSlash = filepath.lastIndexOf('/');
  const dir = lastSlash > 0 ? filepath.slice(0, lastSlash) : '';
  const filename = lastSlash > 0 ? filepath.slice(lastSlash + 1) : filepath;
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx > 0 ? filename.slice(dotIdx) : '';

  if (dir && ext) {
    // src/components/Header.tsx → src/components/.*\\.tsx
    return escapeRegExp(dir) + '/.*' + escapeRegExp(ext);
  }
  return escapeRegExp(filepath);
}

function generalizeBashCommand(command: string): string {
  // Split into base command + args
  const parts = command.trim().split(/\s+/);
  const base = parts[0];

  // npm/npx subcommands: npm run build → npm run.*
  if ((base === 'npm' || base === 'npx') && parts.length >= 2) {
    return escapeRegExp(parts.slice(0, 2).join(' ')) + '.*';
  }

  // git subcommands: git push origin main → git push.*
  if (base === 'git' && parts.length >= 2) {
    return escapeRegExp(parts.slice(0, 2).join(' ')) + '.*';
  }

  // swift subcommands: swift build -c release → swift build.*
  if (base === 'swift' && parts.length >= 2) {
    return escapeRegExp(parts.slice(0, 2).join(' ')) + '.*';
  }

  // cd commands: cd /some/path → cd .*
  if (base === 'cd') {
    return 'cd .*';
  }

  // Commands with file arguments: cat file.txt → cat .*
  if (parts.length >= 2 && ['cat', 'head', 'tail', 'less', 'more', 'wc', 'chmod', 'mkdir'].includes(base)) {
    return escapeRegExp(base) + ' .*';
  }

  // Default: escape the whole thing
  return escapeRegExp(command);
}

/**
 * Escapes special regex characters in a literal string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
