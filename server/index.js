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
    this.p2pClients = new Map(); // P2P mode devices
    this.shortCodes = new Map(); // Short code storage

    // Handle HTTP upgrades manually
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/ws' || url.pathname === '/' || url.pathname === '/signal') {
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
      const url = new URL(request.url, `http://${request.headers.host}`);
      const isP2P = url.pathname === '/signal';

      logger.info('WebSocket connection', { ip: clientIp, path: url.pathname, isP2P });

      if (isP2P) {
        this.handleP2PConnection(ws, request);
      } else {
        this.handleRelayConnection(ws, request);
      }
    });
  }

  handleRelayConnection(ws, request) {
    const clientIp = request.socket.remoteAddress || 'unknown';
    logger.info('Relay connection', { ip: clientIp });

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
      logger.info('Relay client disconnected', { clientId });
      this.clients.delete(clientId);
      this.broadcastClientList();
    });

    ws.on('error', (error) => {
      logger.error('Relay WebSocket error', { clientId, error: error.message });
    });
  }

  handleP2PConnection(ws, request) {
    const clientIp = request.socket.remoteAddress || 'unknown';
    logger.info('P2P connection', { ip: clientIp });

    let deviceId = null;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        deviceId = this.handleP2PMessage(ws, message, deviceId);
      } catch (error) {
        logger.error('Failed to parse P2P message', error.message);
        this.sendP2PError(ws, 'INVALID_FORMAT', 'Failed to parse message');
      }
    });

    ws.on('close', () => {
      logger.info('P2P client disconnected', { deviceId });
      if (deviceId) {
        this.p2pClients.delete(deviceId);
        this.broadcastP2PDeviceList();
      }
    });

    ws.on('error', (error) => {
      logger.error('P2P WebSocket error', { deviceId, error: error.message });
    });
  }

  handleP2PMessage(ws, message, deviceId) {
    switch (message.type) {
      case 'register':
        return this.handleP2PRegister(ws, message.payload);
      case 'discover':
        this.handleP2PDiscover(ws);
        return deviceId;
      case 'generate-short-code':
        this.handleGenerateShortCode(ws, message.payload);
        return deviceId;
      case 'verify-short-code':
        this.handleVerifyShortCode(ws, message.payload);
        return deviceId;
      case 'revoke-short-code':
        this.handleRevokeShortCode(ws, message.payload);
        return deviceId;
      case 'offer':
        this.handleP2POffer(ws, message.payload);
        return deviceId;
      case 'answer':
        this.handleP2PAnswer(ws, message.payload);
        return deviceId;
      case 'ice-candidate':
        this.handleP2PIceCandidate(ws, message.payload);
        return deviceId;
      case 'heartbeat':
        this.sendP2P(ws, { type: 'heartbeat-ack', payload: { timestamp: Date.now() } });
        return deviceId;
      default:
        logger.warn('Unknown P2P message type', { type: message.type });
        return deviceId;
    }
  }

  handleP2PRegister(ws, payload) {
    const deviceId = payload?.deviceId;
    if (!deviceId) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'deviceId required');
      return null;
    }

    const displayName = payload?.displayName || 'Unknown Device';
    this.p2pClients.set(deviceId, {
      ws,
      displayName,
      capabilities: payload?.capabilities || ['file-transfer'],
      status: 'online',
      lastSeenAt: Date.now()
    });

    logger.info('P2P device registered', { deviceId, displayName });
    this.sendP2P(ws, { type: 'register-ack', payload: { deviceId, timestamp: Date.now() } });
    this.broadcastP2PDeviceList();
    return deviceId;
  }

  handleP2PDiscover(ws) {
    const devices = Array.from(this.p2pClients.entries())
      .map(([id, client]) => ({
        deviceId: id,
        displayName: client.displayName,
        status: client.status,
        lastSeenAt: client.lastSeenAt
      }));

    this.sendP2P(ws, { type: 'device-list', payload: { devices } });
  }

  handleGenerateShortCode(ws, payload) {
    const deviceId = payload?.deviceId;
    if (!deviceId) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'deviceId required');
      return;
    }

    const expiresIn = payload?.expiresIn || 600; // 10 minutes default
    const shortCode = this.generateShortCode(deviceId);

    this.sendP2P(ws, {
      type: 'short-code-generated',
      payload: {
        shortCode: shortCode.code,
        expiresAt: shortCode.expiresAt,
        deviceId
      }
    });

    logger.info('Short code generated', { deviceId, shortCode: shortCode.code });
  }

  handleVerifyShortCode(ws, payload) {
    const { shortCode } = payload;
    if (!shortCode) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'shortCode required');
      return;
    }

    const codeEntry = this.shortCodes.get(shortCode);
    if (!codeEntry) {
      this.sendP2PError(ws, 'SHORT_CODE_INVALID', 'Short code not found');
      return;
    }

    if (Date.now() > codeEntry.expiresAt) {
      this.sendP2PError(ws, 'SHORT_CODE_EXPIRED', 'Short code has expired');
      return;
    }

    if (codeEntry.attemptCount >= codeEntry.maxAttempts) {
      this.sendP2PError(ws, 'MAX_ATTEMPTS_REACHED', 'Max verification attempts reached');
      return;
    }

    if (codeEntry.status !== 'active') {
      this.sendP2PError(ws, 'SHORT_CODE_REVOKED', 'Short code is no longer active');
      return;
    }

    // Increment attempt count
    codeEntry.attemptCount++;

    // Get target device info
    const targetDevice = this.p2pClients.get(codeEntry.deviceId);
    const displayName = targetDevice?.displayName || 'Unknown Device';

    this.sendP2P(ws, {
      type: 'short-code-verified',
      payload: {
        shortCode,
        deviceId: codeEntry.deviceId,
        displayName
      }
    });

    logger.info('Short code verified', { shortCode, targetDevice: codeEntry.deviceId });
  }

  handleRevokeShortCode(ws, payload) {
    const { shortCode } = payload;
    if (!shortCode) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'shortCode required');
      return;
    }

    const codeEntry = this.shortCodes.get(shortCode);
    if (codeEntry) {
      codeEntry.status = 'revoked';
      this.sendP2P(ws, { type: 'short-code-revoked', payload: { shortCode } });
      logger.info('Short code revoked', { shortCode });
    } else {
      this.sendP2PError(ws, 'SHORT_CODE_INVALID', 'Short code not found');
    }
  }

  handleP2POffer(ws, payload) {
    const { to, sdp } = payload;
    if (!to || !sdp) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'to and sdp required');
      return;
    }

    const targetDevice = this.p2pClients.get(to);
    if (!targetDevice) {
      this.sendP2PError(ws, 'DEVICE_NOT_FOUND', 'Target device not found');
      return;
    }

    this.sendP2P(targetDevice.ws, {
      type: 'offer',
      payload: {
        from: payload.from,
        to,
        sdp
      }
    });

    this.sendP2P(ws, { type: 'offer-forwarded', payload: { from: payload.from, to } });
    logger.info('P2P offer forwarded', { from: payload.from, to });
  }

  handleP2PAnswer(ws, payload) {
    const { to, sdp } = payload;
    if (!to || !sdp) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'to and sdp required');
      return;
    }

    const targetDevice = this.p2pClients.get(to);
    if (!targetDevice) {
      this.sendP2PError(ws, 'DEVICE_NOT_FOUND', 'Target device not found');
      return;
    }

    this.sendP2P(targetDevice.ws, {
      type: 'answer',
      payload: {
        from: payload.from,
        to,
        sdp
      }
    });

    this.sendP2P(ws, { type: 'answer-forwarded', payload: { from: payload.from, to } });
    logger.info('P2P answer forwarded', { from: payload.from, to });
  }

  handleP2PIceCandidate(ws, payload) {
    const { to, candidate } = payload;
    if (!to || !candidate) {
      this.sendP2PError(ws, 'INVALID_FORMAT', 'to and candidate required');
      return;
    }

    const targetDevice = this.p2pClients.get(to);
    if (!targetDevice) {
      return; // Silently fail for ICE candidates
    }

    this.sendP2P(targetDevice.ws, {
      type: 'ice-candidate',
      payload: {
        from: payload.from,
        to,
        candidate
      }
    });

    this.sendP2P(ws, { type: 'ice-candidate-forwarded', payload: { from: payload.from, to } });
  }

  generateShortCode(deviceId) {
    // Generate 6-character base32 random string
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let data = '';
    for (let i = 0; i < 6; i++) {
      data += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Calculate 2-char checksum using simple algorithm
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data.charCodeAt(i);
    }
    const checksum = chars[sum % 26] + chars[(sum * 3) % 26];

    const code = `${data}-${checksum}`;
    const expiresAt = Date.now() + 600000; // 10 minutes

    this.shortCodes.set(code, {
      code,
      deviceId,
      createdAt: Date.now(),
      expiresAt,
      maxAttempts: 3,
      attemptCount: 0,
      status: 'active'
    });

    return { code, expiresAt };
  }

  broadcastP2PDeviceList() {
    const devices = Array.from(this.p2pClients.entries())
      .map(([id, client]) => ({
        deviceId: id,
        displayName: client.displayName,
        status: client.status,
        lastSeenAt: client.lastSeenAt
      }));

    for (const [deviceId, client] of this.p2pClients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        // Send device list to each device
        this.sendP2P(client.ws, { type: 'device-list', payload: { devices } });
      }
    }
  }

  sendP2P(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendP2PError(ws, code, message) {
    this.sendP2P(ws, { type: 'error', payload: { code, message } });
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
