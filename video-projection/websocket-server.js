const {WebSocketServer, WebSocket} = require('ws');
const {parse} = require('url');
const {
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
} = require('./websocket-state');

function initializeWebSocketServer(server) {
    if (isWebSocketInitialized() && getWebSocketServer()) {
        console.log('WebSocket server already initialized');
        return getWebSocketServer();
    }

    console.log('Initializing WebSocket server...');

    // Use noServer mode so we do not intercept other upgrade requests like Next.js HMR (/_next/webpack-hmr)
    const wss = new WebSocketServer({ noServer: true });

    // Attach upgrade handler only for our IoT path, leave others (HMR) to Next.js
    server.on('upgrade', (request, socket, head) => {
        try {
            const { pathname } = parse(request.url || '');
            if (pathname !== '/api/video-control/ws') {
                // Not our path; do nothing so Next.js can handle (e.g., HMR)
                return;
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } catch (err) {
            console.error('Upgrade handling error:', err);
            try { socket.destroy(); } catch {}
        }
    });

    wss.on('connection', (ws, request) => {
        console.log('IoT controller connected via WebSocket');

        // Add to IoT connections using global state
        addIoTConnection(ws);

        // Send welcome message and current state
        const currentState = getCurrentVideoState();
        const welcomeMessage = {
            type: 'connection',
            message: 'Connected to video control WebSocket',
            currentState: currentState,
            timestamp: Date.now()
        };

        try {
            ws.send(JSON.stringify(welcomeMessage));

            // Send current video state if there's an active video
            if (currentState.action === 'play' && currentState.videoUrl) {
                ws.send(JSON.stringify({
                    type: 'video-control',
                    ...currentState
                }));
            }
        } catch (error) {
            console.error('Error sending welcome message:', error);
            removeIoTConnection(ws);
        }

        // Handle messages from IoT controllers
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('Received message from IoT controller:', message);

                // Handle ping/pong for connection health
                if (message.type === 'ping') {
                    ws.send(JSON.stringify({type: 'pong', timestamp: Date.now()}));
                }

                // Handle status requests
                if (message.type === 'status') {
                    ws.send(JSON.stringify({
                        type: 'status-response',
                        currentState: getCurrentVideoState(),
                        timestamp: Date.now()
                    }));
                }
            } catch (error) {
                console.error('Error parsing message from IoT controller:', error);
            }
        });

        // Handle connection close
        ws.on('close', () => {
            removeIoTConnection(ws);
            console.log('IoT controller disconnected. Total connections:', getIoTConnectionCount());
        });

        // Handle connection errors
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            removeIoTConnection(ws);
        });

        console.log('Total IoT controller connections:', getIoTConnectionCount());
    });

    wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
    });

    // Store the WebSocket server in global state
    setWebSocketServer(wss);
    setWebSocketInitialized(true);
    console.log('WebSocket server initialized (noServer mode) and upgrade handler attached for: /api/video-control/ws');
    return wss;
}

// Function to broadcast video commands to all connected IoT controllers
function broadcastToIoTControllers(command) {
    // Keep the selected product and its media metadata through pause/stop events.
    // Commands such as the TV's natural onEnded notification often omit these fields.
    const previousState = getCurrentVideoState();
    setCurrentVideoState({
        action: command.action,
        videoUrl: command.videoUrl ?? previousState.videoUrl,
        productName: command.productName ?? previousState.productName,
        productId: command.productId ?? previousState.productId,
        seekTime: command.seekTime ?? previousState.seekTime
    });

    const message = {
        type: 'video-control',
        ...getCurrentVideoState()
    };

    const successCount = broadcastToAllIoTControllers(message);
    console.log(`Broadcasted ${command.action} command to ${successCount} IoT controllers`);
}

// Cleanup function
function closeWebSocketServer() {
    const wss = getWebSocketServer();
    if (wss) {
        clearAllConnections();
        wss.close();
        setWebSocketServer(null);
        setWebSocketInitialized(false);
        console.log('WebSocket server closed');
    }
}

module.exports = {
    initializeWebSocketServer,
    broadcastToIoTControllers,
    getCurrentVideoState,
    getIoTConnectionCount,
    closeWebSocketServer
};
