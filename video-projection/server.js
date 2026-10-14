const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const isDevFlag = process.argv.includes('--dev');
const isDevScript = Boolean(process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes('dev'));
const dev = (isDevFlag || isDevScript) ? true : process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// Prepare the Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize WebSocket server after HTTP server is created
  server.on('listening', () => {
    // Import the WebSocket server
    try {
      const { initializeWebSocketServer } = require('./websocket-server.js');
      initializeWebSocketServer(server);
      console.log(`> WebSocket server ready on ws://${hostname}:${port}/api/video-control/ws`);
    } catch (err) {
      console.error('Failed to initialize WebSocket server:', err);
    }
  });

  server.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
