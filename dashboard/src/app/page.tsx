'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import PendingCard from '@/components/PendingCard';
import AgentGrid from '@/components/AgentGrid';
import AutoDecisionFeed from '@/components/AutoDecisionFeed';
import AuditHistory from '@/components/AuditHistory';
import type { Decision, PendingRequest, SessionState, SessionCost, StateFile } from '@/lib/types';
import type { AutoDecisionPayload } from '@/app/api/auto-decision/route';

export default function ControlTower() {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [costs, setCosts] = useState<Record<string, SessionCost>>({});
  const [connected, setConnected] = useState(false);
  const [autoDecisions, setAutoDecisions] = useState<AutoDecisionPayload[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // Fetch sessions on mount and poll every 2 seconds
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json() as StateFile & { costs?: Record<string, SessionCost> };
        setSessions(data.sessions || {});
        setCosts(data.costs || {});
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const poll = setInterval(fetchSessions, 2000);
    return () => clearInterval(poll);
  }, [fetchSessions]);

  // Connect SSE for real-time pending + auto-decision updates
  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/events');
      esRef.current = es;

      es.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data) as {
          pending: PendingRequest[];
          autoDecisions?: AutoDecisionPayload[];
        };
        setPending(data.pending || []);
        setAutoDecisions(data.autoDecisions || []);
        setConnected(true);
      });

      es.addEventListener('pending:new', (e) => {
        const request = JSON.parse(e.data) as PendingRequest;
        setPending((prev) => {
          // Avoid duplicates on reconnect
          if (prev.some((p) => p.requestId === request.requestId)) return prev;
          return [...prev, request];
        });
      });

      es.addEventListener('pending:resolved', (e) => {
        const { requestId } = JSON.parse(e.data) as { requestId: string; decision: Decision };
        setPending((prev) => prev.filter((p) => p.requestId !== requestId));
      });

      es.addEventListener('auto-decision', (e) => {
        const decision = JSON.parse(e.data) as AutoDecisionPayload;
        setAutoDecisions((prev) => {
          const updated = [...prev, decision];
          // Keep last 50
          return updated.slice(-50);
        });
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const handleDecision = useCallback(
    async (requestId: string, decision: 'allow' | 'deny' | 'ask') => {
      try {
        const res = await fetch('/api/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, decision }),
        });

        if (res.ok) {
          // Optimistically remove from list
          setPending((prev) => prev.filter((p) => p.requestId !== requestId));
        } else {
          const err = await res.json();
          console.error('Failed to send decision:', err);
        }
      } catch (e) {
        console.error('Network error sending decision:', e);
      }
    },
    [],
  );

  const activeSessionCount = Object.keys(sessions).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header agentCount={activeSessionCount} pendingCount={pending.length} totalCost={Object.values(costs).reduce((sum, c) => sum + (c.estimatedCostUSD ?? 0), 0)} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* Connection status */}
        {!connected && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-500 animate-pulse" />
            Connecting to event stream...
          </div>
        )}

        {/* Pending Actions section */}
        {pending.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
              Pending Actions
            </h2>
            <div className="space-y-3">
              {pending.map((req) => (
                <PendingCard
                  key={req.requestId}
                  request={req}
                  onDecision={handleDecision}
                />
              ))}
            </div>
          </section>
        )}

        {/* Auto-Decisions feed */}
        <AutoDecisionFeed decisions={autoDecisions} />

        {/* All Agents section */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
            All Agents
          </h2>
          <AgentGrid sessions={sessions} costs={costs} />
        </section>

        {/* Audit History */}
        <AuditHistory />
      </main>
    </div>
  );
}
