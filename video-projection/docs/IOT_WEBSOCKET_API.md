# IoT Controller WebSocket API Documentation

## Overview

This WebSocket API allows IoT controllers to receive real-time notifications about which product video is going to be played on the video projection system.

## WebSocket Endpoint

**Production Endpoint (Fixed Intranet IP):**
```
ws://192.168.0.100:3000/api/video-control/ws
```

**Development Endpoint (localhost):**
```
ws://localhost:3000/api/video-control/ws
```

> **Note**: The production endpoint uses a fixed intranet IP (192.168.0.100) configured via DHCP reservation to ensure IoT devices can reliably connect without IP changes.

## Connection

IoT controllers can connect to the WebSocket endpoint using any WebSocket client library. Upon connection, you'll receive a welcome message with the current video state.

### Example Connection (Node.js)

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://192.168.0.100:3000/api/video-control/ws');

ws.on('open', function open() {
  console.log('Connected to video control WebSocket');
});

ws.on('message', function message(data) {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
  
  // Handle different message types
  switch(message.type) {
    case 'connection':
      console.log('Connection established:', message.message);
      console.log('Current state:', message.currentState);
      break;
      
    case 'video-control':
      handleVideoControl(message);
      break;
      
    case 'pong':
      console.log('Pong received');
      break;
      
    case 'status-response':
      console.log('Status:', message.currentState);
      break;
  }
});

function handleVideoControl(message) {
  console.log(`Video ${message.action}: ${message.productName || 'Unknown Product'}`);
  console.log(`Video URL: ${message.videoUrl || 'N/A'}`);
  console.log(`Product ID: ${message.productId || 'N/A'}`);
  
  // Your IoT controller logic here
  // For example, trigger physical actions based on the video being played
}

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket connection closed');
});
```

### Example Connection (Python)

```python
import asyncio
import websockets
import json

async def iot_controller():
    uri = "ws://192.168.0.100:3000/api/video-control/ws"
    
    async with websockets.connect(uri) as websocket:
        print("Connected to video control WebSocket")
        
        async for message in websocket:
            data = json.loads(message)
            print(f"Received: {data}")
            
            if data['type'] == 'connection':
                print(f"Connection established: {data['message']}")
                print(f"Current state: {data['currentState']}")
                
            elif data['type'] == 'video-control':
                handle_video_control(data)
                
            elif data['type'] == 'pong':
                print("Pong received")

def handle_video_control(data):
    print(f"Video {data['action']}: {data.get('productName', 'Unknown Product')}")
    print(f"Video URL: {data.get('videoUrl', 'N/A')}")
    print(f"Product ID: {data.get('productId', 'N/A')}")
    
    # Your IoT controller logic here
    # For example, trigger physical actions based on the video being played

# Run the IoT controller
asyncio.run(iot_controller())
```

## Message Types

### 1. Connection Message (Received on connect)

```json
{
  "type": "connection",
  "message": "Connected to video control WebSocket",
  "currentState": {
    "action": "stop",
    "videoUrl": null,
    "productName": null,
    "productId": null,
    "timestamp": 1643723400000
  },
  "timestamp": 1643723400000
}
```

### 2. Video Control Message (Received when video state changes)

```json
{
  "type": "video-control",
  "action": "play",
  "videoUrl": "https://example.com/product-video.mp4",
  "productName": "Smart Watch Pro",
  "productId": "SW001",
  "timestamp": 1643723400000
}
```

**Actions:**
- `play`: Video is starting to play
- `pause`: Video is paused
- `stop`: Video is stopped

### 3. Ping/Pong (For connection health check)

Send a ping to check connection:
```json
{
  "type": "ping"
}
```

Receive pong response:
```json
{
  "type": "pong",
  "timestamp": 1643723400000
}
```

### 4. Status Request/Response

Send status request:
```json
{
  "type": "status"
}
```

Receive status response:
```json
{
  "type": "status-response",
  "currentState": {
    "action": "play",
    "videoUrl": "https://example.com/product-video.mp4",
    "productName": "Smart Watch Pro",
    "productId": "SW001",
    "timestamp": 1643723400000
  },
  "timestamp": 1643723400000
}
```

## REST API Endpoints

### Check WebSocket Status

```
GET /api/video-control/status
```

Response:
```json
{
  "success": true,
  "websocketConnections": 3,
  "currentVideoState": {
    "action": "play",
    "videoUrl": "https://example.com/product-video.mp4",
    "productName": "Smart Watch Pro",
    "productId": "SW001",
    "timestamp": 1643723400000
  },
  "timestamp": 1643723400000
}
```

### Send Video Control Command

```
POST /api/video-control
```

Request body:
```json
{
  "action": "play",
  "videoUrl": "https://example.com/product-video.mp4",
  "productName": "Smart Watch Pro",
  "productId": "SW001"
}
```

Response:
```json
{
  "success": true,
  "message": "Video play command sent successfully",
  "action": "play",
  "videoUrl": "https://example.com/product-video.mp4",
  "productName": "Smart Watch Pro",
  "productId": "SW001"
}
```

## Error Handling

- **Connection Errors**: Handle WebSocket connection failures with retry logic
- **Message Parsing**: Always wrap JSON parsing in try-catch blocks
- **Reconnection**: Implement automatic reconnection with exponential backoff

### Example Reconnection Logic (Node.js)

```javascript
function connectWithRetry() {
  const ws = new WebSocket('ws://192.168.0.100:3000/api/video-control/ws');
  
  ws.on('open', function open() {
    console.log('Connected to video control WebSocket');
    retryCount = 0; // Reset retry count on successful connection
  });
  
  ws.on('close', function close() {
    console.log('WebSocket connection closed. Attempting to reconnect...');
    setTimeout(() => {
      retryCount++;
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
      setTimeout(connectWithRetry, delay);
    }, 1000);
  });
  
  ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
  });
}

let retryCount = 0;
connectWithRetry();
```

## Security Considerations

- Use WSS (WebSocket Secure) in production environments
- Implement authentication if needed for your IoT controllers
- Consider rate limiting for WebSocket connections
- Validate all incoming messages

## Testing

You can test the WebSocket connection using tools like:
- **wscat**: `wscat -c ws://192.168.0.100:3000/api/video-control/ws`
- **Browser DevTools**: Use the WebSocket API in browser console
- **Postman**: Has WebSocket support for testing

## Deployment Notes

1. Make sure to run the application using the custom server:
   ```bash
   npm run dev  # Development
   npm run start  # Production
   ```

2. The WebSocket server runs on the same port as the HTTP server (default: 3000)

3. For production, consider using a reverse proxy (nginx) to handle WebSocket upgrades

## Support

For issues or questions about the IoT WebSocket API, please check the server logs or contact the development team.
