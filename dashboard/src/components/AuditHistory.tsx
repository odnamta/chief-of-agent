'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry } from '@/app/api/audit/route';

interface AuditHistoryProps {
  refreshKey?: number; // increment to force refresh
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export default function AuditHistory({ refreshKey }: AuditHistoryProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'allow' | 'deny'>('all');

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch('/api/audit?last=100');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit, refreshKey]);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.decision === filter);

  const allowCount = entries.filter(e => e.decision === 'allow').length;
  const denyCount = entries.filter(e => e.decision === 'deny').length;
  const automationRate = entries.length > 0
    ? Math.round(entries.filter(e => e.tier === 'rule' || e.tier === 'ai').length / entries.length * 100)
    : 0;

  if (loading) {
    return (
      <div className="text-center py-8 text-zinc-600 text-sm">Loading audit log...</div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Decision History
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-500">{total} total</span>
          <span className="text-emerald-500">{allowCount} allow</span>
          <span className="text-red-400">{denyCount} deny</span>
          <span className="text-blue-400">{automationRate}% automated</span>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 mb-3">
        {(['all', 'allow', 'deny'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-md border transition-colors ${
              filter === f
                ? 'border-zinc-600 bg-zinc-800 text-zinc-200'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-400'
            }`}
          >
            {f === 'all' ? `All (${entries.length})` : f === 'allow' ? `Allow (${allowCount})` : `Deny (${denyCount})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-600 text-center">
          No audit entries found. Decisions will appear here as agents run.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                <tr className="text-zinc-500">
                  <th className="text-left px-3 py-2 font-medium">Time</th>
                  <th className="text-left px-3 py-2 font-medium">Decision</th>
                  <th className="text-left px-3 py-2 font-medium">Tier</th>
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-left px-3 py-2 font-medium">Tool</th>
                  <th className="text-left px-3 py-2 font-medium">Detail</th>
                  <th className="text-right px-3 py-2 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filtered.map((entry, i) => (
                  <tr
                    key={`${entry.timestamp}-${i}`}
                    className={`hover:bg-zinc-800/30 ${entry.decision === 'deny' ? 'bg-red-950/10' : ''}`}
                  >
                    <td className="px-3 py-2 text-zinc-400 font-mono whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        entry.decision === 'allow'
                          ? 'bg-emerald-900/50 text-emerald-400'
                          : entry.decision === 'deny'
                            ? 'bg-red-900/50 text-red-400'
                            : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {entry.decision}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-medium uppercase ${
                        entry.tier === 'rule' ? 'text-blue-400' : entry.tier === 'ai' ? 'text-purple-400' : 'text-yellow-400'
                      }`}>
                        {entry.tier}
                      </span>
                      {entry.rule && (
                        <span className="text-zinc-600 ml-1" title={entry.rule}>
                          {entry.rule.length > 15 ? entry.rule.slice(0, 15) + '...' : entry.rule}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{entry.project}</td>
                    <td className="px-3 py-2 text-zinc-400">{entry.tool}</td>
                    <td className="px-3 py-2 text-zinc-500 font-mono truncate max-w-[200px]" title={entry.detail}>
                      {entry.detail}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600 font-mono">
                      {entry.latency_ms != null ? `${entry.latency_ms}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
