/**
 * Auto-Decision SSE store.
 *
 * Uses globalThis to survive Next.js HMR reloads.
 * Keeps a circular buffer of recent auto-decisions for the feed.
 */
import type { AutoDecisionPayload } from '@/app/api/auto-decision/route';

type SSEWriter = (event: string, data: string) => void;

declare global {
  // eslint-disable-next-line no-var
  var __autoDecisionClients: Set<SSEWriter> | undefined;
  // eslint-disable-next-line no-var
  var __autoDecisionFeed: AutoDecisionPayload[] | undefined;
}

const FEED_MAX = 50; // Keep last 50 auto-decisions

function getClients(): Set<SSEWriter> {
  if (!globalThis.__autoDecisionClients) {
    globalThis.__autoDecisionClients = new Set();
  }
  return globalThis.__autoDecisionClients;
}

function getFeed(): AutoDecisionPayload[] {
  if (!globalThis.__autoDecisionFeed) {
    globalThis.__autoDecisionFeed = [];
  }
  return globalThis.__autoDecisionFeed;
}

/**
 * Broadcasts a new auto-decision to all connected SSE clients.
 * Also pushes to the in-memory feed buffer.
 */
export function broadcastAutoDecisionSSE(payload: AutoDecisionPayload): void {
  const feed = getFeed();
  feed.push(payload);
  // Trim to max size
  if (feed.length > FEED_MAX) {
    feed.splice(0, feed.length - FEED_MAX);
  }

  const clients = getClients();
  const json = JSON.stringify(payload);
  for (const writer of clients) {
    try {
      writer('auto-decision', json);
    } catch {
      // Client disconnected
    }
  }
}

/**
 * Registers an SSE client for auto-decision events.
 * Returns a cleanup function.
 */
export function addAutoDecisionClient(writer: SSEWriter): () => void {
  const clients = getClients();
  clients.add(writer);
  return () => clients.delete(writer);
}

/**
 * Returns the current auto-decision feed (most recent last).
 */
export function getAutoDecisionFeed(): AutoDecisionPayload[] {
  return [...getFeed()];
}
