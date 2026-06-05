import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import { handleTerminalConnection, getActivePtys } from './terminal.js';
import { sessionRoutes } from './sessions.js';

const PORT = parseInt(process.env.PORT ?? '8001', 10);

export const app = express();

app.use(express.json());
app.use('/api', sessionRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Production static serving
const publicDir = path.join(import.meta.dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

export const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (url.pathname === '/ws/terminal') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleTerminalConnection(ws, req);
    });
  } else {
    socket.destroy();
  }
});

function shutdown() {
  console.log('Shutting down...');
  for (const p of getActivePtys()) {
    try {
      p.kill();
    } catch {
      // ignore
    }
  }
  getActivePtys().clear();
  wss.close();
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
