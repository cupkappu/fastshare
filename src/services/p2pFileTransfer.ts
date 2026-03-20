const CHUNK_SIZE = 16 * 1024; // 16 KiB as per spec

interface ControlMessage {
  type: string;
  version: number;
  payload: Record<string, unknown>;
}

interface FileMeta {
  sessionId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  sha256?: string;
}

interface ActiveTransfer {
  fileMeta: FileMeta;
  chunks: ArrayBuffer[];
  receivedChunks: number;
  isSender: boolean;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

type TransferEventType =
  | 'file-incoming'
  | 'file-progress'
  | 'file-complete'
  | 'file-failed'
  | 'transfer-complete'
  | 'transfer-failed';

interface TransferEvent {
  transferId: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  progress?: number;
  blob?: Blob;
  error?: string;
  sha256Match?: boolean;
}

export class P2PFileTransfer {
  private controlChannel: RTCDataChannel | null = null;
  private fileChannel: RTCDataChannel | null = null;
  private activeTransfers: Map<string, ActiveTransfer> = new Map();
  private pendingChunkData: Map<string, { meta: ControlMessage; data: ArrayBuffer[] }> = new Map();
  private notifiedTransfers: Set<string> = new Set(); // Track files we've already notified about

  setChannels(controlChannel: RTCDataChannel, fileChannel: RTCDataChannel) {
    this.controlChannel = controlChannel;
    this.fileChannel = fileChannel;

    this.controlChannel.onmessage = (event) => this.handleControlMessage(event);
    this.fileChannel.onmessage = (event) => this.handleFileData(event);

    console.log('[P2PFileTransfer] Channels configured');
  }

  async sendFile(file: File, sessionId: string): Promise<void> {
    if (!this.controlChannel || !this.fileChannel) {
      throw new Error('Data channels not ready');
    }

    const fileId = this.generateUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileMeta: FileMeta = {
      sessionId,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize: CHUNK_SIZE
    };

    // Calculate SHA-256 for verification
    const sha256 = await this.calculateSHA256(file);

    // Store transfer info for tracking
    this.activeTransfers.set(fileId, {
      fileMeta: { ...fileMeta, sha256 },
      chunks: [],
      receivedChunks: 0,
      isSender: true,
      resolve: () => {},
      reject: () => {}
    });

    // Send file metadata
    this.sendControlMessage({
      type: 'file-meta',
      version: 1,
      payload: {
        ...fileMeta,
        sha256
      }
    });

    // Read and send chunks
    const buffer = await file.arrayBuffer();
    let offset = 0;
    let seq = 0;

    while (offset < buffer.byteLength) {
      const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
      this.sendChunk(chunk, seq);
      offset += CHUNK_SIZE;
      seq++;

      // Dispatch progress event
      const progress = seq / totalChunks;
      this.dispatchEvent('file-progress', {
        transferId: fileId,
        fileName: file.name,
        progress
      });
    }

    // Send file end
    this.sendControlMessage({
      type: 'file-end',
      version: 1,
      payload: {
        sessionId,
        fileId,
        sha256
      }
    });
  }

  private handleControlMessage(event: MessageEvent) {
    try {
      const message: ControlMessage = JSON.parse(event.data);
      console.log('[P2PFileTransfer] Control message:', message.type);

      switch (message.type) {
        case 'file-meta':
          this.handleFileMeta(message.payload as unknown as FileMeta);
          break;
        case 'file-end':
          this.handleFileEnd(message.payload as { sessionId: string; fileId: string; sha256: string });
          break;
        case 'ack':
          this.handleAck(message.payload as { originalType: string; id: string });
          break;
        case 'chunk-ack':
          // Handle chunk acknowledgment for sender
          break;
        case 'transfer-complete':
          this.handleTransferComplete(message.payload as { sessionId: string; fileId: string; sha256Match: boolean });
          break;
        case 'transfer-failed':
          this.handleTransferFailed(message.payload as { sessionId: string; fileId: string; reason: string });
          break;
        case 'reject':
          this.handleReject(message.payload as { fileId: string; reason: string });
          break;
        case 'cancel':
          this.handleCancel(message.payload as { sessionId: string; reason: string });
          break;
        case 'pause':
          // Handle pause
          break;
        case 'resume':
          // Handle resume
          break;
      }
    } catch (error) {
      console.error('[P2PFileTransfer] Failed to parse control message:', error);
    }
  }

