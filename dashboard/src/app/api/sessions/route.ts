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

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const STATE_PATH = path.join(CONFIG_DIR, 'state.json');
const COSTS_PATH = path.join(CONFIG_DIR, 'costs.json');

export async function GET() {
  try {
    let state: StateFile = { sessions: {} };
    if (fs.existsSync(STATE_PATH)) {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as StateFile;
    }

    // Read costs and merge into response
    let costs: Record<string, { estimatedCostUSD?: number }> = {};
    if (fs.existsSync(COSTS_PATH)) {
      try {
        costs = JSON.parse(fs.readFileSync(COSTS_PATH, 'utf-8'));
      } catch { /* ignore malformed costs */ }
    }

    return NextResponse.json({ ...state, costs });
  } catch {
    return NextResponse.json({ sessions: {}, costs: {} });
  }
}
