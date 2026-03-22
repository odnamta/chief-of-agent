/**
 * GET /api/audit — Returns recent audit log entries.
 * Reads ~/.chief-of-agent/audit.jsonl (append-only JSONL).
 * Supports ?last=N parameter (default: 100).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUDIT_PATH = path.join(os.homedir(), '.chief-of-agent', 'audit.jsonl');

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  project: string;
  tool: string;
  detail: string;
  decision: 'allow' | 'deny' | 'ask';
  tier: 'rule' | 'ai' | 'dashboard';
  rule?: string;
  confidence?: number;
  reason?: string;
  latency_ms?: number;
}

export async function GET(req: NextRequest) {
  try {
    const last = parseInt(req.nextUrl.searchParams.get('last') ?? '100', 10);

    if (!fs.existsSync(AUDIT_PATH)) {
      return NextResponse.json({ entries: [], total: 0 });
    }

    const content = fs.readFileSync(AUDIT_PATH, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const total = lines.length;

    // Parse last N entries
    const entries: AuditEntry[] = [];
    const slice = lines.slice(-last);
    for (const line of slice) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip malformed lines
      }
    }

    // Return newest first
    entries.reverse();

    return NextResponse.json({ entries, total });
  } catch {
    return NextResponse.json({ entries: [], total: 0 });
  }
}
