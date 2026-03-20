# FastShare

A WebRTC-based peer-to-peer file sharing tool, similar to LocalSend, with support for local network discovery and remote connections via short codes.

## Features

- **Local Network Sharing**: Automatically discover devices on the same WiFi network and transfer files directly
- **Remote Connections**: Connect to devices on different networks using 8-character short codes
- **Auto-Reconnect**: Previously paired devices automatically reconnect using cookie-based storage
- **P2P Transfer**: Files are transferred directly between devices using WebRTC DataChannels - no server relay
- **Secure**: DTLS encryption, short code checksums, and rate limiting

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
# Install dependencies
npm install

# Start development server (frontend)
npm run dev

# Start signaling server (backend)
npm run server

# Or run both concurrently
npm run dev:all
```

### Development

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

### Local File Transfer

1. Open FastShare on both devices (must be on same WiFi network)
2. Select the target device from the discovered devices list
3. Choose files to send
4. Recipient accepts the transfer
5. Files are saved to the download directory

### Remote File Transfer

**Receiver:**
1. Click "Generate Short Code"
2. Share the 8-character code with the sender

**Sender:**
1. Click "Remote Connection"
2. Enter the short code
3. Click "Connect"
4. Send files as usual

### Auto-Reconnect

- Previously connected devices are saved
- Next time you open FastShare, it automatically attempts to reconnect
- Clear paired devices in settings if needed

## Project Structure

```
fastshare/
├── src/
│   ├── components/       # Vue 3 UI components
│   │   ├── DeviceList.vue
│   │   ├── FileSelector.vue
│   │   ├── TransferProgress.vue
│   │   ├── ShortCodeInput.vue
│   │   ├── ShortCodeDisplay.vue
│   │   └── ShortCodeManager.vue
│   ├── services/         # Core business logic
│   │   ├── discovery.ts
│   │   ├── webrtc.ts
│   │   ├── transfer.ts
│   │   ├── fileReceiver.ts
│   │   ├── shortCodeGenerator.ts
│   │   ├── shortCodeVerifier.ts
│   │   ├── remoteConnection.ts
│   │   ├── autoReconnect.ts
│   │   ├── shortCodeManager.ts
│   │   ├── rateLimiter.ts
│   │   └── shortCodeBlacklist.ts
│   ├── models/           # TypeScript type definitions
│   │   ├── device.ts
│   │   ├── connection.ts
│   │   └── fileTransferSession.ts
│   ├── stores/           # Vue 3 state management
│   │   ├── connection.ts
│   │   └── transfer.ts
│   ├── utils/            # Utility functions
│   │   ├── storage.ts
│   │   ├── cookie.ts
│   │   ├── crypto.ts
│   │   ├── base32.ts
│   │   ├── checksum.ts
│   │   ├── logger.ts
│   │   ├── sanitize.ts
│   │   ├── wakeLock.ts
│   │   └── notifications.ts
│   ├── config/           # Configuration
│   │   └── index.ts
│   ├── App.vue           # Main app component
│   └── main.ts           # Entry point
├── server/
│   └── index.js          # Signaling server (WebSocket)
├── specs/
│   └── 001-webrtc-file-share/
│       ├── spec.md       # Feature specification
│       ├── plan.md       # Implementation plan
│       ├── research.md   # Technical research
│       ├── data-model.md # Data model
│       ├── quickstart.md # Quick start guide
│       └── tasks.md      # Task list
└── package.json
```

## Technology Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **WebRTC**: simple-peer
- **State Management**: Vue 3 Reactives
- **Storage**: IndexedDB (encrypted) + Cookies
- **Signaling**: Node.js + WebSocket (ws)
- **Build**: Vite 8
- **Linting**: ESLint + Prettier

## API

### Signaling Server (WebSocket)

The signaling server handles device discovery and WebRTC signaling:

- `register` - Register device
- `discover` - Get device list
- `offer` / `answer` - WebRTC connection setup
- `ice-candidate` - ICE candidate exchange
- `generate-short-code` - Generate short code
- `verify-short-code` - Verify short code

See `specs/001-webrtc-file-share/contracts/signaling-api.md` for full API documentation.

## Security

- **DTLS Encryption**: All WebRTC data is encrypted
- **Short Code Checksum**: Base32Check2 prevents input errors
- **Rate Limiting**: Prevents brute force attacks
- **Input Sanitization**: XSS prevention
- **Encrypted Storage**: Short codes stored encrypted in IndexedDB

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

**Note**: HTTPS is required for production (WebRTC mandate).

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## Troubleshooting

### Connection Issues

- Ensure both devices are on the same network (for local transfer)
- Check firewall settings
- Verify signaling server is running

### Short Code Not Working

- Verify the code is entered correctly (no 0/O, 1/I confusion)
- Check if code has expired (10 minutes)
- Ensure code hasn't been revoked

### Slow Transfer Speeds

- Check network bandwidth
- Move closer to WiFi router
- Reduce number of concurrent transfers
