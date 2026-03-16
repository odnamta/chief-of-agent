/**
 * POST /api/pending — CLI calls this when a PreToolUse hook fires.
 * Long-polls until user responds on the dashboard (or 120s timeout).
 *
 * GET /api/pending — Dashboard calls this on page load for current state.
 */
import { NextRequest, NextResponse } from 'next/server';
import { addPending, getAllPending } from '@/lib/pending-store';
import type { PendingRequest } from '@/lib/types';

export const runtime = 'nodejs';
// Disable body size limit and increase max duration for long-polling
export const maxDuration = 125; // seconds

export async function GET() {
  const pending = getAllPending();
  return NextResponse.json({ pending });
}

export async function POST(req: NextRequest) {
  let body: PendingRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { requestId, sessionId, project, tool, detail, timestamp } = body;
  if (!requestId || !tool) {
    return NextResponse.json({ error: 'Missing required fields: requestId, tool' }, { status: 400 });
  }

  const request: PendingRequest = {
    requestId,
    sessionId: sessionId || 'unknown',
    project: project || 'unknown',
    tool,
    detail: detail || '',
    timestamp: timestamp || new Date().toISOString(),
  };

  // This awaits until the user responds OR 120s timeout
  const decision = await addPending(request);

  return NextResponse.json({ decision });
}
