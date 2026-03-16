'use client';

import type { AutoDecisionPayload } from '@/app/api/auto-decision/route';

interface AutoDecisionFeedProps {
  decisions: AutoDecisionPayload[];
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function DecisionRow({ entry }: { entry: AutoDecisionPayload }) {
  const isAllow = entry.decision === 'allow';
  const isDeny = entry.decision === 'deny';

  const rowBg = isDeny
    ? 'bg-red-950/30 border-red-900/40'
    : 'bg-zinc-900 border-zinc-800';

  const decisionBadge = isAllow
    ? 'text-emerald-400'
    : 'text-red-400';

  const tierLabel = entry.tier === 'rule' ? 'Rule' : 'AI';
  const tierColor = entry.tier === 'rule' ? 'text-zinc-400' : 'text-violet-400';

  let detail = entry.detail;
  if (detail.length > 60) detail = detail.slice(0, 60) + '…';

  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 border rounded-lg text-sm ${rowBg}`}>
      {/* Decision indicator */}
      <span className={`shrink-0 font-mono font-bold text-xs mt-0.5 ${decisionBadge}`}>
        {isAllow ? 'ALLOW' : 'DENY'}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold uppercase tracking-wide ${tierColor}`}>
            {tierLabel}
          </span>
          <span className="text-zinc-300 font-medium">{entry.project}</span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-400 font-mono text-xs">{entry.tool}</span>
        </div>
        <div className="text-zinc-500 font-mono text-xs truncate mt-0.5">
          {detail}
        </div>
        {entry.rule && (
          <div className="text-zinc-600 text-xs mt-0.5">
            pattern: <span className="font-mono text-zinc-500">{entry.rule}</span>
          </div>
        )}
        {entry.reason && (
          <div className="text-zinc-600 text-xs mt-0.5">
            {entry.reason}
            {entry.confidence !== undefined && (
              <span className="text-zinc-500"> ({(entry.confidence * 100).toFixed(0)}%)</span>
            )}
          </div>
        )}
      </div>

      {/* Right side: latency + time */}
      <div className="shrink-0 text-right">
        <div className="text-zinc-500 text-xs font-mono">{formatLatency(entry.latency_ms)}</div>
        <div className="text-zinc-700 text-xs">{formatTime(entry.timestamp)}</div>
      </div>
    </div>
  );
}

export default function AutoDecisionFeed({ decisions }: AutoDecisionFeedProps) {
  // Show most recent first
  const reversed = [...decisions].reverse();

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
        Auto-Decisions (live feed)
      </h2>

      {reversed.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-600 text-center">
          No auto-decisions yet. Rules or AI will populate this feed when PreToolUse hooks fire.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {reversed.map((entry, i) => (
            <DecisionRow key={`${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
