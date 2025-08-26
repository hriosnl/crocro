# Crocro - Cross-Browser Chat Extension

A private, real-time messaging extension for Chrome and Firefox that enables secure communication between two people using relay messaging with WebRTC fallback.

## Features

- **Cross-browser compatibility**: Works on both Chrome and Firefox
- **Real-time messaging**: WebSocket relay with WebRTC fallback for optimal performance
- **Private by default**: Messages relay through your own server
- **Instant connection**: No complex WebRTC negotiation delays
- **Local storage**: IndexedDB for message history and session persistence
- **Responsive UI**: Clean, modern interface built with React
- **Room-based**: Simple 6-character room codes for easy connection
- **Smart fallbacks**: Automatic protocol switching (WSS/WS) for different browsers

## Architecture

```
/crocro
  /src
    /background     # Service worker for signaling and messaging
    /content        # Content script for UI injection
    /popup          # React popup interface
    /options        # Settings page
    /lib            # Core libraries (signaling, WebRTC, storage)
    /assets         # Icons and static resources
  /server           # WebSocket signaling and relay server
  /tests            # Playwright E2E tests
```

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+ and npm
- Chrome or Firefox for testing

### 1. Setup and Start Server

```bash
# Install dependencies
npm install
cd server && npm install

# Start the signaling server
npm run dev
```
Server runs on `http://localhost:8080` and `https://localhost:8443`

### 2. Build and Load Extension

```bash
# Build extension
npm run build

# For Firefox: Accept certificate first
# Go to https://localhost:8443/health and accept the security warning
```

**Load in Chrome:**
1. Open `chrome://extensions/`
2. Enable "Developer mode" 
3. Click "Load unpacked" → Select `dist/` directory

**Load in Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on" → Select any file in `dist/`

### 3. Test Locally
1. Click extension icon → "Create Room" 
2. Open second browser → "Join Room" with the code
3. Start chatting instantly!

---

## 🚀 Production Deployment (For Remote Friends)

To use this with friends over the internet, you need to deploy the server online.

### Option 1: Render (Recommended - Easy & Free)

