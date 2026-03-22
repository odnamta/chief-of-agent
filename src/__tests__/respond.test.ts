import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { matchRule, loadPolicies } from '../rules.js';
import { writePendingRequest, removePendingRequest, pollForResponse, writeResponse } from '../pending.js';
import { logAudit, readAudit, suggestRules } from '../audit.js';

const CONFIG_DIR = path.join(os.tmpdir(), `coa-respond-test-${Date.now()}`);
const POLICIES_PATH = path.join(CONFIG_DIR, 'policies.json');
const AUDIT_PATH = path.join(CONFIG_DIR, 'audit.jsonl');
const PENDING_PATH = path.join(CONFIG_DIR, 'pending.json');
const RESPONSES_DIR = path.join(CONFIG_DIR, 'responses');

describe('respond pipeline integration', () => {
  beforeEach(() => {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.mkdirSync(RESPONSES_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
  });

  // ── Tier 1: Rules Engine ──

  it('allow rule returns allow immediately', () => {
    const result = matchRule(
      { rules: [{ tool: 'Read', pattern: '.*', action: 'allow' }] },
      'test-project', 'Read', 'src/parser.ts',
    );
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
  });

  it('deny rule returns deny', () => {
    const result = matchRule(
      { rules: [{ tool: 'Bash', pattern: 'rm\\s+-rf', action: 'deny' }] },
      'test-project', 'Bash', 'rm -rf /',
    );
    expect(result).not.toBeNull();
    expect(result!.action).toBe('deny');
  });

  it('first match wins — deny before allow', () => {
    const result = matchRule(
      { rules: [
        { tool: 'Bash', pattern: 'rm\\s+-rf', action: 'deny' },
        { tool: 'Bash', pattern: '.*', action: 'allow' },
      ]},
      'test-project', 'Bash', 'rm -rf node_modules',
    );
    expect(result!.action).toBe('deny');
  });

  it('no match returns null (falls through to next tier)', () => {
    const result = matchRule(
      { rules: [{ tool: 'Read', pattern: '.*', action: 'allow' }] },
      'test-project', 'Bash', 'echo hello',
    );
    expect(result).toBeNull();
  });

  it('per-project rules are checked before global', () => {
    const result = matchRule(
      {
        rules: [{ tool: 'Bash', pattern: '.*', action: 'deny' }],
        per_project: {
          'my-project': {
            rules: [{ tool: 'Bash', pattern: 'deploy', action: 'allow' }],
          },
        },
      },
      'my-project', 'Bash', 'deploy.sh',
    );
    expect(result!.action).toBe('allow');
  });

  it('malformed regex is skipped gracefully', () => {
    const result = matchRule(
      { rules: [
        { tool: 'Bash', pattern: '[invalid(regex', action: 'deny' },
        { tool: 'Bash', pattern: '.*', action: 'allow' },
      ]},
      'test-project', 'Bash', 'test',
    );
    // Malformed regex skipped, second rule matches
    expect(result!.action).toBe('allow');
  });

  // ── Tier 3: Pending (Menu Bar / Dashboard) ──

  it('pending write + poll + response round-trip', async () => {
    const requestId = '11111111-1111-1111-1111-111111111111';

    writePendingRequest(requestId, {
      sessionId: 's1',
      project: 'test',
      tool: 'Bash',
      detail: 'rm -rf /tmp/cache',
      timestamp: new Date().toISOString(),
      rule: 'rm -rf',
    });

    // Simulate user approving after 100ms
    setTimeout(() => {
      writeResponse(requestId, 'allow');
    }, 100);

    const decision = await pollForResponse(requestId, 5_000);
    expect(decision).toBe('allow');
  });

  it('pending poll times out to ask when no response', async () => {
    const requestId = '22222222-2222-2222-2222-222222222222';

    writePendingRequest(requestId, {
      sessionId: 's1',
      project: 'test',
      tool: 'Bash',
      detail: 'test',
      timestamp: new Date().toISOString(),
      rule: 'test',
    });

    // Very short timeout → should return 'ask'
    const decision = await pollForResponse(requestId, 600);
    expect(decision).toBe('ask');

    removePendingRequest(requestId);
  });

  // ── Audit ──

  it('audit log records decisions correctly', () => {
    const marker = `respond-test-${Date.now()}`;

    logAudit({
      timestamp: new Date().toISOString(),
      sessionId: marker,
      project: marker,
      tool: 'Bash',
      detail: 'git push',
      decision: 'allow',
      tier: 'rule',
      rule: 'git-commands',
      latency_ms: 5,
    });

    logAudit({
      timestamp: new Date().toISOString(),
      sessionId: marker,
      project: marker,
      tool: 'Bash',
      detail: 'rm -rf /',
      decision: 'deny',
      tier: 'rule',
      rule: 'rm-rf',
      latency_ms: 3,
    });

    // Read back all entries, filter to our marker
    const entries = readAudit(2000);
    const ours = entries.filter(e => e.project === marker);
    expect(ours.length).toBe(2);
    expect(ours[0].decision).toBe('allow');
    expect(ours[1].decision).toBe('deny');
  });

  // ── Regex DoS guard ──

  it('rejects patterns longer than 500 chars', () => {
    const longPattern = 'a'.repeat(501);
    const result = matchRule(
      { rules: [
        { tool: 'Bash', pattern: longPattern, action: 'deny' },
        { tool: 'Bash', pattern: '.*', action: 'allow' },
      ]},
      'test-project', 'Bash', 'test',
    );
    // Long pattern skipped, falls through to allow
    expect(result!.action).toBe('allow');
  });
});
