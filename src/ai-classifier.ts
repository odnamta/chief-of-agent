/**
 * AI Classifier — Phase 4
 * Calls Claude Haiku (via Anthropic API) to evaluate tool calls in gray areas.
 * Uses direct fetch — no SDK dependency.
 */

export interface AIClassification {
  decision: 'allow' | 'deny' | 'ask';
  confidence: number;
  reason: string;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

/**
 * Calls Claude Haiku to classify a tool call as allow/deny/ask.
 * Returns null on any error (network, API, parse) — caller falls through to dashboard.
 */
export async function classifyWithAI(
  project: string,
  tool: string,
  detail: string,
): Promise<AIClassification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const userContent = `Project: ${project}
Tool: ${tool}
Detail: ${detail}`;

  const systemPrompt = `You are a security reviewer for CLI tool permissions.
Evaluate whether this tool call should be allowed, denied, or needs human review.

Respond with JSON only (no markdown, no explanation outside JSON):
{ "decision": "allow" | "deny" | "ask", "confidence": 0.0-1.0, "reason": "brief explanation" }

Rules of thumb:
- Read-only operations are generally safe
- File creation in project directories is generally safe
- Destructive operations (delete, overwrite, force push) need human review
- Network operations (curl, wget, ssh to external hosts) need human review
- Operations outside the project directory need human review
- Running project's own build/test commands is generally safe`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find((c) => c.type === 'text');
    if (!textBlock?.text) return null;

    // Strip markdown code fences if present
    const text = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    let parsed: AIClassification;
    try {
      parsed = JSON.parse(text) as AIClassification;
    } catch {
      return null;
    }

    // Validate shape
    if (
      (parsed.decision !== 'allow' && parsed.decision !== 'deny' && parsed.decision !== 'ask') ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.reason !== 'string'
    ) {
      return null;
    }

    // Clamp confidence to [0, 1]
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    return parsed;
  } catch {
    return null;
  }
}
