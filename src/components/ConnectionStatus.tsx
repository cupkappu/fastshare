interface ConnectionStatusProps {
  connected: boolean;
  connecting?: boolean;
  clientId: string | null;
  clientName: string | null;
}

export function ConnectionStatus({ connected, connecting = false, clientId, clientName }: ConnectionStatusProps) {
  const statusText = connecting ? 'Connecting...' : (connected ? 'Connected' : 'Disconnected');

  return (
    <div className="connection-status">
      <div className={`connection-status__indicator ${connected ? 'connection-status__indicator--connected' : 'connection-status__indicator--disconnected'}`}>
        <span className="connection-status__dot" />
        <span className="connection-status__text">
          {statusText}
        </span>
      </div>
      {connected && clientId && (
        <div className="connection-status__info">
          <span className="connection-status__name">
            {clientName || 'Unknown Device'}
          </span>
          <span className="connection-status__id">
            ID: <code>{clientId}</code>
          </span>
        </div>
      )}
    </div>
  );
}
