export interface Client {
  clientId: string;
  name: string;
  browser?: string;
  os?: string;
  connectedAt: number;
}

export interface FileTransfer {
  transferId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  progress: number;
  status: 'pending' | 'transferring' | 'complete' | 'error';
  direction: 'incoming' | 'outgoing';
  from?: string;
  to?: string;
}

export interface Message {
  type: string;
  [key: string]: unknown;
}

export interface IncomingFile {
  transferId: string;
  from: string;
  fromName: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunks: ArrayBuffer[];
  totalChunks?: number;
  receivedChunks: number;
}
