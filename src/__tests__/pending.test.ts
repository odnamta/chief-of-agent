import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writePendingRequest,
  removePendingRequest,
  writeResponse,
  pollForResponse,
} from '../pending.js';

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const PENDING_PATH = path.join(CONFIG_DIR, 'pending.json');
const RESPONSES_DIR = path.join(CONFIG_DIR, 'responses');

describe('pending request validation', () => {
  it('rejects invalid requestId in writePendingRequest', () => {
    expect(() =>
      writePendingRequest('../../etc/passwd', {
        sessionId: 's1',
        project: 'test',
        tool: 'Bash',
        detail: 'test',
        timestamp: new Date().toISOString(),
        rule: 'test',
      }),
    ).toThrow('Invalid requestId');
  });

  it('rejects empty requestId', () => {
    expect(() =>
      writePendingRequest('', {
        sessionId: 's1',
        project: 'test',
        tool: 'Bash',
        detail: 'test',
        timestamp: new Date().toISOString(),
        rule: 'test',
      }),
    ).toThrow('Invalid requestId');
  });

  it('rejects requestId with path separators', () => {
    expect(() =>
      writePendingRequest('abc/def', {
        sessionId: 's1',
        project: 'test',
        tool: 'Bash',
        detail: 'test',
        timestamp: new Date().toISOString(),
        rule: 'test',
      }),
    ).toThrow('Invalid requestId');
  });

  it('accepts valid UUID requestId', () => {
    const validId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    // This should not throw
    writePendingRequest(validId, {
      sessionId: 's1',
      project: 'test',
      tool: 'Bash',
      detail: 'test',
      timestamp: new Date().toISOString(),
      rule: 'test',
    });
    // Clean up
    removePendingRequest(validId);
  });

  it('rejects invalid requestId in writeResponse', () => {
    expect(() =>
      writeResponse('../../../etc/shadow', 'allow'),
    ).toThrow('Invalid requestId');
  });

  it('pollForResponse returns ask for invalid requestId', async () => {
    const result = await pollForResponse('not-a-uuid', 100);
    expect(result).toBe('ask');
  });
});
