import { useState, useCallback, useEffect, useRef } from 'react';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  return { connected, clientId, clientName, clients, error, refreshClients };
}
