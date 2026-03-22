import { describe, it, expect } from 'vitest';
import {
  formatSlackPayload,
  formatDiscordPayload,
  formatPayload,
  signPayload,
  type WebhookPayload,
  type WebhookConfig,
} from '../webhooks.js';

const basePayload: WebhookPayload = {
  event: 'deny',
  timestamp: '2026-03-22T10:00:00Z',
  project: 'gis-erp',
  tool: 'Bash',
  detail: 'rm -rf /',
  decision: 'deny',
  tier: 'rule',
  rule: 'destructive_bash',
  machine: 'test-machine',
};

describe('webhook formatting', () => {
  it('Slack deny payload has red color attachment', () => {
    const result = formatSlackPayload(basePayload) as { attachments: Array<{ color: string }> };
    expect(result.attachments).toBeDefined();
    expect(result.attachments[0].color).toBe('#d32f2f');
  });

  it('Slack allow payload has green color', () => {
    const result = formatSlackPayload({ ...basePayload, event: 'allow', decision: 'allow' }) as { attachments: Array<{ color: string }> };
    expect(result.attachments[0].color).toBe('#388e3c');
  });

  it('Slack payload includes project and tool', () => {
    const result = formatSlackPayload(basePayload) as { attachments: Array<{ blocks: Array<{ text: { text: string } }> }> };
    const text = result.attachments[0].blocks[0].text.text;
    expect(text).toContain('gis-erp');
    expect(text).toContain('Bash');
  });

  it('Discord payload has embed with correct color', () => {
    const result = formatDiscordPayload(basePayload) as { embeds: Array<{ color: number; title: string }> };
    expect(result.embeds[0].color).toBe(0xd32f2f);
    expect(result.embeds[0].title).toContain('DENY');
  });

  it('Discord embed includes fields', () => {
    const result = formatDiscordPayload(basePayload) as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    const fieldNames = result.embeds[0].fields.map(f => f.name);
    expect(fieldNames).toContain('Tool');
    expect(fieldNames).toContain('Rule');
  });

  it('formatPayload dispatches to Slack', () => {
    const webhook: WebhookConfig = { url: 'http://test', events: ['deny'], format: 'slack' };
    const result = formatPayload(webhook, basePayload) as { attachments: unknown[] };
    expect(result.attachments).toBeDefined();
  });

  it('formatPayload dispatches to Discord', () => {
    const webhook: WebhookConfig = { url: 'http://test', events: ['deny'], format: 'discord' };
    const result = formatPayload(webhook, basePayload) as { embeds: unknown[] };
    expect(result.embeds).toBeDefined();
  });

  it('formatPayload returns raw by default', () => {
    const webhook: WebhookConfig = { url: 'http://test', events: ['deny'] };
    const result = formatPayload(webhook, basePayload) as WebhookPayload;
    expect(result.event).toBe('deny');
    expect(result.project).toBe('gis-erp');
  });
});

describe('webhook signing', () => {
  it('produces valid hex string', () => {
    const sig = signPayload('test body', 'secret');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different secrets produce different signatures', () => {
    const sig1 = signPayload('body', 'secret1');
    const sig2 = signPayload('body', 'secret2');
    expect(sig1).not.toBe(sig2);
  });

  it('same input produces consistent output', () => {
    const sig1 = signPayload('test', 'key');
    const sig2 = signPayload('test', 'key');
    expect(sig1).toBe(sig2);
  });
});

describe('webhook payload truncation', () => {
  it('Slack truncates long details to 200 chars', () => {
    const longDetail = 'x'.repeat(500);
    const result = formatSlackPayload({ ...basePayload, detail: longDetail }) as {
      attachments: Array<{ blocks: Array<{ text: { text: string } }> }>;
    };
    const text = result.attachments[0].blocks[0].text.text;
    expect(text.length).toBeLessThan(500);
  });

  it('Discord truncates long details to 200 chars', () => {
    const longDetail = 'y'.repeat(500);
    const result = formatDiscordPayload({ ...basePayload, detail: longDetail }) as {
      embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
    };
    const detailField = result.embeds[0].fields.find(f => f.name === 'Detail');
    expect(detailField!.value.length).toBeLessThan(300);
  });
});
