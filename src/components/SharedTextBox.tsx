import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fileToInlineImageDataUrl,
  getRichTextStats,
  normalizeRichTextHtml,
  plainTextToHtml,
  sanitizeRichText
} from '../utils/richText';

interface SharedTextBoxProps {
  isConnected: boolean;
  onTextChange?: (text: string) => void;
}

export function SharedTextBox({ isConnected, onTextChange }: SharedTextBoxProps) {
  const [contentHtml, setContentHtml] = useState('');
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleTextUpdate = ((event: CustomEvent) => {
      const nextContent = sanitizeRichText(event.detail.content || '');
      setContentHtml(nextContent);
      setLastUpdateTime(event.detail.timestamp);
      setPasteError(null);
      onTextChange?.(nextContent);
    }) as EventListener;

    window.addEventListener('text-update', handleTextUpdate);

    return () => {
      window.removeEventListener('text-update', handleTextUpdate);
    };
  }, [onTextChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (editor.innerHTML !== contentHtml) {
      editor.innerHTML = contentHtml;
    }
  }, [contentHtml]);

  const syncEditorState = useCallback((nextHtml: string) => {
    const normalizedHtml = normalizeRichTextHtml(sanitizeRichText(nextHtml));
    setContentHtml(normalizedHtml);
    setLastUpdateTime(Date.now());
    setPasteError(null);
    onTextChange?.(normalizedHtml);

    window.dispatchEvent(new CustomEvent('local-text-update', {
      detail: { content: normalizedHtml }
    }));
  }, [onTextChange]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    syncEditorState(editor.innerHTML);
  }, [syncEditorState]);

  const handleClear = useCallback(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.innerHTML = '';
    }

    setContentHtml('');
    setLastUpdateTime(Date.now());
    setPasteError(null);
    onTextChange?.('');

    window.dispatchEvent(new CustomEvent('local-text-update', {
      detail: { content: '' }
    }));
  }, [onTextChange]);

  const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!isConnected) {
      return;
    }

    const plainText = event.clipboardData.getData('text/plain');
    const htmlText = event.clipboardData.getData('text/html');
    const imageItems = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith('image/'));
    if (!imageItems.length && !plainText && !htmlText) {
      return;
    }

    event.preventDefault();

    const selection = window.getSelection();
    let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

    try {
      editorRef.current?.focus();

      if (plainText) {
        range = insertHtmlAtRange(range, plainTextToHtml(plainText), editorRef.current);
      } else if (htmlText) {
        range = insertHtmlAtRange(range, sanitizeRichText(htmlText), editorRef.current);
      }

      if (!imageItems.length) {
        handleInput();
        return;
      }

      const images = await Promise.all(imageItems.map(async (item) => {
        const file = item.getAsFile();
        if (!file) {
          return null;
        }

        return fileToInlineImageDataUrl(file);
      }));

      for (const dataUrl of images) {
        if (!dataUrl) {
          continue;
        }

        range = insertHtmlAtRange(range, `<img src="${dataUrl}" alt="Pasted image" />`, editorRef.current);
      }

      handleInput();
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : '图片粘贴失败');
    }
  }, [handleInput, isConnected]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const { textLength, imageCount } = getRichTextStats(contentHtml);
  const isEmpty = !contentHtml;

  return (
    <div className="shared-text-box">
      <div className="text-box-header">
        <h3>共享文本框</h3>
        <div className="text-box-actions">
          {!isConnected && <span className="offline-badge">离线</span>}
          <button
            onClick={handleClear}
            className="clear-btn"
            disabled={!contentHtml}
          >
            清空
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-disabled={!isConnected}
        contentEditable={isConnected}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-empty={isEmpty}
        data-placeholder={isConnected ? '在此输入文字或粘贴图片，对方会实时看到...' : '请先连接对端设备...'}
        className="shared-textarea"
      />
      <div className="text-box-footer">
        <span className="char-count">
          {textLength} 字符{imageCount ? ` · ${imageCount} 图片` : ''}
        </span>
        {pasteError && <span className="paste-error">{pasteError}</span>}
        {lastUpdateTime && (
          <span className="last-update">
            最后更新: {formatTime(lastUpdateTime)}
          </span>
        )}
      </div>
    </div>
  );
}

function insertHtmlAtRange(
  savedRange: Range | null,
  html: string,
  editor: HTMLDivElement | null
): Range | null {
  if (!editor || !html) {
    return savedRange;
  }

  const selection = window.getSelection();
  const range = savedRange ?? document.createRange();

  if (!savedRange) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  const insertedNodes = Array.from(fragment.childNodes);
  const lastNode = insertedNodes[insertedNodes.length - 1] || null;

  range.deleteContents();
  range.insertNode(fragment);

  if (!lastNode) {
    return savedRange;
  }

  const nextRange = document.createRange();
  nextRange.setStartAfter(lastNode);
  nextRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  return nextRange.cloneRange();
}
