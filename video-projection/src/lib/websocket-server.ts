import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';

// Store active IoT controller connections
const iotConnections = new Set<WebSocket>();

// Video state management for IoT controllers
let currentVideoState = {
  action: 'stop' as 'play' | 'pause' | 'stop',
  videoUrl: '' as string | undefined,
  productName: '' as string | undefined,
  productId: '' as string | undefined,
  timestamp: Date.now()
};

// WebSocket server instance
let wss: WebSocketServer | null = null;

export function initializeWebSocketServer(server: any) {
  if (wss) {
    console.log('WebSocket server already initialized');
    return wss;
  }

  wss = new WebSocketServer({
    server,
    path: '/api/video-control/ws',
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      // Parse the URL to check if it's the correct path
      const url = parse(info.req.url || '');
      return url.pathname === '/api/video-control/ws';
    }
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    console.log('IoT controller connected via WebSocket');
    
    // Add to IoT connections
    iotConnections.add(ws);
    
    // Send welcome message and current state
    const welcomeMessage = {
      type: 'connection',
      message: 'Connected to video control WebSocket',
      currentState: currentVideoState,
      timestamp: Date.now()
    };
    
    ws.send(JSON.stringify(welcomeMessage));
    
    // Send current video state if there's an active video
    if (currentVideoState.action === 'play' && currentVideoState.videoUrl) {
      ws.send(JSON.stringify({
        type: 'video-control',
        ...currentVideoState
      }));
    }

    // Handle messages from IoT controllers
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message from IoT controller:', message);
        
        // Handle ping/pong for connection health
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
        
        // Handle status requests
        if (message.type === 'status') {
          ws.send(JSON.stringify({
            type: 'status-response',
            currentState: currentVideoState,
            timestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('Error parsing message from IoT controller:', error);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      iotConnections.delete(ws);
      console.log('IoT controller disconnected. Total connections:', iotConnections.size);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      iotConnections.delete(ws);
    });

    console.log('Total IoT controller connections:', iotConnections.size);
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  console.log('WebSocket server initialized on path: /api/video-control/ws');
  return wss;
}

// Function to broadcast video commands to all connected IoT controllers
export function broadcastToIoTControllers(command: {
  action: 'play' | 'pause' | 'stop';
  videoUrl?: string;
  productName?: string;
  productId?: string;
}) {
  // Update current state
  currentVideoState = {
    action: command.action,
    videoUrl: command.videoUrl ?? undefined,
    productName: command.productName ?? undefined,
    productId: command.productId ?? undefined,
    timestamp: Date.now()
  };
  
  const message = {
    type: 'video-control',
    ...currentVideoState
  };
  
  const messageString = JSON.stringify(message);
  
  // Send to all connected IoT controllers
  iotConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageString);
      } catch (error) {
        console.error('Error sending to IoT controller:', error);
        // Remove broken connections
        iotConnections.delete(ws);
      }
    } else {
      // Remove closed connections
      iotConnections.delete(ws);
    }
  });
  
  console.log(`Broadcasted ${command.action} command to ${iotConnections.size} IoT controllers`);
}

// Function to get current video state
export function getCurrentVideoState() {
  return currentVideoState;
}

// Function to get connection count
export function getIoTConnectionCount() {
  return iotConnections.size;
}

// Cleanup function
export function closeWebSocketServer() {
  if (wss) {
    iotConnections.forEach(ws => ws.close());
    iotConnections.clear();
    wss.close();
    wss = null;
    console.log('WebSocket server closed');
  }
}
