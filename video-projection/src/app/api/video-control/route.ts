import { NextRequest, NextResponse } from 'next/server';
import { broadcastVideoCommand } from '@/lib/video-broadcast';

// Import the global state-aware WebSocket functions
const { broadcastToIoTControllers } = require('../../../../websocket-server.js');

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
      productId,
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

    console.log(`Video control: ${action}${videoUrl ? ` - ${videoUrl}` : ''}${productName ? ` (${productName})` : ''}${productId ? ` [ID: ${productId}]` : ''}${seekTime !== undefined ? ` (seek: ${seekTime}s)` : ''}`);

    return NextResponse.json({
      success: true,
      message: `Video ${action} command sent successfully`,
      action,
      videoUrl,
      productName,
      productId,
      seekTime
    });

  } catch (error) {
    console.error('Error in video control API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
