/**
 * Centralized File Transfer Server for FastShare
 * Serves static files and handles WebSocket on the same port
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 8459;
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const logger = {
  info: (msg, data) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
};

class FileTransferServer {
  constructor() {
    this.server = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true });
    this.clients = new Map();
    this.pendingFiles = new Map();

    // Handle HTTP upgrades manually
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/ws' || url.pathname === '/') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  }

  generateClientId() {
    return Math.random().toString(36).substring(2, 10);
  }

  generateTransferId() {
    return `transfer-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  async handleHttp(req, res) {
    // Serve static files from dist/
    let url = req.url.split('?')[0];

    // Default to index.html for SPA routing
    if (url === '/' || !extname(url)) {
      url = '/index.html';
    }

    const filePath = join(DIST_DIR, url);

    try {
      const content = await readFile(filePath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Try index.html for SPA routing
        try {
          const content = await readFile(join(DIST_DIR, 'index.html'));
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not Found');
        }
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    }
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, request) => {
      const clientIp = request.socket.remoteAddress || 'unknown';
      logger.info('WebSocket connection', { ip: clientIp });

      const clientId = this.generateClientId();
      this.clients.set(clientId, { ws, name: null, connectedAt: Date.now() });

      this.send(ws, { type: 'welcome', clientId });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          logger.error('Failed to parse message', error.message);
          this.sendError(ws, 'INVALID_FORMAT', 'Failed to parse message');
        }
      });

      ws.on('close', () => {
        logger.info('Client disconnected', { clientId });
        this.clients.delete(clientId);
        this.broadcastClientList();
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
      });
    });
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'register':
        this.handleRegister(clientId, message.payload);
        break;
      case 'clients':
        this.handleGetClients(clientId);
        break;
      case 'file-meta':
        this.handleFileMeta(clientId, message.payload);
        break;
      case 'file-chunk':
        this.handleFileChunk(clientId, message.payload);
        break;
      case 'file-end':
        this.handleFileEnd(clientId, message.payload);
        break;
      case 'text':
        this.handleText(clientId, message.payload);
        break;
      default:
        logger.warn('Unknown message type', { clientId, type: message.type });
    }
  }

  handleRegister(clientId, payload) {
    const name = payload?.name || `${payload?.browser || 'Unknown'} (${payload?.os || 'Unknown'})`;
    const client = this.clients.get(clientId);
    if (client) {
      client.name = name;
      client.browser = payload?.browser;
      client.os = payload?.os;
    }
    logger.info('Client registered', { clientId, name, browser: payload?.browser, os: payload?.os });
    this.send(client.ws, { type: 'registered', clientId, name });
    this.broadcastClientList();
  }

  handleGetClients(clientId) {
    const clientList = Array.from(this.clients.entries())
      .filter(([id]) => id !== clientId)
      .map(([id, c]) => ({
        clientId: id,
        name: c.name || `${c.browser || 'Unknown'} (${c.os || 'Unknown'})`,
        browser: c.browser,
        os: c.os,
        connectedAt: c.connectedAt
      }));

    const client = this.clients.get(clientId);
    if (client) {
      this.send(client.ws, { type: 'client-list', clients: clientList });
    }
  }

  handleFileMeta(clientId, payload) {
    const { to, fileName, fileSize, fileType, transferId } = payload;
    const targetClient = this.clients.get(to);

    if (!targetClient) {
      const client = this.clients.get(clientId);
      if (client) {
        this.send(client.ws, { type: 'error', code: 'CLIENT_NOT_FOUND', message: 'Target client not found' });
      }
      return;
    }

    const tid = transferId || this.generateTransferId();
    this.pendingFiles.set(tid, { from: clientId, to, metadata: { fileName, fileSize, fileType } });

    this.send(targetClient.ws, {
      type: 'file-meta',
      transferId: tid,
      from: clientId,
      fromName: this.clients.get(clientId)?.name,
      fileName,
      fileSize,
      fileType
    });

    const sender = this.clients.get(clientId);
    if (sender) {
      this.send(sender.ws, { type: 'file-meta-sent', transferId: tid, to });
    }

    logger.info('File meta forwarded', { transferId: tid, from: clientId, to, fileName });
  }

  handleFileChunk(clientId, payload) {
    const { transferId, chunk, chunkIndex, totalChunks } = payload;
    const transfer = this.pendingFiles.get(transferId);

    if (!transfer) {
      logger.warn('Chunk for unknown transfer', { transferId, from: clientId });
      return;
    }

    const targetClient = this.clients.get(transfer.to);
    if (targetClient) {
      this.send(targetClient.ws, {
        type: 'file-chunk',
        transferId,
        chunk,
        chunkIndex,
        totalChunks,
        from: clientId
      });
    }
  }

  handleFileEnd(clientId, payload) {
    const { transferId } = payload;
    const transfer = this.pendingFiles.get(transferId);

    if (!transfer) {
      logger.warn('End for unknown transfer', { transferId, from: clientId });
      return;
    }

    const targetClient = this.clients.get(transfer.to);
    if (targetClient) {
      this.send(targetClient.ws, {
        type: 'file-end',
        transferId,
        from: clientId
      });
    }

    this.pendingFiles.delete(transferId);
    logger.info('File transfer complete', { transferId });
  }

  handleText(clientId, payload) {
    const { to, text } = payload;
    const targetClient = this.clients.get(to);

    if (!targetClient) {
      const client = this.clients.get(clientId);
      if (client) {
        this.send(client.ws, { type: 'error', code: 'CLIENT_NOT_FOUND', message: 'Target client not found' });
      }
      return;
    }

    this.send(targetClient.ws, {
      type: 'text',
      from: clientId,
      fromName: this.clients.get(clientId)?.name,
      text
    });
  }

  broadcastClientList() {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        const clientList = Array.from(this.clients.entries())
          .filter(([id]) => id !== clientId)  // Exclude self
          .map(([id, c]) => ({
            clientId: id,
            name: c.name || `${c.browser || 'Unknown'} (${c.os || 'Unknown'})`,
            browser: c.browser,
            os: c.os,
            connectedAt: c.connectedAt
          }));
        this.send(client.ws, { type: 'client-list', clients: clientList });
      }
    }
  }

  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, code, message) {
    this.send(ws, { type: 'error', code, message });
  }

  start(port) {
    const listenPort = port || PORT;
    this.setupWebSocket();
    this.server.listen(listenPort, HOST, () => {
      logger.info(`Server started on http://${HOST}:${listenPort} (serving static files + WebSocket)`);
    });
  }

  stop() {
    this.wss.close();
    this.server.close();
    this.clients.clear();
    this.pendingFiles.clear();
    logger.info('Server stopped');
  }
}

// Start server
const server = new FileTransferServer();
server.start();
