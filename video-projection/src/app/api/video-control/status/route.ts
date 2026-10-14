import { NextResponse } from 'next/server';

// Import the global state-aware WebSocket functions
const { getCurrentVideoState, getIoTConnectionCount } = require('../../../../../websocket-server.js');

export async function GET() {
  try {
    const currentState = getCurrentVideoState();
    const connectionCount = getIoTConnectionCount();

    return NextResponse.json({
      success: true,
      websocketConnections: connectionCount,
      currentVideoState: currentState,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting WebSocket status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
