import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseHookInput } from '../parser.js';
import { StateManager } from '../state.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Integration: full hook flow', () => {
  let tmpDir: string;
  let stateManager: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-integ-'));
    stateManager = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full lifecycle: start -> permission -> stop -> end', async () => {
    // 1. SessionStart
    const startEvent = parseHookInput(JSON.stringify({
      session_id: 'sess-1',
      hook_event_name: 'SessionStart',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
      source: 'startup',
    }));
    await stateManager.register(startEvent.sessionId, startEvent.cwd, startEvent.project);

    let sessions = await stateManager.getAll();
    expect(sessions['sess-1'].status).toBe('working');
    expect(sessions['sess-1'].project).toBe('gis-erp');

    // 2. Permission prompt
    const permEvent = parseHookInput(JSON.stringify({
      session_id: 'sess-1',
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
      message: 'Bash: git push origin main',
    }));
    await stateManager.updateStatus(
      permEvent.sessionId, 'waiting',
      'Notification:permission_prompt', permEvent.context,
    );

    sessions = await stateManager.getAll();
    expect(sessions['sess-1'].status).toBe('waiting');
    expect(sessions['sess-1'].waiting_context).toBe('Bash: git push origin main');

    // 3. Stop (back to working)
    const stopEvent = parseHookInput(JSON.stringify({
      session_id: 'sess-1',
      hook_event_name: 'Stop',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
      last_assistant_message: 'All done.',
    }));
    await stateManager.updateStatus(stopEvent.sessionId, 'working', 'Stop');

    sessions = await stateManager.getAll();
    expect(sessions['sess-1'].status).toBe('working');

    // 4. SessionEnd
    const endEvent = parseHookInput(JSON.stringify({
      session_id: 'sess-1',
      hook_event_name: 'SessionEnd',
      cwd: '/Users/dio/Vibecode/gama/gis-erp',
    }));
    await stateManager.unregister(endEvent.sessionId);

    sessions = await stateManager.getAll();
    expect(sessions['sess-1']).toBeUndefined();
  });

  it('multiple concurrent sessions tracked independently', async () => {
    const projects = ['gis-erp', 'secbot', 'website', 'cekatan', 'migration'];

    for (let i = 0; i < projects.length; i++) {
      await stateManager.register(`sess-${i}`, `/path/${projects[i]}`, projects[i]);
    }

    await stateManager.updateStatus('sess-1', 'waiting', 'Notification:permission_prompt', 'needs approval');
    await stateManager.updateStatus('sess-3', 'error', 'PostToolUseFailure', 'build failed');

    const sessions = await stateManager.getAll();
    expect(Object.keys(sessions).length).toBe(5);
    expect(sessions['sess-0'].status).toBe('working');
    expect(sessions['sess-1'].status).toBe('waiting');
    expect(sessions['sess-2'].status).toBe('working');
    expect(sessions['sess-3'].status).toBe('error');
    expect(sessions['sess-4'].status).toBe('working');
  });
});
