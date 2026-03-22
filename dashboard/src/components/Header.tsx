'use client';

interface HeaderProps {
  agentCount: number;
  pendingCount: number;
  totalCost?: number;
}

export default function Header({ agentCount, pendingCount, totalCost }: HeaderProps) {
  return (
    <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight text-zinc-100">
            Chief of Agent
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 uppercase tracking-wider">
            Control Tower
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-yellow-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
              </span>
              {pendingCount} pending
            </span>
          )}
          {totalCost != null && totalCost > 0 && (
            <span className="text-emerald-400 font-mono text-xs font-medium">
              ${totalCost.toFixed(2)}
            </span>
          )}
          <span className="text-zinc-400">
            {agentCount} active {agentCount === 1 ? 'agent' : 'agents'}
          </span>
        </div>
      </div>
    </header>
  );
}
