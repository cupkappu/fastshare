import { Client } from '../types';

interface DeviceListProps {
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  onRefresh: () => void;
}

export function DeviceList({ clients, selectedClientId, onSelectClient, onRefresh }: DeviceListProps) {
  return (
    <div className="device-list">
      <div className="device-list-header">
        <h3>Connected Devices ({clients.length})</h3>
        <button onClick={onRefresh} className="refresh-btn">Refresh</button>
      </div>
      {clients.length === 0 ? (
        <p className="no-devices">No other devices connected</p>
      ) : (
        <ul className="device-items">
          {clients.map((client) => (
            <li
              key={client.clientId}
              className={`device-item ${selectedClientId === client.clientId ? 'selected' : ''}`}
              onClick={() => onSelectClient(client.clientId)}
            >
              <span className="device-name">{client.name || 'Unknown'}</span>
              <span className="device-id">{client.clientId}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
