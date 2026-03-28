const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // Serve index.html for root and /room/* paths
  if (pathname === '/' || pathname.startsWith('/room/')) {
    pathname = '/index.html';
  }

  // Resolve the file path safely
  let filePath = path.join(PUBLIC_DIR, pathname);
  const resolvedPath = path.resolve(filePath);

  // Security: ensure file is within public directory
  if (!resolvedPath.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    // Determine content type based on file extension
    const ext = path.extname(resolvedPath).toLowerCase();
    let contentType = 'application/octet-stream';

    switch (ext) {
      case '.html':
        contentType = 'text/html';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.js':
        contentType = 'text/javascript';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function getRoomIdFromReq(req) {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return u.searchParams.get('room') || 'default';
  } catch {
    return 'default';
  }
}

function broadcast(roomId, data, except) {
  const set = rooms.get(roomId);
  if (!set) return;
  for (const client of set) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  }
}

wss.on('connection', (ws, req) => {
  const roomId = getRoomIdFromReq(req);
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);

  ws.id = Math.random().toString(36).slice(2, 9);

  broadcast(roomId, JSON.stringify({ type: 'system', event: 'join', id: ws.id }), ws);

  ws.on('message', (msg) => {
    broadcast(roomId, msg, ws);
  });

  ws.on('close', () => {
    const set = rooms.get(roomId);
    if (set) set.delete(ws);
    broadcast(roomId, JSON.stringify({ type: 'system', event: 'leave', id: ws.id }));
    if (set && set.size === 0) rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Join a room via: http://localhost:${PORT}/room/my-match`);
});
