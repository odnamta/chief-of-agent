import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validatePolicyFile,
  mergePolicies,
  type ExportedPolicy,
} from '../policy-exchange.js';
import type { Policy, Rule } from '../rules.js';

describe('policy validation', () => {
  it('accepts valid Policy object', () => {
    const policy: Policy = {
      rules: [{ tool: 'Bash', pattern: 'rm -rf', action: 'deny' }],
    };
    expect(validatePolicyFile(policy)).toBe(true);
  });

  it('accepts ExportedPolicy with _meta', () => {
    const exported = {
      _meta: { version: 1, exported_at: '', exported_by: '', machine: '', chief_of_agent_version: '', rule_count: 1 },
      rules: [{ tool: 'Bash', pattern: '.*', action: 'allow' }],
    };
    expect(validatePolicyFile(exported)).toBe(true);
  });

  it('rejects non-object', () => {
    expect(validatePolicyFile(null)).toBe(false);
    expect(validatePolicyFile('string')).toBe(false);
    expect(validatePolicyFile(42)).toBe(false);
  });

  it('rejects object without rules array', () => {
    expect(validatePolicyFile({ ai: {} })).toBe(false);
    expect(validatePolicyFile({ rules: 'not array' })).toBe(false);
  });

  it('rejects rules with invalid action', () => {
    expect(validatePolicyFile({
      rules: [{ tool: 'Bash', pattern: '.*', action: 'maybe' }],
    })).toBe(false);
  });

  it('rejects rules with missing fields', () => {
    expect(validatePolicyFile({
      rules: [{ tool: 'Bash' }], // missing pattern and action
    })).toBe(false);
  });
});

describe('policy merge', () => {
  const localPolicy: Policy = {
    rules: [
      { tool: 'Bash', pattern: 'rm -rf', action: 'deny' },
      { tool: 'Read', pattern: '.*', action: 'allow' },
      { tool: 'Bash', pattern: 'local-only', action: 'allow' },
    ],
  };

  it('adds new rules from imported', () => {
    const imported: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'new-rule', action: 'deny' },
      ],
    };
    const merged = mergePolicies(localPolicy, imported);
    expect(merged.rules.some(r => r.pattern === 'new-rule')).toBe(true);
    expect(merged.rules.length).toBe(4); // 3 local + 1 new
  });

  it('imported wins on conflict', () => {
    const imported: Policy = {
      rules: [
        { tool: 'Read', pattern: '.*', action: 'deny' }, // conflicts with local allow
      ],
    };
    const merged = mergePolicies(localPolicy, imported);
    const readRule = merged.rules.find(r => r.tool === 'Read' && r.pattern === '.*');
    expect(readRule!.action).toBe('deny'); // imported wins
  });

  it('preserves local-only rules', () => {
    const imported: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'rm -rf', action: 'deny' },
      ],
    };
    const merged = mergePolicies(localPolicy, imported);
    expect(merged.rules.some(r => r.pattern === 'local-only')).toBe(true);
  });

  it('locked rules go first and are immutable', () => {
    const imported: Policy = {
      rules: [
        { tool: 'Bash', pattern: 'locked-rule', action: 'deny' },
        { tool: 'Bash', pattern: 'normal-rule', action: 'allow' },
      ],
    };
    const merged = mergePolicies(localPolicy, imported, [0]); // index 0 is locked
    expect(merged.rules[0].pattern).toBe('locked-rule');
  });

  it('merges per_project configs', () => {
    const local: Policy = {
      rules: [],
      per_project: { 'proj-a': { rules: [{ tool: 'Bash', pattern: '.*', action: 'allow' }] } },
    };
    const imported: Policy = {
      rules: [],
      per_project: { 'proj-b': { rules: [{ tool: 'Bash', pattern: '.*', action: 'deny' }] } },
    };
    const merged = mergePolicies(local, imported);
    expect(merged.per_project?.['proj-a']).toBeDefined();
    expect(merged.per_project?.['proj-b']).toBeDefined();
  });

  it('imported per_project overrides local for same project', () => {
    const local: Policy = {
      rules: [],
      per_project: { 'proj-a': { rules: [{ tool: 'Bash', pattern: '.*', action: 'allow' }] } },
    };
    const imported: Policy = {
      rules: [],
      per_project: { 'proj-a': { rules: [{ tool: 'Bash', pattern: '.*', action: 'deny' }] } },
    };
    const merged = mergePolicies(local, imported);
    expect(merged.per_project?.['proj-a']?.rules[0].action).toBe('deny');
  });

  it('imported AI config wins when present', () => {
    const local: Policy = { rules: [], ai: { enabled: false, confidence_threshold: 0.5 } };
    const imported: Policy = { rules: [], ai: { enabled: true, confidence_threshold: 0.8 } };
    const merged = mergePolicies(local, imported);
    expect(merged.ai?.enabled).toBe(true);
    expect(merged.ai?.confidence_threshold).toBe(0.8);
  });
});
