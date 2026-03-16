/**
 * In-memory pending request store.
 *
 * Uses globalThis to survive Next.js HMR reloads in development.
 * A pending request is a Promise that resolves when the user clicks
 * Approve/Deny/Terminal on the dashboard, or when a 120s timeout fires.
 */
import type { Decision, PendingRequest } from './types';

interface PendingEntry {
  request: PendingRequest;
  resolve: (decision: Decision) => void;
}

// SSE clients — array of response writers
type SSEWriter = (event: string, data: string) => void;

declare global {
  // eslint-disable-next-line no-var
  var __pendingStore: Map<string, PendingEntry> | undefined;
  // eslint-disable-next-line no-var
  var __sseClients: Set<SSEWriter> | undefined;
}

function getPendingStore(): Map<string, PendingEntry> {
  if (!globalThis.__pendingStore) {
    globalThis.__pendingStore = new Map();
  }
  return globalThis.__pendingStore;
}

function getSSEClients(): Set<SSEWriter> {
  if (!globalThis.__sseClients) {
    globalThis.__sseClients = new Set();
  }
  return globalThis.__sseClients;
}

export function broadcastSSE(event: string, data: unknown): void {
  const clients = getSSEClients();
  const payload = JSON.stringify(data);
  for (const writer of clients) {
    try {
      writer(event, payload);
    } catch {
      // Client disconnected — will be cleaned up on next write
    }
  }
}

export function addSSEClient(writer: SSEWriter): () => void {
  const clients = getSSEClients();
  clients.add(writer);
  return () => clients.delete(writer);
}

/**
 * Add a new pending request and return a Promise that resolves with the
 * user's decision (or "ask" on timeout).
 */
export function addPending(request: PendingRequest, timeoutMs = 120_000): Promise<Decision> {
  const store = getPendingStore();

  const promise = new Promise<Decision>((resolve) => {
    const timer = setTimeout(() => {
      store.delete(request.requestId);
      resolve('ask');
    }, timeoutMs);

    store.set(request.requestId, {
      request,
      resolve: (decision: Decision) => {
        clearTimeout(timer);
        store.delete(request.requestId);
        resolve(decision);
      },
    });
  });

  // Broadcast to SSE clients
  broadcastSSE('pending:new', request);

  return promise;
}

/**
 * Resolve a pending request with the user's decision.
 * Returns true if the request was found and resolved, false otherwise.
 */
export function resolvePending(requestId: string, decision: Decision): boolean {
  const store = getPendingStore();
  const entry = store.get(requestId);
  if (!entry) return false;
  entry.resolve(decision);
  broadcastSSE('pending:resolved', { requestId, decision });
  return true;
}

/**
 * Get all currently pending requests (snapshot).
 */
export function getAllPending(): PendingRequest[] {
  const store = getPendingStore();
  return Array.from(store.values()).map((e) => e.request);
}
