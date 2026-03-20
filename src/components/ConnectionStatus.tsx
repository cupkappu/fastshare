interface ConnectionStatusProps {
  connected: boolean;
  clientId: string | null;
  clientName: string | null;
}

export function ConnectionStatus({ connected, clientId, clientName }: ConnectionStatusProps) {
  return (
    <div className="connection-status">
      <div className={`connection-status__indicator ${connected ? 'connection-status__indicator--connected' : 'connection-status__indicator--disconnected'}`}>
        <span className="connection-status__dot" />
        <span className="connection-status__text">
          {connected ? 'Connected' : 'Disconnected'}
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
