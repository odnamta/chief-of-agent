/**
 * GET /api/sessions — Returns current state.json contents.
 * Used by the agent grid on the dashboard.
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { StateFile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_PATH = path.join(os.homedir(), '.chief-of-agent', 'state.json');

export async function GET() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return NextResponse.json({ sessions: {} } satisfies StateFile);
    }

    const content = fs.readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(content) as StateFile;
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ sessions: {} } satisfies StateFile);
  }
}
