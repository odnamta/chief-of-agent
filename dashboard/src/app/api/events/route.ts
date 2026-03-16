/**
 * GET /api/events — Server-Sent Events stream.
 * Broadcasts pending:new, pending:resolved, and auto-decision events to all connected dashboards.
 */
import { NextResponse } from 'next/server';
import { addSSEClient, getAllPending } from '@/lib/pending-store';
import { addAutoDecisionClient, getAutoDecisionFeed } from '@/lib/auto-decision-store';

export const runtime = 'nodejs';
// Keep connection open indefinitely
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping + current pending state + recent auto-decisions on connect
      const ping = `event: connected\ndata: ${JSON.stringify({
        pending: getAllPending(),
        autoDecisions: getAutoDecisionFeed().slice(-20), // last 20
      })}\n\n`;
      controller.enqueue(encoder.encode(ping));

      // Register for pending events
      const removePending = addSSEClient((event: string, data: string) => {
        const message = `event: ${event}\ndata: ${data}\n\n`;
        controller.enqueue(encoder.encode(message));
      });

      // Register for auto-decision events
      const removeAutoDecision = addAutoDecisionClient((event: string, data: string) => {
        const message = `event: ${event}\ndata: ${data}\n\n`;
        controller.enqueue(encoder.encode(message));
      });

      // Heartbeat every 25 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          removePending();
          removeAutoDecision();
        }
      }, 25_000);

      // Clean up when client disconnects
      return () => {
        clearInterval(heartbeat);
        removePending();
        removeAutoDecision();
      };
    },
    cancel() {
      // Client disconnected — cleanup handled by the remove() callbacks above
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
