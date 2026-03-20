import { Message } from '../types';

type MessageHandler = (message: Message) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = true;

  constructor() {
    // Dev (Vite 5173): /ws path is proxied to server 8459
    // Prod (server 8459): WS is on root path
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = window.location.port === '5173' ? '/ws' : '';
    this.url = `${protocol}//${window.location.host}${wsPath}`;
  }

  connect(): Promise<string> {
    const self = this;
    return new Promise(function(resolve, reject) {
      self.shouldReconnect = true;
      self.ws = new WebSocket(self.url);

      self.ws.onopen = function() {
        console.log('[WS] Connected');
        self.reconnectAttempts = 0;
        // Dispatch custom event so UI can update
        window.dispatchEvent(new Event('ws-connected'));
      };

      self.ws.onmessage = function(event) {
        try {
          const message: Message = JSON.parse(event.data);
          console.log('[WS] Received:', message.type);

          if (message.type === 'welcome') {
            self.clientId = message.clientId as string;
            resolve(self.clientId);
          }

          self.messageHandlers.forEach(function(handler) { handler(message); });
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      self.ws.onerror = function(error) {
        console.error('[WS] Error:', error);
        reject(error);
      };

      self.ws.onclose = function() {
        console.log('[WS] Disconnected');
        if (self.shouldReconnect && self.reconnectAttempts < self.maxReconnectAttempts) {
          self.reconnectAttempts++;
          console.log('[WS] Reconnecting... (' + self.reconnectAttempts + '/' + self.maxReconnectAttempts + ')');
          setTimeout(function() { self.connect().catch(function() {}); }, self.reconnectDelay * self.reconnectAttempts);
        }
      };
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: Message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send, not connected');
    }
  }

  register(name?: string) {
    const browserInfo = this.getBrowserInfo();
    this.send({
      type: 'register',
      payload: {
        name: name || browserInfo.displayName,
        browser: browserInfo.browser,
        os: browserInfo.os
      }
    });
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

  getClients() {
    this.send({ type: 'clients' });
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getClientId() {
    return this.clientId;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WSClient();
