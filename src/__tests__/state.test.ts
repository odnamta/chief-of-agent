import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager, type SessionState } from '../state.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('StateManager', () => {
  let tmpDir: string;
  let manager: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-test-'));
    manager = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers a new session', async () => {
    await manager.register('abc123', '/Users/dio/project', 'my-project');
    const sessions = await manager.getAll();
    expect(sessions['abc123']).toBeDefined();
    expect(sessions['abc123'].project).toBe('my-project');
    expect(sessions['abc123'].status).toBe('working');
  });

  it('unregisters a session', async () => {
    await manager.register('abc123', '/Users/dio/project', 'my-project');
    await manager.unregister('abc123');
    const sessions = await manager.getAll();
    expect(sessions['abc123']).toBeUndefined();
  });

  it('updates session status and event', async () => {
    await manager.register('abc123', '/path', 'proj');
    await manager.updateStatus('abc123', 'waiting', 'Notification:permission_prompt', 'Bash: git push');
    const sessions = await manager.getAll();
    expect(sessions['abc123'].status).toBe('waiting');
    expect(sessions['abc123'].last_event).toBe('Notification:permission_prompt');
    expect(sessions['abc123'].waiting_context).toBe('Bash: git push');
  });

  it('returns empty object when no state file exists', async () => {
    const sessions = await manager.getAll();
    expect(sessions).toEqual({});
  });

  it('handles concurrent writes without corruption', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      manager.register(`session-${i}`, `/path/${i}`, `project-${i}`)
    );
    await Promise.all(promises);
    const sessions = await manager.getAll();
    expect(Object.keys(sessions).length).toBe(5);
  });

  it('getAll returns snapshot (not reference)', async () => {
    await manager.register('abc', '/path', 'proj');
    const s1 = await manager.getAll();
    s1['abc'].status = 'error';
    const s2 = await manager.getAll();
    expect(s2['abc'].status).toBe('working');
  });
});
