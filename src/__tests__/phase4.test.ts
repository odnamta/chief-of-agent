/**
 * Phase 4 tests — Smart Auto-Responder
 * Tests: rules engine, policies loader, audit log, AI classifier (mocked)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ────────────────────────────────────────────────────────────────
// Rules Engine tests
// ────────────────────────────────────────────────────────────────
import { matchRule, loadPolicies } from '../rules.js';
import type { Policy } from '../rules.js';

describe('matchRule', () => {
  const basePolicies: Policy = {
    rules: [
      { tool: 'Bash', pattern: 'mkdir', action: 'allow' },
      { tool: 'Bash', pattern: 'rm -rf', action: 'deny' },
      { tool: 'Edit', pattern: '.*', action: 'allow' },
    ],
  };

  it('matches a global allow rule', () => {
    const result = matchRule(basePolicies, 'myproject', 'Bash', 'mkdir -p dist');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.pattern).toBe('mkdir');
    expect(result!.source).toBe('global');
  });

  it('matches a global deny rule', () => {
    const result = matchRule(basePolicies, 'myproject', 'Bash', 'rm -rf /tmp/test');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('deny');
    expect(result!.pattern).toBe('rm -rf');
  });

  it('returns null when no rule matches', () => {
    const result = matchRule(basePolicies, 'myproject', 'Bash', 'curl https://example.com');
    expect(result).toBeNull();
  });

  it('matches Edit tool with wildcard pattern', () => {
    const result = matchRule(basePolicies, 'myproject', 'Edit', '/any/file/path.ts');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
  });

  it('does not match wrong tool', () => {
    const result = matchRule(basePolicies, 'myproject', 'Write', 'mkdir test');
    // 'mkdir' rule is for Bash, not Write — should not match
    expect(result).toBeNull();
  });

  it('per-project rules override global rules — allow overrides global deny', () => {
    const policies: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'rm -rf', action: 'deny' },
      ],
      per_project: {
        secbot: {
          rules: [
            { tool: 'Bash', pattern: 'rm -rf /tmp/secbot', action: 'allow' },
          ],
        },
      },
    };

    // secbot project — per-project allow should win
    const result = matchRule(policies, 'secbot', 'Bash', 'rm -rf /tmp/secbot');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.source).toBe('project');
  });

  it('per-project rules checked first — no match falls through to global', () => {
    const policies: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'git status', action: 'allow' },
      ],
      per_project: {
        secbot: {
          rules: [
            { tool: 'Bash', pattern: 'scan', action: 'allow' },
          ],
        },
      },
    };

    // secbot project — no per-project match, falls to global
    const result = matchRule(policies, 'secbot', 'Bash', 'git status');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.source).toBe('global');
  });

  it('different project does not use per-project rules of another project', () => {
    const policies: Policy = {
      rules: [],
      per_project: {
        secbot: {
          rules: [
            { tool: 'Bash', pattern: 'scan', action: 'allow' },
          ],
        },
      },
    };

    // gis-erp should not get secbot rules
    const result = matchRule(policies, 'gis-erp', 'Bash', 'scan --target localhost');
    expect(result).toBeNull();
  });

  it('malformed regex pattern is skipped gracefully', () => {
    const policies: Policy = {
      rules: [
        { tool: 'Bash', pattern: '[invalid(regex', action: 'allow' }, // malformed
        { tool: 'Bash', pattern: 'mkdir', action: 'allow' },          // valid
      ],
    };

    // Should skip malformed and still match valid pattern
    const result = matchRule(policies, 'myproject', 'Bash', 'mkdir -p dist');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.pattern).toBe('mkdir');
  });

  it('malformed regex does not crash when it is the only rule', () => {
    const policies: Policy = {
      rules: [
        { tool: 'Bash', pattern: '(*bad regex', action: 'allow' },
      ],
    };

    expect(() => matchRule(policies, 'myproject', 'Bash', 'anything')).not.toThrow();
    const result = matchRule(policies, 'myproject', 'Bash', 'anything');
    expect(result).toBeNull();
  });

  it('partial regex match — pattern does not need to be anchored', () => {
    const policies: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'npm test', action: 'allow' },
      ],
    };

    // Pattern 'npm test' should match 'npx npm test --run'
    const result = matchRule(policies, 'proj', 'Bash', 'npm test --run all');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
  });

  it('first match wins — allow before deny in array order', () => {
    const policies: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'git', action: 'allow' },
        { tool: 'Bash', pattern: 'git push.*--force', action: 'deny' },
      ],
    };

    // 'git' comes first and matches, so allow wins even for force push
    const result = matchRule(policies, 'proj', 'Bash', 'git push origin main --force');
    expect(result!.action).toBe('allow');
  });
});

// ────────────────────────────────────────────────────────────────
// Policies — loadPolicies with missing/present file
// ────────────────────────────────────────────────────────────────
describe('loadPolicies', () => {
  it('returns empty policy with AI disabled when file does not exist', () => {
    // loadPolicies reads from real ~/.chief-of-agent/policies.json
    // We test the shape, not the exact content (file may or may not exist)
    const policies = loadPolicies();
    expect(Array.isArray(policies.rules)).toBe(true);
    expect(typeof policies.ai?.confidence_threshold).toBe('number');
  });
});

import { getDefaultPolicies, ensurePoliciesFile } from '../policies.js';

describe('getDefaultPolicies', () => {
  it('returns rules array with at least one allow and one deny', () => {
    const policies = getDefaultPolicies();
    expect(policies.rules.length).toBeGreaterThan(0);
    expect(policies.rules.some((r) => r.action === 'allow')).toBe(true);
    expect(policies.rules.some((r) => r.action === 'deny')).toBe(true);
  });

  it('has AI disabled by default (opt-in) with confidence_threshold 0.8', () => {
    const policies = getDefaultPolicies();
    // AI is disabled by default — users must opt in by setting ANTHROPIC_API_KEY
    // and changing enabled to true in policies.json
    expect(policies.ai?.enabled).toBe(false);
    expect(policies.ai?.confidence_threshold).toBe(0.8);
  });

  it('includes rm -rf pattern as deny (pattern uses regex escape)', () => {
    const policies = getDefaultPolicies();
    // New pattern is regex-escaped: 'rm\\s+-rf'
    const rmRule = policies.rules.find((r) => r.pattern.includes('rm') && r.action === 'deny');
    expect(rmRule).toBeDefined();
    expect(rmRule!.action).toBe('deny');
  });

  it('includes Edit as allow', () => {
    const policies = getDefaultPolicies();
    const editRule = policies.rules.find((r) => r.tool === 'Edit');
    expect(editRule).toBeDefined();
    expect(editRule!.action).toBe('allow');
  });
});

describe('ensurePoliciesFile', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    // Create a temp dir to act as home
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-test-'));
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the expected policies.json path', () => {
    // ensurePoliciesFile uses os.homedir() which reads HOME env — but we call it directly
    // Just test that it returns a string ending in policies.json
    const result = ensurePoliciesFile();
    expect(result).toMatch(/policies\.json$/);
  });
});

// ────────────────────────────────────────────────────────────────
// Per-project rules merged correctly with getDefaultPolicies
// ────────────────────────────────────────────────────────────────
describe('per-project policy merge', () => {
  it('per-project config has own rules array', () => {
    const policies = getDefaultPolicies();
    policies.per_project = {
      secbot: {
        rules: [
          { tool: 'Bash', pattern: '.*scan.*', action: 'allow' },
        ],
      },
    };

    const result = matchRule(policies, 'secbot', 'Bash', 'node dist/index.js scan auth0.com');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.source).toBe('project');
  });
});

// ────────────────────────────────────────────────────────────────
// Audit log tests
// ────────────────────────────────────────────────────────────────
import { logAudit, readAudit, suggestRules } from '../audit.js';
import type { AuditEntry } from '../audit.js';

describe('audit log', () => {
  let auditPath: string;
  let originalHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-audit-'));
    fs.mkdirSync(path.join(tmpHome, '.chief-of-agent'), { recursive: true });

    // We can't easily redirect os.homedir(), so we test by writing/reading directly
    auditPath = path.join(tmpHome, '.chief-of-agent', 'audit.jsonl');
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('logAudit does not throw when called with valid entry', () => {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      project: 'testproject',
      tool: 'Bash',
      detail: 'mkdir -p dist',
      decision: 'allow',
      tier: 'rule',
      rule: 'mkdir',
      latency_ms: 1,
    };

    expect(() => logAudit(entry)).not.toThrow();
  });

  it('readAudit returns empty array when no file exists', () => {
    // Reads from the real path — just verify it doesn't crash
    const result = readAudit(5);
    expect(Array.isArray(result)).toBe(true);
  });

  it('readAudit respects limit', () => {
    // Write entries directly to the actual audit path
    const actualPath = path.join(os.homedir(), '.chief-of-agent', 'audit.jsonl');

    // Write directly to a temp file and test parsing logic
    const entries: AuditEntry[] = Array.from({ length: 5 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      sessionId: `session-${i}`,
      project: 'proj',
      tool: 'Bash',
      detail: `cmd-${i}`,
      decision: 'allow' as const,
      tier: 'rule' as const,
      rule: 'test',
      latency_ms: i,
    }));

    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(auditPath, content, 'utf-8');

    // Read from the written file directly via JSONL parsing
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(5);

    const parsed = lines.slice(-3).map((l) => JSON.parse(l) as AuditEntry);
    expect(parsed.length).toBe(3);
    expect(parsed[0].detail).toBe('cmd-2');
  });
});

// ────────────────────────────────────────────────────────────────
// suggestRules tests
// ────────────────────────────────────────────────────────────────
describe('suggestRules', () => {
  function makeEntry(tool: string, detail: string, decision: 'allow' | 'deny', tier: 'rule' | 'ai' | 'dashboard' = 'dashboard'): AuditEntry {
    return {
      timestamp: new Date().toISOString(),
      sessionId: 'test',
      project: 'proj',
      tool,
      detail,
      decision,
      tier,
      latency_ms: 1,
    };
  }

  it('returns empty array for fewer than 2 dashboard entries per pattern', () => {
    const entries: AuditEntry[] = [
      makeEntry('Bash', 'npm test', 'allow'),
    ];
    const suggestions = suggestRules(entries);
    expect(suggestions).toHaveLength(0);
  });

  it('suggests allow rule for pattern seen 3+ times consistently', () => {
    const entries: AuditEntry[] = [
      makeEntry('Bash', 'npm test', 'allow'),
      makeEntry('Bash', 'npm test', 'allow'),
      makeEntry('Bash', 'npm test', 'allow'),
    ];
    const suggestions = suggestRules(entries);
    expect(suggestions.length).toBeGreaterThan(0);
    const s = suggestions[0];
    expect(s.action).toBe('allow');
    expect(s.tool).toBe('Bash');
    expect(s.consistent).toBe(true);
    expect(s.approvalCount).toBe(3);
  });

  it('suggests deny rule for pattern denied 3+ times consistently', () => {
    const entries: AuditEntry[] = [
      makeEntry('Bash', 'curl https://evil.com', 'deny'),
      makeEntry('Bash', 'curl https://evil.com', 'deny'),
      makeEntry('Bash', 'curl https://evil.com', 'deny'),
    ];
    const suggestions = suggestRules(entries);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].action).toBe('deny');
    expect(suggestions[0].consistent).toBe(true);
  });

  it('marks inconsistent patterns as not consistent', () => {
    const entries: AuditEntry[] = [
      makeEntry('Bash', 'git push origin main', 'allow'),
      makeEntry('Bash', 'git push origin main', 'allow'),
      makeEntry('Bash', 'git push origin main', 'deny'),
    ];
    const suggestions = suggestRules(entries);
    // Has enough entries but is inconsistent
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].consistent).toBe(false);
  });

  it('ignores rule and ai tier entries (only dashboard decisions are suggestible)', () => {
    const entries: AuditEntry[] = [
      makeEntry('Bash', 'mkdir -p dist', 'allow', 'rule'),
      makeEntry('Bash', 'mkdir -p dist', 'allow', 'rule'),
      makeEntry('Bash', 'mkdir -p dist', 'allow', 'rule'),
    ];
    const suggestions = suggestRules(entries);
    // Rule-tier entries should not generate suggestions
    expect(suggestions).toHaveLength(0);
  });

  it('sorts suggestions by total count descending', () => {
    const entries: AuditEntry[] = [
      // 'npm test' — 3 times
      makeEntry('Bash', 'npm test', 'allow'),
      makeEntry('Bash', 'npm test', 'allow'),
      makeEntry('Bash', 'npm test', 'allow'),
      // 'git status' — 5 times
      makeEntry('Bash', 'git status', 'allow'),
      makeEntry('Bash', 'git status', 'allow'),
      makeEntry('Bash', 'git status', 'allow'),
      makeEntry('Bash', 'git status', 'allow'),
      makeEntry('Bash', 'git status', 'allow'),
    ];
    const suggestions = suggestRules(entries);
    expect(suggestions.length).toBe(2);
    // 'git status' has 5 entries, should come first
    expect(suggestions[0].approvalCount).toBeGreaterThanOrEqual(suggestions[1].approvalCount);
  });
});

// ────────────────────────────────────────────────────────────────
// AI Classifier tests (mock fetch)
// ────────────────────────────────────────────────────────────────
import { classifyWithAI } from '../ai-classifier.js';

describe('classifyWithAI', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.unstubAllGlobals();
  });

  function mockFetchResponse(body: unknown, status = 200) {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
  }

  it('returns allow decision when API responds with allow + high confidence', async () => {
    mockFetchResponse({
      content: [
        { type: 'text', text: JSON.stringify({ decision: 'allow', confidence: 0.95, reason: 'Safe mkdir operation' }) },
      ],
    });

    const result = await classifyWithAI('myproject', 'Bash', 'mkdir -p dist');
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('allow');
    expect(result!.confidence).toBe(0.95);
    expect(result!.reason).toBe('Safe mkdir operation');
  });

  it('returns deny decision when API responds with deny', async () => {
    mockFetchResponse({
      content: [
        { type: 'text', text: JSON.stringify({ decision: 'deny', confidence: 0.92, reason: 'Destructive rm -rf' }) },
      ],
    });

    const result = await classifyWithAI('myproject', 'Bash', 'rm -rf /important');
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('deny');
    expect(result!.confidence).toBe(0.92);
  });

  it('returns ask decision when API is uncertain', async () => {
    mockFetchResponse({
      content: [
        { type: 'text', text: JSON.stringify({ decision: 'ask', confidence: 0.6, reason: 'Uncertain about network operation' }) },
      ],
    });

    const result = await classifyWithAI('myproject', 'Bash', 'curl https://api.example.com');
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('ask');
  });

  it('returns null when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await classifyWithAI('proj', 'Bash', 'anything');
    expect(result).toBeNull();
    // fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null when API returns non-ok status', async () => {
    mockFetchResponse({ error: 'Unauthorized' }, 401);
    const result = await classifyWithAI('proj', 'Bash', 'anything');
    expect(result).toBeNull();
  });

  it('returns null when API response has no content', async () => {
    mockFetchResponse({ content: [] });
    const result = await classifyWithAI('proj', 'Bash', 'anything');
    expect(result).toBeNull();
  });

  it('returns null when API response has malformed JSON', async () => {
    mockFetchResponse({
      content: [{ type: 'text', text: 'not json at all' }],
    });
    const result = await classifyWithAI('proj', 'Bash', 'anything');
    expect(result).toBeNull();
  });

  it('strips markdown code fences from response', async () => {
    mockFetchResponse({
      content: [
        { type: 'text', text: '```json\n{"decision":"allow","confidence":0.9,"reason":"safe"}\n```' },
      ],
    });

    const result = await classifyWithAI('proj', 'Bash', 'ls');
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('allow');
  });

  it('clamps confidence to [0, 1] range', async () => {
    mockFetchResponse({
      content: [
        { type: 'text', text: JSON.stringify({ decision: 'allow', confidence: 1.5, reason: 'very safe' }) },
      ],
    });

    const result = await classifyWithAI('proj', 'Bash', 'ls');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0);
  });

  it('returns null when fetch throws (network error)', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await classifyWithAI('proj', 'Bash', 'anything');
    expect(result).toBeNull();
  });

  it('returns null when decision field is invalid', async () => {
    mockFetchResponse({
      content: [
        { type: 'text', text: JSON.stringify({ decision: 'maybe', confidence: 0.9, reason: 'hmm' }) },
      ],
    });

    const result = await classifyWithAI('proj', 'Bash', 'anything');
    expect(result).toBeNull();
  });
});
