import { wsClient } from './wsClient';

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

class FileTransferService {
  private activeTransfers: Map<string, {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    receivedChunks: number;
    chunks: ArrayBuffer[];
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor() {
    wsClient.onMessage((msg) => {
      if (msg.type === 'file-meta') {
        this.handleIncomingFileMeta(msg as any);
      } else if (msg.type === 'file-chunk') {
        this.handleIncomingChunk(msg as any);
      } else if (msg.type === 'file-end') {
        this.handleIncomingEnd(msg as any);
      }
    });
  }

  async sendFile(targetClientId: string, file: File): Promise<void> {
    const transferId = `transfer-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Send file metadata first
    wsClient.send({
      type: 'file-meta',
      payload: {
        to: targetClientId,
        transferId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream'
      }
    });

    // Read and send chunks
    const buffer = await file.arrayBuffer();
    let offset = 0;
    let chunkIndex = 0;

    while (offset < buffer.byteLength) {
      const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
      await this.sendChunk(transferId, targetClientId, chunk, chunkIndex, totalChunks);
      offset += CHUNK_SIZE;
      chunkIndex++;
    }

    // Signal end of transfer
    wsClient.send({
      type: 'file-end',
      payload: { transferId }
    });
  }

  private async sendChunk(
    transferId: string,
    _targetClientId: string,
    chunk: ArrayBuffer,
    chunkIndex: number,
    totalChunks: number
  ): Promise<void> {
    return new Promise((resolve) => {
      // Convert ArrayBuffer to base64 for JSON transmission
      const uint8Array = new Uint8Array(chunk);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      wsClient.send({
        type: 'file-chunk',
        payload: {
          transferId,
          chunk: base64,
          chunkIndex,
          totalChunks
        }
      });

      // Small delay to prevent flooding
      setTimeout(resolve, 10);
    });
  }

  private handleIncomingFileMeta(msg: {
    transferId: string;
    from: string;
    fromName: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }) {
    this.activeTransfers.set(msg.transferId, {
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      totalChunks: Math.ceil(msg.fileSize / CHUNK_SIZE),
      receivedChunks: 0,
      chunks: [],
      resolve: () => {},
      reject: () => {}
    });

    // Dispatch event for UI to handle
    window.dispatchEvent(new CustomEvent('file-incoming', {
      detail: {
        transferId: msg.transferId,
        from: msg.from,
        fromName: msg.fromName,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        fileType: msg.fileType
      }
    }));
  }

  private handleIncomingChunk(msg: {
    transferId: string;
    chunk: string;
    chunkIndex: number;
    totalChunks: number;
  }) {
    const transfer = this.activeTransfers.get(msg.transferId);
    if (!transfer) return;

    // Decode base64 to ArrayBuffer
    const binary = atob(msg.chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    transfer.chunks.push(bytes.buffer);
    transfer.receivedChunks++;

    // Dispatch progress event
    window.dispatchEvent(new CustomEvent('file-progress', {
      detail: {
        transferId: msg.transferId,
        progress: transfer.receivedChunks / transfer.totalChunks
      }
    }));
  }

  private handleIncomingEnd(msg: { transferId: string; from: string }) {
    const transfer = this.activeTransfers.get(msg.transferId);
    if (!transfer) return;

    // Combine chunks into blob
    const totalSize = transfer.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of transfer.chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    const blob = new Blob([combined]);
    this.activeTransfers.delete(msg.transferId);

    // Dispatch complete event
    window.dispatchEvent(new CustomEvent('file-complete', {
      detail: {
        transferId: msg.transferId,
        blob,
        fileName: transfer.fileName
      }
    }));
  }
}

export const fileTransferService = new FileTransferService();
