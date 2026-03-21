/**
 * Pending Actions Manager — Phase 4 (menu bar approval)
 *
 * When a rule DENIES an action, the CLI writes the pending request to
 * ~/.chief-of-agent/pending.json. The menu bar app polls this file and
 * shows Approve/Deny cards to the user. Clicking a button writes a
 * response file to ~/.chief-of-agent/responses/<requestId>.json. The
 * CLI polls for that response file with a 120s timeout, then falls back
 * to terminal ("ask").
 *
 * File formats:
 *
 *   pending.json:
 *   {
 *     "requests": {
 *       "<uuid>": {
 *         "sessionId": "abc",
 *         "project": "secbot",
 *         "tool": "Bash",
 *         "detail": "rm -rf node_modules",
 *         "timestamp": "ISO8601",
 *         "rule": "rm -rf"
 *       }
 *     }
 *   }
 *
 *   responses/<requestId>.json:
 *   { "decision": "allow" }
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const PENDING_PATH = path.join(CONFIG_DIR, 'pending.json');
const RESPONSES_DIR = path.join(CONFIG_DIR, 'responses');

// ── Types ────────────────────────────────────────────────────────────────────

export interface PendingRequest {
  sessionId: string;
  project: string;
  tool: string;
  detail: string;
  timestamp: string;
  rule: string;
}

export interface PendingFile {
  requests: Record<string, PendingRequest>;
}

export type PendingDecision = 'allow' | 'deny' | 'ask';

// ── Pending file helpers ─────────────────────────────────────────────────────

function readPendingFile(): PendingFile {
  try {
    if (!fs.existsSync(PENDING_PATH)) return { requests: {} };
    const raw = fs.readFileSync(PENDING_PATH, 'utf-8');
    return JSON.parse(raw) as PendingFile;
  } catch {
    return { requests: {} };
  }
}

function writePendingFile(data: PendingFile): void {
  ensureDirs();
  const tmp = PENDING_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, PENDING_PATH);
}

function ensureDirs(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(RESPONSES_DIR)) {
    fs.mkdirSync(RESPONSES_DIR, { recursive: true });
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidRequestId(id: string): boolean {
  return UUID_RE.test(id);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Writes a pending request to pending.json so the menu bar app can display it.
 */
export function writePendingRequest(requestId: string, req: PendingRequest): void {
  if (!isValidRequestId(requestId)) {
    throw new Error(`[pending] Invalid requestId format: ${requestId}`);
  }
  const data = readPendingFile();
  data.requests[requestId] = req;
  writePendingFile(data);
}

/**
 * Removes a request from pending.json (called after decision is made or timed out).
 */
export function removePendingRequest(requestId: string): void {
  const data = readPendingFile();
  delete data.requests[requestId];
  writePendingFile(data);
}

/**
 * Polls for a response file written by the menu bar app.
 * Polls every 500ms up to timeoutMs (default 120s).
 * Returns the decision, or 'ask' on timeout.
 */
export async function pollForResponse(
  requestId: string,
  timeoutMs: number = 120_000,
): Promise<PendingDecision> {
  if (!isValidRequestId(requestId)) return 'ask';
  ensureDirs();
  const responsePath = path.join(RESPONSES_DIR, `${requestId}.json`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(responsePath)) {
      try {
        const raw = fs.readFileSync(responsePath, 'utf-8');
        const parsed = JSON.parse(raw) as { decision?: string };
        const decision = parsed.decision;
        // Clean up response file
        fs.unlinkSync(responsePath);
        if (decision === 'allow' || decision === 'deny') {
          return decision;
        }
      } catch {
        // Malformed response — fall through to ask
        break;
      }
    }
    await sleep(500);
  }

  return 'ask';
}

/**
 * Writes a response file (used by tests and potentially a CLI subcommand).
 */
export function writeResponse(requestId: string, decision: 'allow' | 'deny'): void {
  if (!isValidRequestId(requestId)) {
    throw new Error(`[pending] Invalid requestId format: ${requestId}`);
  }
  ensureDirs();
  const responsePath = path.join(RESPONSES_DIR, `${requestId}.json`);
  fs.writeFileSync(responsePath, JSON.stringify({ decision }), 'utf-8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
