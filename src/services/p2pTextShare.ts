export interface TextMessage {
  type: 'text-update';
  content: string;
  timestamp: number;
}

type TextEventType = 'text-update';

interface TextEvent {
  content: string;
  timestamp: number;
}

export class P2PTextShare {
  private textChannel: RTCDataChannel | null = null;
  private lastReceivedContent: string = '';
  private isLocalUpdate: boolean = false;

  setChannel(textChannel: RTCDataChannel) {
    this.textChannel = textChannel;

    this.textChannel.onmessage = (event) => this.handleTextMessage(event);

    console.log('[P2PTextShare] Text channel configured');
  }

  sendText(content: string): void {
    if (!this.textChannel || this.textChannel.readyState !== 'open') {
      console.warn('[P2PTextShare] Text channel not ready');
      return;
    }

    // Prevent echo from remote
    this.isLocalUpdate = true;
    this.lastReceivedContent = content;

    const message: TextMessage = {
      type: 'text-update',
      content,
      timestamp: Date.now()
    };

    this.textChannel.send(JSON.stringify(message));
  }

  private handleTextMessage(event: MessageEvent) {
    try {
      const message: TextMessage = JSON.parse(event.data);

      if (message.type === 'text-update') {
        // Check if this is an echo of our own update
        if (this.isLocalUpdate && message.content === this.lastReceivedContent) {
          this.isLocalUpdate = false;
          return;
        }

        this.lastReceivedContent = message.content;
        this.dispatchEvent('text-update', {
          content: message.content,
          timestamp: message.timestamp
        });
      }
    } catch (error) {
      console.error('[P2PTextShare] Failed to parse text message:', error);
    }
  }

  private dispatchEvent(type: TextEventType, detail: TextEvent) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  close() {
    this.textChannel = null;
    this.lastReceivedContent = '';
    this.isLocalUpdate = false;
  }
}

export const p2pTextShare = new P2PTextShare();