1. **Create Render Account**: Sign up at [render.com](https://render.com)

2. **Push to GitHub**: 
   ```bash
   # Make sure your server code is on GitHub
   git add .
   git commit -m "Add server for deployment"
   git push origin main
   ```

3. **Deploy on Render**:
   - Go to [render.com/dashboard](https://render.com/dashboard)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `server` folder as root directory
   - Choose "Node" environment
   - Click "Create Web Service"

4. **Get Your Server URL**: Render will give you a URL like `https://your-app.onrender.com`

5. **Update Environment**:
   ```bash
   # In your .env file
   VITE_SIGNALING_URL=wss://your-app.onrender.com
   ```

6. **Rebuild Extension**:
   ```bash
   npm run build
   ```

7. **Share with Friends**: Send them the built extension files and loading instructions

### Option 2: Fly.io (Good Free Alternative)

1. **Install Fly CLI**:
   ```bash
   # Install Fly CLI
   curl -L https://fly.io/install.sh | sh
   
   # Login to Fly
   fly auth login
   ```

2. **Deploy Server**:
   ```bash
   cd server
   fly launch --no-deploy
   # Follow prompts, then:
   fly deploy
   ```

3. **Update Environment**:
   ```bash
   # In your .env file  
   VITE_SIGNALING_URL=wss://your-app.fly.dev
   ```

### Option 3: Railway (Paid - $5/month)

1. **Note**: Railway no longer has a free tier, requires $5/month minimum

2. **Deploy if Budget Allows**:
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login and deploy
   railway login
   cd server && railway deploy
   ```

### Option 4: Your Own VPS/Server

1. **Server Requirements**:
   - Node.js 18+
   - PM2 for process management
   - SSL certificate (Let's Encrypt recommended)
   - Port 443 open for WSS

2. **Deploy Server**:
   ```bash
   # On your server
   git clone <your-repo>
   cd crocro/server
   npm install --production
   
   # Generate SSL certificate (Let's Encrypt)
   certbot --nginx -d yourdomain.com
   
   # Update server.js to use your SSL certificates
   # Start with PM2
   pm2 start server.js --name crocro-server
   pm2 save
   pm2 startup
   ```

3. **Update Environment**:
   ```bash
   # In your .env file
   VITE_SIGNALING_URL=wss://yourdomain.com
   ```

### Option 5: Cloudflare Tunnels (Advanced)

1. **Install Cloudflare Tunnel**:
   ```bash
   # Install cloudflared
   # Run your local server
   cd server && npm run dev
   
   # In another terminal, create tunnel
   cloudflared tunnel --url http://localhost:8080
   ```

2. **Use the tunnel URL** in your `.env` file

---

## 📦 Distributing to Friends

### Method 1: Send Built Files
1. Build extension: `npm run build`
2. Zip the `dist/` folder
3. Send to friends with loading instructions above

### Method 2: GitHub Releases
1. Tag your version: `git tag v1.0.0`
2. Push to GitHub: `git push origin v1.0.0`
3. Create a Release on GitHub with the built files
4. Friends can download from Releases page

### Method 3: Browser Stores (Future)
- Package extensions: `npm run package`  
- Submit `artifacts/crocro-chrome.zip` to Chrome Web Store
- Submit `artifacts/crocro-firefox.zip` to Firefox Add-ons

---

## 🔧 Configuration

Environment variables (`.env`):
```bash
VITE_SIGNALING_URL=wss://your-server.com
VITE_STUNS=["stun:stun.l.google.com:19302"]
VITE_TURNS=[]
VITE_TURN_USERNAME=""  
VITE_TURN_PASSWORD=""
```

## Development Commands

- `npm run build` - Production build
- `npm run typecheck` - TypeScript checking
- `npm run test:e2e` - E2E tests
- `npm run lint` - ESLint

### Server Commands  
- `cd server && npm run dev` - Development server
- `curl https://your-server.com/health` - Health check
- `curl https://your-server.com/rooms` - List rooms

## How It Works

1. **Connection**: Smart fallback tries WSS first (Firefox), then WS (Chrome)
2. **Relay Mode**: Messages go through your server instantly (default)
3. **WebRTC Fallback**: Attempts peer-to-peer upgrade in background
4. **Automatic**: No user configuration needed

**Message Flow**:
```
Browser A → Your Server → Browser B  (Relay Mode)
Browser A ↔ Browser B                 (WebRTC Mode - when available)
```

## Security & Privacy

- **Your server, your control**: Messages relay through your deployed server
- **Temporary storage**: Server doesn't persist messages
- **Optional encryption**: Add end-to-end encryption for sensitive conversations
- **Minimal permissions**: Only requires storage and network access

## Troubleshooting

**"Connecting..." stuck**: Refresh extension, check server is running
**Connection failed**: Verify server URL in `.env` and rebuild extension  
**Certificate errors**: Accept self-signed certificates in development
**Cross-browser issues**: Use relay mode (current setup) for reliability

## Technical Details

- **Relay Mode**: WebSocket connections to your server (current implementation)
- **WebRTC**: Direct peer-to-peer (fallback when available)
- **Storage**: IndexedDB for local message history
- **Manifest V3**: Compatible service worker architecture

## License

MIT License - see LICENSE file for details.

---

## Quick Deploy Checklist ✅

1. [ ] Deploy server to Render/Fly.io/Railway
2. [ ] Update `VITE_SIGNALING_URL` in `.env` 
3. [ ] Run `npm run build`
4. [ ] Test extension locally with deployed server
5. [ ] Share `dist/` folder + instructions with friends
6. [ ] Have friends load extension and test connection

**Ready to chat with friends worldwide! 🌍**