  private handleFileData(event: MessageEvent) {
    if (event.data instanceof ArrayBuffer) {
      const transferId = this.findPendingTransfer();
      if (transferId) {
        const pending = this.pendingChunkData.get(transferId);
        if (pending) {
          pending.data.push(event.data);
        }
      }
    }
  }

  private handleFileMeta(payload: FileMeta) {
    // Skip if we've already notified about this file
    if (this.notifiedTransfers.has(payload.fileId)) {
      console.log('[P2PFileTransfer] Ignoring duplicate file-meta for:', payload.fileId);
      return;
    }
    this.notifiedTransfers.add(payload.fileId);

    const transfer: ActiveTransfer = {
      fileMeta: payload,
      chunks: [],
      receivedChunks: 0,
      isSender: false,
      resolve: () => {},
      reject: () => {}
    };

    this.activeTransfers.set(payload.fileId, transfer);
    this.pendingChunkData.set(payload.fileId, { meta: { type: 'file-meta', version: 1, payload: {} }, data: [] });

    // Dispatch incoming file event
    this.dispatchEvent('file-incoming', {
      transferId: payload.fileId,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      mimeType: payload.mimeType
    });

    // Send ack
    this.sendControlMessage({
      type: 'ack',
      version: 1,
      payload: {
        originalType: 'file-meta',
        id: payload.fileId
      }
    });
  }

  private handleFileEnd(payload: { sessionId: string; fileId: string; sha256: string }) {
    const transfer = this.activeTransfers.get(payload.fileId);
    if (!transfer) return;

    const pending = this.pendingChunkData.get(payload.fileId);
    if (!pending) return;
    void transfer; // Mark as intentionally unused

    // Combine chunks into blob
    const totalSize = pending.data.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of pending.data) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    const blob = new Blob([combined], { type: transfer.fileMeta.mimeType });

    // Clean up
    this.activeTransfers.delete(payload.fileId);
    this.pendingChunkData.delete(payload.fileId);

    // Dispatch complete event
    this.dispatchEvent('file-complete', {
      transferId: payload.fileId,
      blob
    });
  }

  private handleAck(_payload: { originalType: string; id: string }) {
    // Acknowledgment received
  }

  private handleTransferComplete(payload: { sessionId: string; fileId: string; sha256Match: boolean }) {
    this.dispatchEvent('transfer-complete', {
      transferId: payload.fileId,
      sha256Match: payload.sha256Match
    });
  }

  private handleTransferFailed(payload: { sessionId: string; fileId: string; reason: string }) {
    this.dispatchEvent('transfer-failed', {
      transferId: payload.fileId,
      error: payload.reason
    });
  }

  private handleReject(payload: { fileId: string; reason: string }) {
    const transfer = this.activeTransfers.get(payload.fileId);
    if (transfer) {
      transfer.reject(new Error(payload.reason));
      this.activeTransfers.delete(payload.fileId);
    }

    this.dispatchEvent('file-failed', {
      transferId: payload.fileId,
      error: payload.reason
    });
  }

  private handleCancel(payload: { sessionId: string; reason: string }) {
    // Find and cancel transfer by sessionId
    for (const [fileId, transfer] of this.activeTransfers.entries()) {
      if (transfer.fileMeta.sessionId === payload.sessionId) {
        transfer.reject(new Error(payload.reason));
        this.activeTransfers.delete(fileId);
        break;
      }
    }
  }

  private sendControlMessage(message: ControlMessage) {
    if (this.controlChannel && this.controlChannel.readyState === 'open') {
      this.controlChannel.send(JSON.stringify(message));
    }
  }

  private sendChunk(data: ArrayBuffer, _seq: number) {
    if (this.fileChannel && this.fileChannel.readyState === 'open') {
      this.fileChannel.send(data);
    }
  }

  private dispatchEvent(type: TransferEventType, detail: TransferEvent) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private findPendingTransfer(): string | null {
    for (const [fileId] of this.pendingChunkData) {
      return fileId;
    }
    return null;
  }

  private async calculateSHA256(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  close() {
    this.activeTransfers.clear();
    this.pendingChunkData.clear();
    this.controlChannel = null;
    this.fileChannel = null;
  }
}

export const p2pFileTransfer = new P2PFileTransfer();
