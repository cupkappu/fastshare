import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useP2P } from './hooks/useP2P';
import { DeviceList } from './components/DeviceList';
import { FileSelector } from './components/FileSelector';
import { TransferProgress } from './components/TransferProgress';
import { ConnectionStatus } from './components/ConnectionStatus';
import { fileTransferService } from './services/fileTransfer';
import { FileTransfer, TransferMode } from './types';

export default function App() {
  const { connected, clientId, clientName, clients, error, refreshClients } = useWebSocket();
  const {
    isConnected: p2pConnected,
    isConnecting: p2pConnecting,
    remoteDevice,
    discoveredDevices,
    shortCode,
    shortCodeExpiry,
    error: p2pError,
    connect,
    connectWithCode,
    disconnect: p2pDisconnect,
    sendFile: p2pSendFile,
    generateShortCode,
    revokeShortCode,
    refreshDevices
  } = useP2P();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<TransferMode>('relay');
  const [shortCodeInput, setShortCodeInput] = useState('');
  const [showShortCodeModal, setShowShortCodeModal] = useState(false);

  useEffect(() => {
    const handleFileIncoming = ((event: CustomEvent) => {
      const { transferId, fromName, fileName, fileSize } = event.detail;
      setTransfers((prev) => {
        // Deduplicate - skip if already exists
        if (prev.some(t => t.transferId === transferId)) {
          console.log('[App] Ignoring duplicate file-incoming for:', transferId);
          return prev;
        }
        return [
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
        ];
      });
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
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
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

  const handleRelayFileSelect = useCallback((file: File) => {
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

  const handleP2PFileSelect = useCallback(async (file: File) => {
    const transferId = `transfer-${Date.now()}`;
    try {
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
          to: remoteDevice?.deviceId
        }
      ]);

      await p2pSendFile(file);
      setTransfers((prev) =>
        prev.map((t) =>
          t.transferId === transferId ? { ...t, status: 'complete', progress: 1 } : t
        )
      );
    } catch {
      setTransfers((prev) =>
        prev.map((t) =>
          t.transferId === transferId ? { ...t, status: 'error' } : t
        )
      );
    }
  }, [p2pSendFile, remoteDevice]);

  const handleFileSelect = useCallback((file: File) => {
    if (mode === 'relay') {
      handleRelayFileSelect(file);
    } else {
      handleP2PFileSelect(file);
    }
  }, [mode, handleRelayFileSelect, handleP2PFileSelect]);

  const handleGenerateCode = async () => {
    try {
      await generateShortCode();
    } catch (err) {
      console.error('Failed to generate short code:', err);
    }
  };

  const handleConnectWithCode = async () => {
    if (shortCodeInput.trim()) {
      await connectWithCode(shortCodeInput.trim());
      setShortCodeInput('');
      setShowShortCodeModal(false);
    }
  };

  const handleModeSwitch = (newMode: TransferMode) => {
    if (newMode === 'p2p') {
      refreshDevices();
    } else {
      p2pDisconnect();
    }
    setMode(newMode);
  };

  const currentError = mode === 'relay' ? error : p2pError;
  const currentConnected = mode === 'relay' ? connected : p2pConnected;
  const currentConnecting = mode === 'p2p' ? p2pConnecting : false;

  return (
    <div className="app">
      <header className="app-header">
        <h1>FastShare</h1>
        <div className="mode-switch">
          <button
            className={mode === 'relay' ? 'active' : ''}
            onClick={() => handleModeSwitch('relay')}
          >
            Relay
          </button>
          <button
            className={mode === 'p2p' ? 'active' : ''}
            onClick={() => handleModeSwitch('p2p')}
          >
            P2P
          </button>
        </div>
        <ConnectionStatus
          connected={currentConnected}
          connecting={currentConnecting}
          clientId={mode === 'relay' ? clientId : remoteDevice?.deviceId || null}
          clientName={mode === 'relay' ? clientName : remoteDevice?.displayName || null}
        />
      </header>

      {currentError && <div className="error-message">{currentError}</div>}

      <main className="app-main">
        <section className="device-section">
          {mode === 'relay' ? (
            <DeviceList
              clients={clients}
              selectedClientId={selectedClientId}
              onSelectClient={setSelectedClientId}
              onRefresh={refreshClients}
            />
          ) : (
            <div className="p2p-device-section">
              <div className="p2p-header">
                <h3>Online Devices ({discoveredDevices.length})</h3>
                <button onClick={refreshDevices} className="refresh-btn">Refresh</button>
              </div>

              {p2pConnected ? (
                <div className="connected-device">
                  <p>Connected to: <strong>{remoteDevice?.displayName}</strong></p>
                  <button onClick={p2pDisconnect} className="disconnect-btn">Disconnect</button>
                </div>
              ) : (
                <>
                  <div className="p2p-devices">
                    {discoveredDevices.length === 0 ? (
                      <p className="no-devices">No other devices found</p>
                    ) : (
                      <ul className="device-items">
                        {discoveredDevices.map((device) => (
                          <li
                            key={device.deviceId}
                            className="device-item"
                            onClick={() => connect(device.deviceId)}
                          >
                            <span className="device-name">{device.displayName}</span>
                            <span className="device-status">{device.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="short-code-section">
                    <h4>Connect with Short Code</h4>
                    <div className="short-code-actions">
                      {shortCode ? (
                        <div className="short-code-display">
                          <p>Your code: <strong>{shortCode}</strong></p>
                          {shortCodeExpiry && (
                            <p className="expires">
                              Expires in: {Math.max(0, Math.floor((shortCodeExpiry - Date.now()) / 60000))} min
                            </p>
                          )}
                          <button onClick={revokeShortCode} className="revoke-btn">Revoke</button>
                        </div>
                      ) : (
                        <button onClick={handleGenerateCode} className="generate-btn">
                          Generate Short Code
                        </button>
                      )}
                      <button
                        onClick={() => setShowShortCodeModal(true)}
                        className="enter-code-btn"
                      >
                        Enter Code
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section className="transfer-section">
          <h3>Send File</h3>
          <FileSelector
            onFileSelect={handleFileSelect}
            disabled={(mode === 'relay' && !selectedClientId) || (mode === 'p2p' && !p2pConnected) || !currentConnected}
          />
          {selectedFile && (
            <p className="selected-file">Selected: {selectedFile.name}</p>
          )}
        </section>

        <section className="progress-section">
          <TransferProgress transfers={transfers} />
        </section>
      </main>

      {showShortCodeModal && (
        <div className="modal-overlay" onClick={() => setShowShortCodeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Enter Short Code</h3>
            <input
              type="text"
              value={shortCodeInput}
              onChange={(e) => setShortCodeInput(e.target.value.toUpperCase())}
              placeholder="XXXXXX-YY"
              className="short-code-input"
            />
            <div className="modal-actions">
              <button onClick={handleConnectWithCode} className="connect-btn">Connect</button>
              <button onClick={() => setShowShortCodeModal(false)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
