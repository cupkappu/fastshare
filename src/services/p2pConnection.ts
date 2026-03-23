import { signalClient } from './signalClient';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

type ConnectionState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed';

export interface P2PConnectionEvents {
  onStateChange: (state: ConnectionState) => void;
  onDataChannel: (channel: RTCDataChannel, label: string) => void;
  onError: (error: Error) => void;
}

export class P2PConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private remoteDeviceId: string | null = null;
  private role: 'offerer' | 'answerer';
  private state: ConnectionState = 'new';
  private events: P2PConnectionEvents;
  private controlChannel: RTCDataChannel | null = null;
  private fileChannel: RTCDataChannel | null = null;
  private textChannel: RTCDataChannel | null = null;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  constructor(_localDeviceId: string, role: 'offerer' | 'answerer', events: P2PConnectionEvents) {
    this.role = role;
    this.events = events;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    await this.peerConnection!.setRemoteDescription(sdp);

    // Process any queued ICE candidates
    for (const candidate of this.iceCandidatesQueue) {
      await this.peerConnection!.addIceCandidate(candidate);
    }
    this.iceCandidatesQueue = [];

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      console.warn('[P2PConnection] No peer connection to handle answer');
      return;
    }

    // Check if connection is in a valid state to receive answer
    const state = this.peerConnection.signalingState;
    console.log('[P2PConnection] handleAnswer, signaling state:', state);

    // If already stable, ignore (answer already processed)
    if (state === 'stable') {
      console.log('[P2PConnection] Connection already stable, ignoring answer');
      return;
    }

    // If closed, cannot process answer
    if (state === 'closed') {
      console.warn('[P2PConnection] Connection closed, cannot process answer');
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(sdp);

      // Process any queued ICE candidates
      for (const candidate of this.iceCandidatesQueue) {
        try {
          await this.peerConnection.addIceCandidate(candidate);
        } catch (e) {
          console.warn('[P2PConnection] Failed to add queued ICE candidate:', e);
        }
      }
      this.iceCandidatesQueue = [];
    } catch (error) {
      console.error('[P2PConnection] Failed to set remote description:', error);
      throw error;
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      this.iceCandidatesQueue.push(candidate);
      return;
    }

    if (this.peerConnection.remoteDescription) {
      await this.peerConnection.addIceCandidate(candidate);
    } else {
      this.iceCandidatesQueue.push(candidate);
    }
  }

  setRemoteDeviceId(deviceId: string) {
    this.remoteDeviceId = deviceId;
  }

  getRemoteDeviceId(): string | null {
    return this.remoteDeviceId;
  }

  getState(): ConnectionState {
    return this.state;
  }

  close() {
    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = null;
    }
    if (this.fileChannel) {
      this.fileChannel.close();
      this.fileChannel = null;
    }
    if (this.textChannel) {
      this.textChannel.close();
      this.textChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.state = 'closed';
    this.events.onStateChange('closed');
  }

  private createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.remoteDeviceId) {
        signalClient.sendIceCandidate(this.remoteDeviceId, event.candidate.toJSON());
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'new';
      console.log('[P2PConnection] Connection state:', state);

      switch (state) {
        case 'connecting':
          this.state = 'connecting';
          this.events.onStateChange('connecting');
          break;
        case 'connected':
          this.state = 'connected';
          this.events.onStateChange('connected');
          break;
        case 'failed':
          this.state = 'failed';
          this.events.onStateChange('failed');
          this.events.onError(new Error('WebRTC connection failed'));
          break;
        case 'closed':
          this.state = 'closed';
          this.events.onStateChange('closed');
          break;
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[P2PConnection] ICE connection state:', this.peerConnection?.iceConnectionState);
    };

    // Handle incoming data channels (for answerer)
    this.peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      const label = channel.label;

      console.log('[P2PConnection] Incoming data channel:', label);

      if (label === 'control') {
        this.controlChannel = channel;
        this.setupDataChannel(channel, 'control');
      } else if (label === 'file') {
        this.fileChannel = channel;
        this.setupDataChannel(channel, 'file');
      } else if (label === 'text') {
        this.textChannel = channel;
        this.setupDataChannel(channel, 'text');
      }

      this.events.onDataChannel(channel, label);
    };

    // Create data channels (for offerer)
    if (this.role === 'offerer') {
      this.createDataChannels();
    }
  }

  private createDataChannels() {
    // Create control channel
    this.controlChannel = this.peerConnection!.createDataChannel('control', {
      ordered: true
    });
    this.setupDataChannel(this.controlChannel, 'control');

    // Create file channel
    this.fileChannel = this.peerConnection!.createDataChannel('file', {
      ordered: true
    });
    this.setupDataChannel(this.fileChannel, 'file');

    // Create text channel
    this.textChannel = this.peerConnection!.createDataChannel('text', {
      ordered: true
    });
    this.setupDataChannel(this.textChannel, 'text');

    console.log('[P2PConnection] Data channels created');
  }

  private setupDataChannel(channel: RTCDataChannel, label: string) {
    channel.onopen = () => {
      console.log(`[P2PConnection] Data channel '${label}' opened`);
    };

    channel.onclose = () => {
      console.log(`[P2PConnection] Data channel '${label}' closed`);
    };

    channel.onerror = (error) => {
      console.error(`[P2PConnection] Data channel '${label}' error:`, error);
      this.events.onError(new Error(`Data channel error: ${label}`));
    };

    channel.onmessage = (_event) => {
      // Messages are handled by P2PFileTransfer
      console.log(`[P2PConnection] Data channel '${label}' message received`);
    };
  }

  getControlChannel(): RTCDataChannel | null {
    return this.controlChannel;
  }

  getFileChannel(): RTCDataChannel | null {
    return this.fileChannel;
  }

  getTextChannel(): RTCDataChannel | null {
    return this.textChannel;
  }
}

export function createP2PConnection(
  _localDeviceId: string,
  role: 'offerer' | 'answerer',
  events: P2PConnectionEvents
): P2PConnection {
  return new P2PConnection(_localDeviceId, role, events);
}
