/**
 * POST /api/auto-decision — CLI broadcasts auto-decisions (rule/AI tier) here.
 * Dashboard receives via SSE and shows in the Auto-Decisions feed.
 *
 * This route accepts the broadcast and pushes it to all connected SSE clients
 * via the auto-decision channel. It does NOT block — always returns 200 immediately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { broadcastAutoDecisionSSE } from '@/lib/auto-decision-store';

export const runtime = 'nodejs';

export interface AutoDecisionPayload {
  project: string;
  tool: string;
  detail: string;
  decision: 'allow' | 'deny';
  tier: 'rule' | 'ai';
  rule?: string;
  confidence?: number;
  reason?: string;
  latency_ms: number;
  timestamp: string;
}

export async function POST(req: NextRequest) {
  let body: AutoDecisionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project, tool, decision, tier } = body;
  if (!project || !tool || !decision || !tier) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Broadcast to SSE clients — fire and forget
  broadcastAutoDecisionSSE(body);

  return NextResponse.json({ ok: true });
}
