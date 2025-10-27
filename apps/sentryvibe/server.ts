/**
 * Custom Next.js Server with WebSocket Support
 * 
 * This file creates a custom server that:
 * 1. Runs the Next.js app
 * 2. Adds WebSocket server for real-time updates
 * 3. Handles both HTTP and WebSocket on the same port
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { buildWebSocketServer } from '@sentryvibe/agent-core';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // Initialize WebSocket server on the same HTTP server
  buildWebSocketServer.initialize(server, '/ws');

  // Start listening
  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server on ws://${hostname}:${port}/ws`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n> Shutting down gracefully...');
    buildWebSocketServer.shutdown();
    server.close(() => {
      console.log('> Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});

