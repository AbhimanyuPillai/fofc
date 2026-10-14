import { NextRequest } from 'next/server';
import { addConnection, removeConnection, getCurrentVideoState } from '@/lib/video-broadcast';

// Force dynamic rendering for this API route (required for SSE)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller: ReadableStreamDefaultController) {
      // Add this connection to our set
      addConnection(controller);
      
      // Heartbeat interval to keep the connection alive and let clients detect liveness
      let pingInterval: ReturnType<typeof setInterval> | null = null;
      pingInterval = setInterval(() => {
        try {
          const ping = `data: ${JSON.stringify({ action: 'ping', t: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(ping));
        } catch (err) {
          // If enqueue fails, the stream is likely closed; best-effort cleanup happens in cancel
        }
      }, 100000); // every 10 min
      
      // Send initial connection message
      const currentState = getCurrentVideoState();
      const data = `data: ${JSON.stringify({ 
        action: 'connected', 
        message: 'Repos OS',
        currentState: currentState
      })}\n\n`;
      
      controller.enqueue(new TextEncoder().encode(data));
      
      // Send current video state if there's an active video
      if (currentState.action === 'play' && currentState.videoUrl) {
        const videoData = `data: ${JSON.stringify(currentState)}\n\n`;
        controller.enqueue(new TextEncoder().encode(videoData));
      }
      
      // Attach interval reference to controller via symbol for cleanup in cancel
      // @ts-expect-error - augmenting controller for local cleanup only
      controller.__pingInterval = pingInterval;
    },
    
    cancel(controller: ReadableStreamDefaultController) {
      // Remove this connection when it's closed
      try {
        removeConnection(controller);
      } finally {
        // Ensure heartbeat is cleared
        // @ts-expect-error - property set in start
        const intervalRef: ReturnType<typeof setInterval> | null = controller.__pingInterval ?? null;
        if (intervalRef) clearInterval(intervalRef);
      }
    }
  });

  // Return the stream with appropriate headers for Server-Sent Events
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}
