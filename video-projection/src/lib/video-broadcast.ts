// Store active connections
const connections = new Set<ReadableStreamDefaultController>();

// Video state management
let currentVideoState = {
  action: 'stop' as 'play' | 'pause' | 'stop' | 'seek' | 'restart' | 'swap',
  videoUrl: '' as string | undefined,
  productName: '' as string | undefined,
  productId: undefined as number | string | undefined,
  seekTime: undefined as number | undefined,
  timestamp: Date.now()
};

// Function to add a connection
export function addConnection(controller: ReadableStreamDefaultController) {
  connections.add(controller);
  console.log('TV display connected. Total connections:', connections.size);
}

// Function to remove a connection
export function removeConnection(controller: ReadableStreamDefaultController) {
  connections.delete(controller);
  console.log('TV display disconnected. Total connections:', connections.size);
}

// Function to get current video state
export function getCurrentVideoState() {
  return currentVideoState;
}

// Function to broadcast video commands to all connected TV displays
export function broadcastVideoCommand(command: {
  action: 'play' | 'pause' | 'stop' | 'seek' | 'restart' | 'swap';
  videoUrl?: string;
  productName?: string;
  productId?: number | string;
  seekTime?: number;
}) {
  // Update current state
  currentVideoState = {
    action: command.action,
    videoUrl: command.videoUrl ?? currentVideoState.videoUrl,
    productName: command.productName ?? currentVideoState.productName,
    productId: command.productId ?? currentVideoState.productId,
    seekTime: command.seekTime,
    timestamp: Date.now()
  };
  
  const data = `data: ${JSON.stringify(currentVideoState)}\n\n`;
  const encodedData = new TextEncoder().encode(data);
  
  // Send to all connected TV displays
  connections.forEach((controller) => {
    try {
      controller.enqueue(encodedData);
    } catch (error) {
      console.error('Error sending to TV display:', error);
      // Remove broken connections
      connections.delete(controller);
    }
  });
  
  console.log(`Broadcasted ${command.action} command to ${connections.size} TV displays${command.seekTime !== undefined ? ` (seek: ${command.seekTime}s)` : ''}`);
}
