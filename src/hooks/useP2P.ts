import { useState, useEffect, useCallback, useRef } from 'react';
import { signalClient } from '../services/signalClient';
import { P2PConnection, createP2PConnection } from '../services/p2pConnection';
import { p2pFileTransfer } from '../services/p2pFileTransfer';

export interface P2PDevice {
  deviceId: string;
  displayName: string;
  status: 'online' | 'offline' | 'busy';
  lastSeenAt: number;
}

export interface UseP2PReturn {
  isConnected: boolean;
  remoteDevice: P2PDevice | null;
  discoveredDevices: P2PDevice[];
  shortCode: string | null;
  shortCodeExpiry: number | null;
  error: string | null;
  isConnecting: boolean;
  connect: (deviceId: string) => Promise<void>;
  connectWithCode: (shortCode: string) => Promise<void>;
  disconnect: () => void;
  sendFile: (file: File) => Promise<void>;
  generateShortCode: () => Promise<string>;
  revokeShortCode: () => void;
  refreshDevices: () => void;
}

export function useP2P(): UseP2PReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [remoteDevice, setRemoteDevice] = useState<P2PDevice | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<P2PDevice[]>([]);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [shortCodeExpiry, setShortCodeExpiry] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<P2PConnection | null>(null);
  const deviceIdRef = useRef<string>('');

  useEffect(() => {
    // Generate a unique device ID for this client
    deviceIdRef.current = localStorage.getItem('p2p-device-id') || generateUUID();
    localStorage.setItem('p2p-device-id', deviceIdRef.current);

    // Set up signal client message handlers
    const unsubMessage = signalClient.onMessage((message) => {
      switch (message.type) {
        case 'register-ack':
          signalClient.discover();
          break;
        case 'device-list':
          setDiscoveredDevices((message.payload as { devices: P2PDevice[] }).devices || []);
          break;
        case 'offer':
          handleIncomingOffer(message.payload as { from: string; to: string; sdp: RTCSessionDescriptionInit });
          break;
        case 'answer':
          handleIncomingAnswer(message.payload as { from: string; sdp: RTCSessionDescriptionInit });
          break;
        case 'ice-candidate':
          handleIncomingIceCandidate(message.payload as { from: string; candidate: RTCIceCandidateInit });
          break;
        case 'short-code-generated':
          const scPayload = message.payload as { shortCode: string; expiresAt: number };
          setShortCode(scPayload.shortCode);
          setShortCodeExpiry(scPayload.expiresAt);
          break;
        case 'error':
          setError((message.payload as { message: string }).message);
          break;
      }
    });

    // Note: File transfer events (file-incoming, file-progress, file-complete) are
    // dispatched directly by p2pFileTransfer and handled in App.tsx.
    // We don't re-dispatch them here to avoid duplicates.

    // Connect to signaling server
    signalClient.connect(deviceIdRef.current).catch((err) => {
      setError(err.message);
    });

    return () => {
      unsubMessage();
      disconnect();
    };
  }, []);

  const handleIncomingOffer = async (payload: { from: string; to: string; sdp: RTCSessionDescriptionInit }) => {
    try {
      setIsConnecting(true);
      const device = discoveredDevices.find(d => d.deviceId === payload.from);
      setRemoteDevice(device || null);

      const connection = createP2PConnection(deviceIdRef.current, 'answerer', {
        onStateChange: (state) => {
          if (state === 'connected') {
            setIsConnected(true);
            setIsConnecting(false);
          } else if (state === 'failed' || state === 'closed') {
            setIsConnected(false);
            setIsConnecting(false);
          }
        },
        onDataChannel: (_channel, label) => {
          if (label === 'control' || label === 'file') {
            const controlChannel = connection.getControlChannel();
            const fileChannel = connection.getFileChannel();
            if (controlChannel && fileChannel) {
              p2pFileTransfer.setChannels(controlChannel, fileChannel);
            }
          }
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Unknown error')
      });

      connection.setRemoteDeviceId(payload.from);
      const answer = await connection.handleOffer(payload.sdp);
      connectionRef.current = connection;

      signalClient.sendAnswer(payload.from, answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnecting(false);
    }
  };

  const handleIncomingAnswer = async (payload: { from: string; sdp: RTCSessionDescriptionInit }) => {
    if (connectionRef.current) {
      await connectionRef.current.handleAnswer(payload.sdp);
    }
  };

  const handleIncomingIceCandidate = async (payload: { from: string; candidate: RTCIceCandidateInit }) => {
    if (connectionRef.current) {
      await connectionRef.current.addIceCandidate(payload.candidate);
    }
  };

  const connect = useCallback(async (deviceId: string) => {
    try {
      setIsConnecting(true);
      setError(null);

      const device = discoveredDevices.find(d => d.deviceId === deviceId);
      setRemoteDevice(device || null);

      const connection = createP2PConnection(deviceIdRef.current, 'offerer', {
        onStateChange: (state) => {
          if (state === 'connected') {
            setIsConnected(true);
            setIsConnecting(false);
          } else if (state === 'failed' || state === 'closed') {
            setIsConnected(false);
            setIsConnecting(false);
          }
        },
        onDataChannel: (_channel, label) => {
          if (label === 'control' || label === 'file') {
            const controlChannel = connection.getControlChannel();
            const fileChannel = connection.getFileChannel();
            if (controlChannel && fileChannel) {
              p2pFileTransfer.setChannels(controlChannel, fileChannel);
            }
          }
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Unknown error')
      });

      connection.setRemoteDeviceId(deviceId);
      const offer = await connection.createOffer();
      connectionRef.current = connection;

      signalClient.sendOffer(deviceId, offer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsConnecting(false);
    }
  }, [discoveredDevices]);

  const connectWithCode = useCallback(async (code: string) => {
    try {
      setIsConnecting(true);
      setError(null);

      const result = await signalClient.verifyShortCode(code);
      await connect(result.deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid short code');
      setIsConnecting(false);
    }
  }, [connect]);

  const disconnect = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
    setIsConnected(false);
    setRemoteDevice(null);
    setShortCode(null);
    setShortCodeExpiry(null);
  }, []);

  const sendFile = useCallback(async (file: File) => {
    if (!connectionRef.current || !isConnected) {
      throw new Error('Not connected');
    }

    const sessionId = generateUUID();
    await p2pFileTransfer.sendFile(file, sessionId);
  }, [isConnected]);

  const generateShortCode = useCallback(async () => {
    const result = await signalClient.generateShortCode(deviceIdRef.current);
    return result.shortCode;
  }, []);

  const revokeShortCode = useCallback(() => {
    if (shortCode) {
      signalClient.revokeShortCode(shortCode);
      setShortCode(null);
      setShortCodeExpiry(null);
    }
  }, [shortCode]);

  const refreshDevices = useCallback(() => {
    signalClient.discover();
  }, []);

  return {
    isConnected,
    isConnecting,
    remoteDevice,
    discoveredDevices,
    shortCode,
    shortCodeExpiry,
    error,
    connect,
    connectWithCode,
    disconnect,
    sendFile,
    generateShortCode,
    revokeShortCode,
    refreshDevices
  };
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
