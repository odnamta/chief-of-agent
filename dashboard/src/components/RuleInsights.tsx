'use client';

import { useCallback, useEffect, useState } from 'react';

interface Suggestion {
  tool: string;
  detail: string;
  action: 'allow' | 'deny';
  count: number;
  consistent: boolean;
  allowCount: number;
  denyCount: number;
}

interface Metrics {
  totalDecisions: number;
  automatedDecisions: number;
  manualDecisions: number;
  automationRate: number;
  potentialRate: number;
  consistentSuggestions: number;
  conflictSuggestions: number;
}

export default function RuleInsights() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch('/api/suggestions');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setMetrics(data.metrics ?? null);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) return null;
  if (!metrics || metrics.totalDecisions === 0) return null;

  const consistent = suggestions.filter(s => s.consistent);
  const conflicts = suggestions.filter(s => !s.consistent);

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
        Pattern Intelligence
      </h2>

      {/* Metrics bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Decisions" value={metrics.totalDecisions.toString()} />
        <MetricCard
          label="Automation"
          value={`${metrics.automationRate}%`}
          sub={`${metrics.automatedDecisions} auto / ${metrics.manualDecisions} manual`}
          color={metrics.automationRate >= 70 ? 'text-emerald-400' : metrics.automationRate >= 40 ? 'text-yellow-400' : 'text-red-400'}
        />
        {metrics.potentialRate > metrics.automationRate && (
          <MetricCard
            label="Potential"
            value={`${metrics.potentialRate}%`}
            sub={`if ${metrics.consistentSuggestions} suggestions adopted`}
            color="text-blue-400"
          />
        )}
        {metrics.conflictSuggestions > 0 && (
          <MetricCard
            label="Conflicts"
            value={metrics.conflictSuggestions.toString()}
            sub="mixed decisions — review"
            color="text-yellow-400"
          />
        )}
      </div>

      {/* Consistent suggestions */}
      {consistent.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs text-zinc-500 mb-2">
            Recommendations ({consistent.length})
          </h3>
          <div className="space-y-2">
            {consistent.slice(0, 8).map((s, i) => (
              <div key={`${s.tool}-${i}`} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  s.action === 'allow' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                }`}>
                  {s.action}
                </span>
                <span className="text-zinc-400">{s.tool}</span>
                <span className="text-zinc-300 font-mono truncate max-w-[250px]" title={s.detail}>
                  {s.detail}
                </span>
                <span className="ml-auto text-zinc-600">{s.count}x</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">
            Run <code className="text-zinc-500">chief-of-agent suggest --apply</code> to adopt these rules
          </p>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div>
          <h3 className="text-xs text-zinc-500 mb-2">
            Conflicts ({conflicts.length}) — mixed decisions, review manually
          </h3>
          <div className="space-y-1">
            {conflicts.slice(0, 5).map((s, i) => (
              <div key={`conflict-${i}`} className="flex items-center gap-3 rounded-lg border border-yellow-900/30 bg-yellow-950/10 px-3 py-2 text-xs">
                <span className="text-yellow-500 text-[10px] font-bold">MIXED</span>
                <span className="text-zinc-400">{s.tool}</span>
                <span className="text-zinc-500 font-mono truncate max-w-[200px]">{s.detail}</span>
                <span className="ml-auto text-zinc-600">
                  {s.allowCount} allow / {s.denyCount} deny
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value, sub, color = 'text-zinc-200' }: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}
