interface FileSelectorProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

export function FileSelector({ onFileSelect, disabled }: FileSelectorProps) {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
      event.target.value = '';
    }
  };

  return (
    <div className="file-selector">
      <label className="file-label">
        <input
          type="file"
          onChange={handleFileChange}
          disabled={disabled}
          className="file-input"
        />
        <span className="file-button">Choose File</span>
      </label>
    </div>
  );
}
