/**
 * GET /api/events — Server-Sent Events stream.
 * Broadcasts pending:new and pending:resolved events to all connected dashboards.
 */
import { NextResponse } from 'next/server';
import { addSSEClient, getAllPending } from '@/lib/pending-store';

export const runtime = 'nodejs';
// Keep connection open indefinitely
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping + current pending state on connect
      const ping = `event: connected\ndata: ${JSON.stringify({ pending: getAllPending() })}\n\n`;
      controller.enqueue(encoder.encode(ping));

      // Register this client as an SSE subscriber
      const remove = addSSEClient((event: string, data: string) => {
        const message = `event: ${event}\ndata: ${data}\n\n`;
        controller.enqueue(encoder.encode(message));
      });

      // Heartbeat every 25 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          remove();
        }
      }, 25_000);

      // Clean up when client disconnects
      // ReadableStream cancel is called when the consumer closes
      return () => {
        clearInterval(heartbeat);
        remove();
      };
    },
    cancel() {
      // Client disconnected — cleanup handled by the remove() callback above
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
