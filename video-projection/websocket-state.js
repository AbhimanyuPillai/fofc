// Global WebSocket state management
// This module maintains state that can be accessed across different Node.js contexts

// Global state object
global.videoProjectionWebSocketState = global.videoProjectionWebSocketState || {
  iotConnections: new Set(),
  currentVideoState: {
    action: 'stop',
    videoUrl: undefined,
    productName: undefined,
    productId: undefined,
    timestamp: Date.now()
  },
  wss: null,
  isInitialized: false
};

// Helper functions to access global state
function getIoTConnections() {
  return global.videoProjectionWebSocketState.iotConnections;
}

function getCurrentVideoState() {
  return { ...global.videoProjectionWebSocketState.currentVideoState };
}

function setCurrentVideoState(state) {
  global.videoProjectionWebSocketState.currentVideoState = {
    ...global.videoProjectionWebSocketState.currentVideoState,
    ...state,
    timestamp: Date.now()
  };
}

function getWebSocketServer() {
  return global.videoProjectionWebSocketState.wss;
}

function setWebSocketServer(wss) {
  global.videoProjectionWebSocketState.wss = wss;
}

function isWebSocketInitialized() {
  return global.videoProjectionWebSocketState.isInitialized;
}

function setWebSocketInitialized(initialized) {
  global.videoProjectionWebSocketState.isInitialized = initialized;
}

function addIoTConnection(ws) {
  global.videoProjectionWebSocketState.iotConnections.add(ws);
}

function removeIoTConnection(ws) {
  global.videoProjectionWebSocketState.iotConnections.delete(ws);
}

function getIoTConnectionCount() {
  // Clean up closed connections before returning count
  const { WebSocket } = require('ws');
  const connections = global.videoProjectionWebSocketState.iotConnections;
  const activeConnections = new Set();
  
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      activeConnections.add(ws);
    }
  });
  
  global.videoProjectionWebSocketState.iotConnections = activeConnections;
  return activeConnections.size;
}

function broadcastToAllIoTControllers(message) {
  const { WebSocket } = require('ws');
  const connections = global.videoProjectionWebSocketState.iotConnections;
  const messageString = JSON.stringify(message);
  let successCount = 0;
  
  console.log(`Broadcasting to ${connections.size} IoT controllers:`, message);
  
  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageString);
        successCount++;
      } catch (error) {
        console.error('Error sending to IoT controller:', error);
        connections.delete(ws);
      }
    } else {
      console.log('Removing closed WebSocket connection');
      connections.delete(ws);
    }
  });
  
  console.log(`Successfully broadcasted to ${successCount}/${connections.size} IoT controllers`);
  return successCount;
}

function clearAllConnections() {
  const connections = global.videoProjectionWebSocketState.iotConnections;
  connections.forEach(ws => {
    try {
      ws.close();
    } catch (error) {
      console.error('Error closing WebSocket:', error);
    }
  });
  connections.clear();
}

module.exports = {
  getIoTConnections,
  getCurrentVideoState,
  setCurrentVideoState,
  getWebSocketServer,
  setWebSocketServer,
  isWebSocketInitialized,
  setWebSocketInitialized,
  addIoTConnection,
  removeIoTConnection,
  getIoTConnectionCount,
  broadcastToAllIoTControllers,
  clearAllConnections
};
