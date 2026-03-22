'use client';

import type { SessionState, SessionCost } from '@/lib/types';

interface AgentGridProps {
  sessions: Record<string, SessionState>;
  costs?: Record<string, SessionCost>;
}

const STATUS_DOT: Record<string, string> = {
  working: 'bg-emerald-500',
  waiting: 'bg-yellow-400',
  error: 'bg-red-500',
  idle: 'bg-zinc-500',
  done: 'bg-zinc-600',
};

const STATUS_LABEL: Record<string, string> = {
  working: 'Working',
  waiting: 'Waiting',
  error: 'Error',
  idle: 'Idle',
  done: 'Done',
};

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function AgentGrid({ sessions, costs }: AgentGridProps) {
  const entries = Object.entries(sessions);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-lg">No active agent sessions</p>
        <p className="text-sm mt-2">Start a Claude Code session to see it here</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {entries.map(([id, session]) => {
        const dotColor = STATUS_DOT[session.status] || 'bg-zinc-500';
        const statusLabel = STATUS_LABEL[session.status] || session.status;
        const shortId = id.slice(0, 8);

        return (
          <div
            key={id}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full flex-shrink-0 mt-0.5 ${dotColor}`} />
                <div>
                  <span className="font-semibold text-zinc-100">{session.project}</span>
                  <div className="text-xs text-zinc-500 mt-0.5 font-mono">{shortId}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {costs?.[id]?.estimatedCostUSD != null && costs[id].estimatedCostUSD! > 0 && (
                  <span className="text-xs font-mono text-emerald-400">
                    ${costs[id].estimatedCostUSD!.toFixed(2)}
                  </span>
                )}
                <span className="text-xs text-zinc-500">{timeSince(session.last_event_at)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-zinc-400">{statusLabel}</span>
              {session.waiting_context && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="text-xs text-zinc-500 truncate max-w-[220px]" title={session.waiting_context}>
                    {session.waiting_context}
                  </span>
                </>
              )}
            </div>

            <div className="mt-2 text-xs text-zinc-600 truncate" title={session.cwd}>
              {session.cwd}
            </div>
          </div>
        );
      })}
    </div>
  );
}
