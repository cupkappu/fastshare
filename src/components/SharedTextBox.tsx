import { useState, useEffect, useCallback, useRef } from 'react';

interface SharedTextBoxProps {
  isConnected: boolean;
  onTextChange?: (text: string) => void;
}

export function SharedTextBox({ isConnected, onTextChange }: SharedTextBoxProps) {
  const [text, setText] = useState('');
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const isRemoteUpdate = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleTextUpdate = ((event: CustomEvent) => {
      const { content, timestamp } = event.detail;
      isRemoteUpdate.current = true;
      setText(content);
      setLastUpdateTime(timestamp);
      onTextChange?.(content);
    }) as EventListener;

    window.addEventListener('text-update', handleTextUpdate);

    return () => {
      window.removeEventListener('text-update', handleTextUpdate);
    };
  }, [onTextChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    setLastUpdateTime(Date.now());

    // Dispatch event for P2PTextShare to send
    window.dispatchEvent(new CustomEvent('local-text-update', {
      detail: { content: newText }
    }));
  }, []);

  const handleClear = useCallback(() => {
    setText('');
    setLastUpdateTime(Date.now());
    window.dispatchEvent(new CustomEvent('local-text-update', {
      detail: { content: '' }
    }));
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="shared-text-box">
      <div className="text-box-header">
        <h3>共享文本框</h3>
        <div className="text-box-actions">
          {!isConnected && <span className="offline-badge">离线</span>}
          <button
            onClick={handleClear}
            className="clear-btn"
            disabled={!text}
          >
            清空
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        placeholder={isConnected ? '在此输入文字，对方会实时看到...' : '请先连接对端设备...'}
        disabled={!isConnected}
        className="shared-textarea"
        rows={8}
      />
      <div className="text-box-footer">
        <span className="char-count">{text.length} 字符</span>
        {lastUpdateTime && (
          <span className="last-update">
            最后更新: {formatTime(lastUpdateTime)}
          </span>
        )}
      </div>
    </div>
  );
}
