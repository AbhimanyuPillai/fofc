const WebSocket = require('ws');

// Test IoT controller client
class IoTTestClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  connect() {
    console.log(`🔌 Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('✅ Connected to video control WebSocket');
      this.retryCount = 0;
      
      // Send a ping to test bidirectional communication
      setTimeout(() => {
        this.sendPing();
      }, 2000);
      
      // Request current status
      setTimeout(() => {
        this.requestStatus();
      }, 3000);
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
      if (this.retryCount < this.maxRetries) {
        this.reconnect();
      } else {
        console.log('❌ Max retries reached. Stopping reconnection attempts.');
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
  }

  handleMessage(message) {
    console.log(`📨 Received message:`, message);
    
    switch(message.type) {
      case 'connection':
        console.log(`🎉 ${message.message}`);
        console.log(`📊 Current state:`, message.currentState);
        break;
        
      case 'video-control':
        this.handleVideoControl(message);
        break;
        
      case 'pong':
        console.log('🏓 Pong received - connection is healthy');
        break;
        
      case 'status-response':
        console.log('📊 Status response:', message.currentState);
        break;
        
      default:
        console.log('❓ Unknown message type:', message.type);
    }
  }

  handleVideoControl(message) {
    console.log('\n🎬 VIDEO CONTROL EVENT:');
    console.log(`   Action: ${message.action.toUpperCase()}`);
    console.log(`   Product: ${message.productName || 'Unknown Product'}`);
    console.log(`   Product ID: ${message.productId || 'N/A'}`);
    console.log(`   Video URL: ${message.videoUrl || 'N/A'}`);
    console.log(`   Timestamp: ${new Date(message.timestamp).toISOString()}`);
    
    // Simulate IoT controller actions
    switch(message.action) {
      case 'play':
        console.log('🤖 IoT Action: Activating product lighting and sensors');
        break;
      case 'pause':
        console.log('🤖 IoT Action: Dimming product lighting');
        break;
      case 'stop':
        console.log('🤖 IoT Action: Turning off product lighting and sensors');
        break;
    }
    console.log('');
  }

  sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🏓 Sending ping...');
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  requestStatus() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('📊 Requesting current status...');
      this.ws.send(JSON.stringify({ type: 'status' }));
    }
  }

  reconnect() {
    this.retryCount++;
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000);
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Create and start the test client
const client = new IoTTestClient('ws://localhost:3000/api/video-control/ws');

console.log('🚀 Starting IoT Test Client...');
console.log('📝 This client simulates an IoT controller connecting to the WebSocket API');
console.log('');

client.connect();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down IoT test client...');
  client.disconnect();
  process.exit(0);
});

// Keep the process running
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
});
