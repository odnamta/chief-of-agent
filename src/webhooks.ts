/**
 * Webhook Notifications — Phase 8 (Team Features)
 *
 * Fires HTTP POST to configured webhook URLs on governance events.
 * Supports Slack Block Kit, Discord embeds, and raw JSON formats.
 * Config: ~/.chief-of-agent/webhooks.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type WebhookEventType = 'deny' | 'allow' | 'cost_alert' | 'error' | 'pending';

export interface WebhookConfig {
  url: string;
  name?: string;
  events: WebhookEventType[];
  format?: 'slack' | 'discord' | 'raw';
  secret?: string;
  enabled?: boolean; // default true
}

export interface WebhooksFile {
  webhooks: WebhookConfig[];
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  project: string;
  session_id?: string;
  tool?: string;
  detail?: string;
  decision?: 'allow' | 'deny';
  tier?: 'rule' | 'ai' | 'dashboard';
  rule?: string;
  reason?: string;
  cost_usd?: number;
  machine: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.chief-of-agent');
const WEBHOOKS_PATH = path.join(CONFIG_DIR, 'webhooks.json');

export function loadWebhooks(): WebhooksFile {
  try {
    if (!fs.existsSync(WEBHOOKS_PATH)) return { webhooks: [] };
    const raw = fs.readFileSync(WEBHOOKS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as WebhooksFile;
    if (!Array.isArray(parsed.webhooks)) return { webhooks: [] };
    return parsed;
  } catch {
    return { webhooks: [] };
  }
}

export function saveWebhooks(config: WebhooksFile): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = WEBHOOKS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, WEBHOOKS_PATH);
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatSlackPayload(payload: WebhookPayload): object {
  const color = payload.decision === 'deny' ? '#d32f2f' : payload.decision === 'allow' ? '#388e3c' : '#f9a825';
  const emoji = payload.event === 'deny' ? ':no_entry:' : payload.event === 'allow' ? ':white_check_mark:' : ':warning:';

  const lines = [
    `${emoji} *${payload.event.toUpperCase()}* — ${payload.project}`,
    payload.tool ? `Tool: \`${payload.tool}\`` : '',
    payload.detail ? `Detail: \`${payload.detail.slice(0, 200)}\`` : '',
    payload.tier ? `Tier: ${payload.tier}` : '',
    payload.rule ? `Rule: ${payload.rule}` : '',
    payload.cost_usd != null ? `Cost: $${payload.cost_usd.toFixed(2)}` : '',
    `Machine: ${payload.machine}`,
  ].filter(Boolean);

  return {
    attachments: [{
      color,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: lines.join('\n') },
      }],
    }],
  };
}

export function formatDiscordPayload(payload: WebhookPayload): object {
  const color = payload.decision === 'deny' ? 0xd32f2f : payload.decision === 'allow' ? 0x388e3c : 0xf9a825;

  return {
    embeds: [{
      title: `${payload.event.toUpperCase()} — ${payload.project}`,
      color,
      fields: [
        payload.tool ? { name: 'Tool', value: payload.tool, inline: true } : null,
        payload.tier ? { name: 'Tier', value: payload.tier, inline: true } : null,
        payload.rule ? { name: 'Rule', value: payload.rule, inline: true } : null,
        payload.detail ? { name: 'Detail', value: `\`${payload.detail.slice(0, 200)}\`` } : null,
        payload.cost_usd != null ? { name: 'Cost', value: `$${payload.cost_usd.toFixed(2)}`, inline: true } : null,
      ].filter(Boolean),
      footer: { text: `Chief of Agent • ${payload.machine}` },
      timestamp: payload.timestamp,
    }],
  };
}

export function formatPayload(webhook: WebhookConfig, payload: WebhookPayload): object {
  switch (webhook.format) {
    case 'slack': return formatSlackPayload(payload);
    case 'discord': return formatDiscordPayload(payload);
    default: return payload;
  }
}

// ── Signing ──────────────────────────────────────────────────────────────────

export function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── Firing ───────────────────────────────────────────────────────────────────

export function fireWebhooks(payload: WebhookPayload): void {
  const { webhooks } = loadWebhooks();
  if (webhooks.length === 0) return;

  for (const webhook of webhooks) {
    if (webhook.enabled === false) continue;
    if (!webhook.events.includes(payload.event)) continue;

    const formatted = formatPayload(webhook, payload);
    const body = JSON.stringify(formatted);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhook.secret) {
      headers['X-CoA-Signature'] = `sha256=${signPayload(body, webhook.secret)}`;
    }

    fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      // Fire-and-forget — don't block the decision chain
    });
  }
}

// ── Test helper ──────────────────────────────────────────────────────────────

export async function testWebhook(webhook: WebhookConfig): Promise<{ ok: boolean; status: number; error?: string }> {
  const payload: WebhookPayload = {
    event: 'deny',
    timestamp: new Date().toISOString(),
    project: 'test-project',
    tool: 'Bash',
    detail: 'echo "webhook test"',
    decision: 'deny',
    tier: 'rule',
    rule: 'test-rule',
    machine: os.hostname(),
  };

  const formatted = formatPayload(webhook, payload);
  const body = JSON.stringify(formatted);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (webhook.secret) {
    headers['X-CoA-Signature'] = `sha256=${signPayload(body, webhook.secret)}`;
  }

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}
