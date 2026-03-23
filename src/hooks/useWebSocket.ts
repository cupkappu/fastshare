import { useState, useCallback, useEffect, useRef } from 'react';
import { wsClient as importedWsClient } from '../services/wsClient';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remoteClientId, setRemoteClientId] = useState<string | null>(null);
  const wsRef = useRef<any>(null);

  useEffect(() => {
    import('../services/wsClient').then(({ wsClient }) => {
      wsRef.current = wsClient;

      const handleMessage = (message: any) => {
        switch (message.type) {
          case 'welcome':
            setClientId(message.clientId);
            setConnected(true);
            wsClient.register();
            break;
          case 'registered':
            setClientName(message.name);
            wsClient.getClients();
            break;
          case 'client-list':
            setClients(message.clients);
            break;
          case 'text':
            // Forward text message as custom event for SharedTextBox
            window.dispatchEvent(new CustomEvent('text-update', {
              detail: {
                content: message.text,
                timestamp: Date.now(),
                from: message.from,
                fromName: message.fromName
              }
            }));
            break;
          case 'error':
            setError(message.message);
            break;
        }
      };

      wsClient.onMessage(handleMessage);
      wsClient.connect();
    });
  }, []);

  const refreshClients = useCallback(() => {
    wsRef.current?.getClients();
  }, []);

  const selectClient = useCallback((clientId: string) => {
    setRemoteClientId(clientId);
  }, []);

  const sendText = useCallback((text: string) => {
    if (remoteClientId) {
      importedWsClient.sendText(remoteClientId, text);
    }
  }, [remoteClientId]);

  return { connected, clientId, clientName, clients, error, remoteClientId, refreshClients, selectClient, sendText };
}
