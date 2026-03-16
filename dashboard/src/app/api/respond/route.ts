/**
 * POST /api/respond — Dashboard calls this when user clicks Approve/Deny/Terminal.
 * Resolves the long-polling Promise in the pending store.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolvePending } from '@/lib/pending-store';
import type { RespondPayload, Decision } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_DECISIONS: Decision[] = ['allow', 'deny', 'ask'];

export async function POST(req: NextRequest) {
  let body: RespondPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { requestId, decision } = body;

  if (!requestId) {
    return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
  }

  if (!VALID_DECISIONS.includes(decision)) {
    return NextResponse.json(
      { error: `Invalid decision. Must be one of: ${VALID_DECISIONS.join(', ')}` },
      { status: 400 },
    );
  }

  const found = resolvePending(requestId, decision);

  if (!found) {
    return NextResponse.json(
      { error: 'Request not found — it may have timed out' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
