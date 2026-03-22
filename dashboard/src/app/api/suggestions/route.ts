/**
 * GET /api/suggestions — Returns rule suggestions and automation metrics.
 * Reads audit.jsonl, analyzes patterns, returns suggestions + metrics.
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUDIT_PATH = path.join(os.homedir(), '.chief-of-agent', 'audit.jsonl');

interface AuditEntry {
  timestamp: string;
  tool: string;
  detail: string;
  decision: 'allow' | 'deny' | 'ask';
  tier: 'rule' | 'ai' | 'dashboard';
  project: string;
  rule?: string;
}

export async function GET() {
  try {
    if (!fs.existsSync(AUDIT_PATH)) {
      return NextResponse.json({ suggestions: [], metrics: { totalDecisions: 0, automationRate: 0, potentialRate: 0, savingsPerDay: 0 } });
    }

    const content = fs.readFileSync(AUDIT_PATH, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    const entries: AuditEntry[] = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }

    const total = entries.length;
    const automated = entries.filter(e => e.tier === 'rule' || e.tier === 'ai').length;
    const manual = entries.filter(e => e.tier === 'dashboard').length;

    // Simple pattern grouping (matches CLI's suggestRules logic)
    const groups = new Map<string, { allow: number; deny: number; tool: string; detail: string }>();
    for (const e of entries) {
      if (e.tier !== 'dashboard') continue;
      const key = `${e.tool}||${e.detail}`;
      const g = groups.get(key) ?? { allow: 0, deny: 0, tool: e.tool, detail: e.detail };
      if (e.decision === 'allow') g.allow++;
      else if (e.decision === 'deny') g.deny++;
      groups.set(key, g);
    }

    const suggestions = [];
    for (const { allow, deny, tool, detail } of groups.values()) {
      const t = allow + deny;
      if (t < 2) continue;
      const consistent = allow === 0 || deny === 0;
      suggestions.push({
        tool,
        detail: detail.slice(0, 200),
        action: allow > deny ? 'allow' : 'deny',
        count: t,
        consistent,
        allowCount: allow,
        denyCount: deny,
      });
    }

    suggestions.sort((a, b) => b.count - a.count);

    const consistentCount = suggestions.filter(s => s.consistent).length;
    const automationRate = total > 0 ? Math.round(automated / total * 100) : 0;
    const potentialSaved = Math.min(consistentCount * 3, manual);
    const potentialRate = total > 0 ? Math.round((automated + potentialSaved) / total * 100) : 0;

    return NextResponse.json({
      suggestions: suggestions.slice(0, 20),
      metrics: {
        totalDecisions: total,
        automatedDecisions: automated,
        manualDecisions: manual,
        automationRate,
        potentialRate,
        consistentSuggestions: consistentCount,
        conflictSuggestions: suggestions.length - consistentCount,
      },
    });
  } catch {
    return NextResponse.json({ suggestions: [], metrics: { totalDecisions: 0, automationRate: 0, potentialRate: 0 } });
  }
}
