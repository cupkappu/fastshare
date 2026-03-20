import { Message } from '../types';

type MessageHandler = (message: Message) => void;

class SignalClient {
  private ws: WebSocket | null = null;
  private url: string;
  private deviceId: string | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private heartbeatInterval: number | null = null;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = window.location.port === '5173' ? '/signal' : '/signal';
    this.url = `${protocol}//${window.location.host}${wsPath}`;
  }

  connect(deviceId: string): Promise<string> {
    const self = this;
    return new Promise(function(resolve, reject) {
      self.shouldReconnect = true;
      self.deviceId = deviceId;
      self.ws = new WebSocket(self.url);

      self.ws.onopen = function() {
        console.log('[SignalClient] Connected');
        self.reconnectAttempts = 0;
        self.register(deviceId);
        self.startHeartbeat();
        resolve(deviceId);
      };

      self.ws.onmessage = function(event) {
        try {
          const message: Message = JSON.parse(event.data);
          console.log('[SignalClient] Received:', message.type);

          self.messageHandlers.forEach(function(handler) { handler(message); });
        } catch (error) {
          console.error('[SignalClient] Failed to parse message:', error);
        }
      };

      self.ws.onerror = function(error) {
        console.error('[SignalClient] Error:', error);
        reject(error);
      };

      self.ws.onclose = function() {
        console.log('[SignalClient] Disconnected');
        self.stopHeartbeat();
        if (self.shouldReconnect && self.reconnectAttempts < self.maxReconnectAttempts) {
          self.reconnectAttempts++;
          console.log('[SignalClient] Reconnecting... (' + self.reconnectAttempts + '/' + self.maxReconnectAttempts + ')');
          setTimeout(function() { self.connect(deviceId).catch(function() {}); }, self.reconnectDelay * self.reconnectAttempts);
        }
      };
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: Message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[SignalClient] Cannot send, not connected');
    }
  }

  register(deviceId: string, displayName?: string) {
    const browserInfo = this.getBrowserInfo();
    this.send({
      type: 'register',
      payload: {
        deviceId,
        displayName: displayName || browserInfo.displayName,
        capabilities: ['file-transfer', 'short-code']
      }
    });
  }

  discover() {
    this.send({ type: 'discover', payload: {} });
  }

  generateShortCode(deviceId: string): Promise<{ shortCode: string; expiresAt: number }> {
    return new Promise((resolve, reject) => {
      const handler = (message: Message) => {
        if (message.type === 'short-code-generated') {
          this.messageHandlers.delete(handler);
          resolve(message.payload as { shortCode: string; expiresAt: number });
        } else if (message.type === 'error') {
          this.messageHandlers.delete(handler);
          reject(new Error((message.payload as { message: string }).message));
        }
      };
      this.messageHandlers.add(handler);
      this.send({
        type: 'generate-short-code',
        payload: { deviceId, expiresIn: 600 }
      });
    });
  }

  verifyShortCode(shortCode: string): Promise<{ deviceId: string; displayName: string }> {
    return new Promise((resolve, reject) => {
      const handler = (message: Message) => {
        if (message.type === 'short-code-verified') {
          this.messageHandlers.delete(handler);
          resolve(message.payload as { deviceId: string; displayName: string });
        } else if (message.type === 'error') {
          this.messageHandlers.delete(handler);
          reject(new Error((message.payload as { message: string }).message));
        }
      };
      this.messageHandlers.add(handler);
      this.send({
        type: 'verify-short-code',
        payload: { shortCode }
      });
    });
  }

  revokeShortCode(shortCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (message: Message) => {
        if (message.type === 'short-code-revoked') {
          this.messageHandlers.delete(handler);
          resolve();
        } else if (message.type === 'error') {
          this.messageHandlers.delete(handler);
          reject(new Error((message.payload as { message: string }).message));
        }
      };
      this.messageHandlers.add(handler);
      this.send({
        type: 'revoke-short-code',
        payload: { shortCode }
      });
    });
  }

  sendOffer(to: string, sdp: RTCSessionDescriptionInit) {
    this.send({
      type: 'offer',
      payload: {
        from: this.deviceId,
        to,
        sdp
      }
    });
  }

  sendAnswer(to: string, sdp: RTCSessionDescriptionInit) {
    this.send({
      type: 'answer',
      payload: {
        from: this.deviceId,
        to,
        sdp
      }
    });
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidateInit) {
    this.send({
      type: 'ice-candidate',
      payload: {
        from: this.deviceId,
        to,
        candidate
      }
    });
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getDeviceId() {
    return this.deviceId;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ type: 'heartbeat', payload: {} });
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';

    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    const displayName = `${browser} (${os})`;
    return { displayName, browser, os };
  }
}

export const signalClient = new SignalClient();
