'use client';

import { useEffect, useState } from 'react';
import type { PendingRequest } from '@/lib/types';

interface PendingCardProps {
  request: PendingRequest;
  onDecision: (requestId: string, decision: 'allow' | 'deny' | 'ask') => Promise<void>;
}

function useElapsed(timestamp: string): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
      if (seconds < 60) setElapsed(`${seconds}s`);
      else setElapsed(`${Math.floor(seconds / 60)}m ${seconds % 60}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return elapsed;
}

const TOOL_COLORS: Record<string, string> = {
  Bash: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  Edit: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Write: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

export default function PendingCard({ request, onDecision }: PendingCardProps) {
  const elapsed = useElapsed(request.timestamp);
  const [loading, setLoading] = useState<'allow' | 'deny' | 'ask' | null>(null);

  const toolColor = TOOL_COLORS[request.tool] || 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';

  async function handleDecision(decision: 'allow' | 'deny' | 'ask') {
    setLoading(decision);
    try {
      await onDecision(request.requestId, decision);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-zinc-900 p-5 shadow-lg">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
          </span>
          <span className="font-semibold text-zinc-100">{request.project}</span>
          <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded border ${toolColor}`}>
            {request.tool}
          </span>
        </div>
        <span className="text-xs text-zinc-500 tabular-nums font-mono">{elapsed}</span>
      </div>

      {/* Detail box */}
      {request.detail && (
        <div className="mb-4 rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3">
          <pre className="text-sm text-zinc-200 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {request.detail}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleDecision('allow')}
          disabled={loading !== null}
          className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          {loading === 'allow' ? '...' : 'Approve'}
        </button>
        <button
          onClick={() => handleDecision('deny')}
          disabled={loading !== null}
          className="flex-1 py-2 px-4 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 text-sm font-semibold transition-colors"
        >
          {loading === 'deny' ? '...' : 'Deny'}
        </button>
        <button
          onClick={() => handleDecision('ask')}
          disabled={loading !== null}
          className="py-2 px-4 rounded-lg border border-zinc-600 hover:border-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-colors"
        >
          {loading === 'ask' ? '...' : 'Terminal'}
        </button>
      </div>
    </div>
  );
}
