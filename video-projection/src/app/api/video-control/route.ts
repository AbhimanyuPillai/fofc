import { NextRequest, NextResponse } from 'next/server';
import { broadcastVideoCommand } from '@/lib/video-broadcast';
import WebSocket from 'ws';

export const runtime = 'nodejs';

// Import the global state-aware WebSocket functions
const { broadcastToIoTControllers } = require('../../../../websocket-server.js');

async function syncBoardSelectionWithAgent(productId: number): Promise<boolean> {
  const agentUrl = process.env.FOFC_AGENT_WS_URL || 'ws://127.0.0.1:8765';

  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;
    const timeout = setTimeout(() => finish(false), 2000);

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      resolve(success);
    };

    try {
      const agentSocket = new WebSocket(agentUrl);
      socket = agentSocket;
      agentSocket.once('open', () => {
        agentSocket.send(JSON.stringify({ type: 'PROJECTION_BOARD_SELECTED', productId }));
      });
      agentSocket.once('message', (rawMessage) => {
        try {
          const response = JSON.parse(rawMessage.toString());
          if (response.type === 'PROJECTION_BOARD_SELECTED_ACK' &&
            Number(response.productId) === productId) {
            finish(response.success === true);
          }
        } catch {
          // Ignore unrelated or malformed messages until the timeout.
        }
      });
      agentSocket.once('error', () => finish(false));
      agentSocket.once('close', () => finish(false));
    } catch {
      finish(false);
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, videoUrl, productName, productId, seekTime } = body;

    const numericProductId = Number(productId);
    if (action === 'swap' && (productId === undefined || productId === null ||
      !Number.isSafeInteger(numericProductId) || numericProductId < 0)) {
      return NextResponse.json(
        { error: 'A valid productId is required for board selection.' },
        { status: 400 }
      );
    }

      console.log("\n\n seekTime in sendVideoCommand \n\n", seekTime);

    // Validate the request (allow 'swap' for carousel rotation events)
    if (!action || !['play', 'pause', 'stop', 'seek', 'restart', 'swap'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be play, pause, stop, seek, restart, or swap.' },
        { status: 400 }
      );
    }

    if (action === 'play' && !videoUrl) {
      return NextResponse.json(
        { error: 'videoUrl is required for play action.' },
        { status: 400 }
      );
    }

    if (action === 'seek' && seekTime === undefined) {
      return NextResponse.json(
        { error: 'seekTime is required for seek action.' },
        { status: 400 }
      );
    }

    // Broadcast the command to all connected TV displays (SSE)
    broadcastVideoCommand({
      action,
      videoUrl,
      productName,
      seekTime
    });

    // Broadcast the command to all connected IoT controllers (WebSocket)
    broadcastToIoTControllers({
      action,
      videoUrl,
      productName,
      productId,
      seekTime
    });

    // Board changes made in the projection UI must update the agent's context
    // too. Failure to reach the agent should not prevent the display changing.
    const agentSessionSynced = action === 'swap'
      ? await syncBoardSelectionWithAgent(numericProductId)
      : undefined;
    if (action === 'swap' && !agentSessionSynced) {
      console.warn(`Board ${numericProductId} changed on the projection, but the agent session did not acknowledge it.`);
    }

    console.log(`Video control: ${action}${videoUrl ? ` - ${videoUrl}` : ''}${productName ? ` (${productName})` : ''}${productId ? ` [ID: ${productId}]` : ''}${seekTime !== undefined ? ` (seek: ${seekTime}s)` : ''}`);

    return NextResponse.json({
      success: true,
      message: `Video ${action} command sent successfully`,
      action,
      videoUrl,
      productName,
      productId,
      seekTime,
      ...(agentSessionSynced !== undefined ? { agentSessionSynced } : {})
    });

  } catch (error) {
    console.error('Error in video control API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
