import { FileTransfer } from '../types';

interface TransferProgressProps {
  transfers: FileTransfer[];
  onCancel?: (transferId: string) => void;
}

export function TransferProgress({ transfers, onCancel }: TransferProgressProps) {
  if (transfers.length === 0) {
    return null;
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="transfer-progress">
      <h3>Transfers</h3>
      <ul className="transfer-list">
        {transfers.map((transfer) => (
          <li key={transfer.transferId} className="transfer-item">
            <div className="transfer-info">
              <span className="transfer-name">{transfer.fileName}</span>
              <span className="transfer-size">{formatSize(transfer.fileSize)}</span>
            </div>
            <div className="transfer-status">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${transfer.progress * 100}%` }}
                />
              </div>
              <span className="progress-text">
                {transfer.status === 'complete' ? 'Complete' :
                 transfer.status === 'error' ? 'Error' :
                 `${Math.round(transfer.progress * 100)}%`}
              </span>
            </div>
            {onCancel && transfer.status === 'transferring' && (
              <button
                className="cancel-btn"
                onClick={() => onCancel(transfer.transferId)}
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
