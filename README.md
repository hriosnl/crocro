# Crocro - Cross-Browser Chat Extension

A private, real-time messaging extension for Chrome and Firefox that enables secure peer-to-peer communication between two people using WebRTC.

## Features

- **Cross-browser compatibility**: Works on both Chrome and Firefox
- **Real-time messaging**: WebRTC DataChannel for direct peer-to-peer communication
- **Private by default**: No message content stored on servers
- **WebSocket signaling**: Efficient connection establishment
- **Local storage**: IndexedDB for message history and session persistence
- **Responsive UI**: Clean, modern interface built with React
- **Room-based**: Simple 6-character room codes for easy connection

## Architecture

```
/crocro
  /src
    /background     # Service worker for signaling and WebRTC
    /content        # Content script for UI injection
    /popup          # React popup interface
    /options        # Settings page
    /lib            # Core libraries (WebRTC, signaling, storage)
    /assets         # Icons and static resources
  /server           # WebSocket signaling server
  /tests            # Playwright E2E tests
```

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Chrome or Firefox for testing

### Installation

1. **Clone and install dependencies**:
   ```bash
   npm install
   cd server && npm install
   ```

2. **Start the signaling server**:
   ```bash
   cd server && npm run dev
   ```
   Server will run on `http://localhost:8081`

3. **Build the extension**:
   ```bash
   npm run build
   ```
   Built extension will be in the `dist/` directory

### Loading the Extension

#### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` directory

#### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist/` directory

## Usage

1. **Create a room**: Click the extension icon and press "Create New Room"
2. **Share the room code**: Copy the 6-character room code to share with a friend
3. **Join a room**: Enter a room code and click "Join Room"
4. **Start chatting**: Once connected, messages are sent directly peer-to-peer

## Development Commands

- `npm run dev:chrome` - Development build with watch mode
- `npm run build` - Production build
- `npm run typecheck` - TypeScript type checking
- `npm run test:e2e` - Run Playwright E2E tests
- `npm run lint` - Run ESLint

### Server Commands

- `cd server && npm run dev` - Start development server
- `curl http://localhost:8081/health` - Check server health
- `curl http://localhost:8081/rooms` - List active rooms

## Testing

The project includes comprehensive E2E tests using Playwright:

```bash
npm run test:e2e
```

Tests cover:
- Extension loading and initialization
- Signaling server functionality
- Room creation and joining
- Message sending and receiving
- WebRTC connection establishment
- Error handling and recovery

## Configuration

Environment variables (in `.env`):
- `VITE_SIGNALING_URL` - WebSocket signaling server URL
- `VITE_STUNS` - JSON array of STUN servers
- `VITE_TURNS` - JSON array of TURN servers (optional)
- `VITE_TURN_USERNAME` - TURN server username
- `VITE_TURN_PASSWORD` - TURN server password

## Technical Details

### WebRTC Flow
1. User creates/joins room via signaling server
2. WebRTC PeerConnection established with ICE candidate exchange
3. DataChannel opened for message transport
4. Messages sent directly peer-to-peer (no server relay)

### Security
- End-to-end encrypted via WebRTC DTLS
- No message content stored on signaling server
- Minimal browser permissions required
- Optional TURN servers for firewall traversal

### Browser Compatibility
- **Chrome**: Manifest V3 service worker
- **Firefox**: Compatible with WebExtensions API
- **Cross-browser**: Uses `webextension-polyfill` for API normalization

## Project Structure

- **Background Script** (`src/background/`): Handles signaling, WebRTC setup, and storage
- **Content Script** (`src/content/`): Injects chat UI into web pages
- **Popup** (`src/popup/`): Extension popup interface (React)
- **Options** (`src/options/`): Settings page for configuration
- **Signaling Server** (`server/`): Minimal Node.js WebSocket server
- **Storage** (`src/lib/storage.ts`): IndexedDB wrapper for persistence
- **WebRTC** (`src/lib/rtc.ts`): Peer connection and data channel management

## Deployment

For production deployment:

1. **Build for both browsers**:
   ```bash
   npm run build
   ```

2. **Package extensions**:
   ```bash
   npm run package
   ```
   Creates `artifacts/crocro-chrome.zip` and `artifacts/crocro-firefox.zip`

3. **Deploy signaling server** to your preferred hosting platform

4. **Update environment variables** with production server URLs

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm run typecheck && npm run test:e2e`
4. Submit a pull request

For questions or issues, please open a GitHub issue.