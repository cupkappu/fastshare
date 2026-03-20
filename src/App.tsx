import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { DeviceList } from './components/DeviceList';
import { FileSelector } from './components/FileSelector';
import { TransferProgress } from './components/TransferProgress';
import { ConnectionStatus } from './components/ConnectionStatus';
import { fileTransferService } from './services/fileTransfer';
import { FileTransfer } from './types';

export default function App() {
  const { connected, clientId, clientName, clients, error, refreshClients } = useWebSocket();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const handleFileIncoming = ((event: CustomEvent) => {
      const { transferId, fromName, fileName, fileSize } = event.detail;
      setTransfers((prev) => [
        ...prev,
        {
          transferId,
          fileName,
          fileSize,
          fileType: '',
          progress: 0,
          status: 'transferring',
          direction: 'incoming',
          from: fromName
        }
      ]);
    }) as EventListener;

    const handleFileProgress = ((event: CustomEvent) => {
      const { transferId, progress } = event.detail;
      setTransfers((prev) =>
        prev.map((t) =>
          t.transferId === transferId ? { ...t, progress } : t
        )
      );
    }) as EventListener;

    const handleFileComplete = ((event: CustomEvent) => {
      const { transferId, blob, fileName } = event.detail;
      setTransfers((prev) =>
        prev.map((t) =>
          t.transferId === transferId ? { ...t, status: 'complete', progress: 1 } : t
        )
      );

      // Auto-download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }) as EventListener;

    window.addEventListener('file-incoming', handleFileIncoming);
    window.addEventListener('file-progress', handleFileProgress);
    window.addEventListener('file-complete', handleFileComplete);

    return () => {
      window.removeEventListener('file-incoming', handleFileIncoming);
      window.removeEventListener('file-progress', handleFileProgress);
      window.removeEventListener('file-complete', handleFileComplete);
    };
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!selectedClientId) {
      alert('Please select a device first');
      return;
    }
    setSelectedFile(file);

    const transferId = `transfer-${Date.now()}`;
    setTransfers((prev) => [
      ...prev,
      {
        transferId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        progress: 0,
        status: 'transferring',
        direction: 'outgoing',
        to: selectedClientId
      }
    ]);

    fileTransferService.sendFile(selectedClientId, file)
      .then(() => {
        setTransfers((prev) =>
          prev.map((t) =>
            t.transferId === transferId ? { ...t, status: 'complete', progress: 1 } : t
          )
        );
      })
      .catch(() => {
        setTransfers((prev) =>
          prev.map((t) =>
            t.transferId === transferId ? { ...t, status: 'error' } : t
          )
        );
      });

    setSelectedFile(null);
  }, [selectedClientId]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>FastShare</h1>
        <ConnectionStatus
          connected={connected}
          clientId={clientId}
          clientName={clientName}
        />
      </header>

      {error && <div className="error-message">{error}</div>}

      <main className="app-main">
        <section className="device-section">
          <DeviceList
            clients={clients}
            selectedClientId={selectedClientId}
            onSelectClient={setSelectedClientId}
            onRefresh={refreshClients}
          />
        </section>

        <section className="transfer-section">
          <h3>Send File</h3>
          <FileSelector
            onFileSelect={handleFileSelect}
            disabled={!selectedClientId || !connected}
          />
          {selectedFile && (
            <p className="selected-file">Selected: {selectedFile.name}</p>
          )}
        </section>

        <section className="progress-section">
          <TransferProgress transfers={transfers} />
        </section>
      </main>
    </div>
  );
}
