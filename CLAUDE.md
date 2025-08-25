# CLAUDE.md

This file tells the coding agent Claude Code (claude.ai/code) how to build and modify a cross‑browser chat extension for real‑time messaging between two people. The extension runs on Chrome and Firefox using the WebExtensions API (MV3), shares one codebase, and uses a lightweight signaling server to establish peer connections.

## Project overview

### Crocro — Cross‑Browser Chat Extension

A cross-browser chat extension (Firefox & Chrome) that enables real-time messaging between two friends, designed to feel instantaneous when the popup is open, and reliably up‑to‑date when it’s closed. This is a browser extension built with React + TypeScript + Vite. The extension uses Manifest V3 and includes both a popup interface and background service worker and builds with one codebase for Chrome + Firefox.

**Primary goals**

- Fast, private, two‑person chat with typing indicators and read receipts.
- Minimal permissions and no page scraping; user sends only what they type.
- Cross‑browser parity (Chrome + Firefox) via `webextension‑polyfill`.
- Local message history and settings stored client‑side with IndexedDB.

**Non‑goals**

- No multi‑room channels beyond 1:1 for the first release.
- No cloud analytics; only optional basic, locally visible debug logs.

---

## Architecture

**Extension layers**

- **Background service worker (MV3)** handles signaling, WebRTC setup, reconnection, notifications, and storage orchestration.
- **Content script** injects the chat UI via Shadow DOM and passes user actions to the background using `runtime.sendMessage` and `tabs.sendMessage`.
- **Options page** lets a user configure a display name, preferred theme, and advanced network options (signaling URL, STUN/TURN list).

**Signaling and transport**

- **Signaling**: secure WebSocket endpoint, `wss://<SIGNALING_HOST>`.
- **P2P transport**: WebRTC DataChannel with DTLS/SRTP.
- **Traversal**: STUN for discovery; TURN for relay when direct P2P fails.
- **Fallback**: if DataChannel cannot open, use server relay for message frames until the ICE state recovers.

**Session model**

- **Room codes (default)**: one user creates a session, gets a short random code and link to share. The second user enters the code or opens the link to join.
- **Direct invites (optional)**: the creator can copy a QR code or a `we2://join/<room>` deep link (handled by the extension’s options page and content script).

**Data model**

- `Profile`: `{ id, displayName, avatar?, color }`
- `Session`: `{ roomId, createdAt, peers: [peerId], transport: 'webrtc'|'relay' }`
- `Message`: `{ id, roomId, from, to, body, createdAt, ackAt?, readAt?, type: 'text'|'system' }`

---

## Data flow (happy path)

1. **Creator** clicks the toolbar button or presses the shortcut to open the popup, then chooses **Start chat** → the background calls the signaling server to create `roomId` and returns a join code.
2. **Joiner** enters the code or opens the invite link. Both sides connect to signaling over WebSocket.
3. The background creates a **WebRTC PeerConnection**, exchanges SDP/ICE candidates via signaling, and opens a **reliable DataChannel** named `chat`.
4. When `chat` is open, messages stream P2P. Acks are sent as small control frames; read receipts piggyback on focus/visibility events.
5. IndexedDB persists messages and session metadata; UI loads recent history for the current room.

**Failure/recovery**

- If ICE fails, switch to TURN; if TURN fails, transparently use server relay for messages until P2P is restored.
- WebSocket reconnect with exponential backoff; pending messages are queued client‑side.

---

## Security & privacy

- End‑to‑end security is provided by DTLS on the DataChannel. For additional privacy, an **optional double‑ratchet layer** can be added later; for v1 rely on DTLS and TLS for signaling.
- No content is read from the page; only user‑typed text is sent.
- Minimal permissions: `storage`, `activeTab`, `scripting`, and (optional) `notifications`.
- The signaling server stores no message content; it only brokers session metadata and ICE.

---

## Cross‑browser details

- Use `webextension‑polyfill` and code against `browser.*` APIs; provide a tiny adapter for `chrome.*` when needed.
- Avoid Chrome‑only features like `chrome.sidePanel` for v1. Use a content‑injected panel with Shadow DOM for consistent styling.
- Firefox MV3 service workers suspend aggressively; keep the worker stateless where possible and resume via messages/alarms.

---

## Project layout

```
/crocro
  package.json
  vite.config.ts
  /src
    /background     // service worker, signaling, rtc, storage
    /content        // panel injector, DOM host
    /ui             // React/Preact components, hooks, styles
    /lib            // ws client, rtc helpers, idb wrapper, logging
    /options        // settings page
    /assets         // icons, images
  /server           // minimal signaling server (Node + ws) and TURN config
  /tests            // unit + e2e
  /manifest         // per‑browser templates if needed
```

---

## Commands the agent should maintain

- Install: `pnpm i`
- Type check: `pnpm typecheck`
- Lint + format: `pnpm lint && pnpm format:check`
- Dev (Chrome): `pnpm dev:chrome`
- Dev (Firefox): `pnpm dev:firefox`
- Build all: `pnpm build`
- Package zips: `pnpm package`
- Unit tests: `pnpm test`
- E2E tests: `pnpm test:e2e`

If a command is missing, add it to `package.json` and wire the scripts/config.

---

## Configuration

Create `.env` files for development.

```
VITE_SIGNALING_URL=wss://localhost:8443
VITE_STUNS=["stun:stun.l.google.com:19302"]
VITE_TURNS=["turns:turn.example.com:5349?transport=tcp"]
VITE_TURN_USERNAME=demo
VITE_TURN_PASSWORD=demo
```

The background loads these at build time; the Options page allows runtime overrides stored in `storage.local`.

---

## Manifest (MV3)

```json
{
  "manifest_version": 3,
  "name": "Crocro - Realtime private chat",
  "version": "0.1.0",
  "description": "Private, minimal chat between two friends.",
  "action": {
    "default_popup": "popup/index.html",
    "default_title": "Crocro"
  },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["storage", "scripting"],
  "optional_permissions": ["notifications", "tabs"],
  "host_permissions": ["*://*/"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["ui/*", "assets/*"],
      "matches": ["<all_urls>"]
    }
  ],
  "options_ui": { "page": "popup/index.html", "open_in_tab": true }
}
```

---

## UI/UX

- First‑run shows **Create session** or **Join with code**.
- Show presence (online/connecting), typing indicator, and read receipts.
- Markdown rendering is allowed for plaintext emphasis, with sanitization and copy buttons for code blocks.
- Desktop notifications (optional).
- For design guideline, refer to `./style-guide.md`

---

## Storage

- IndexedDB for messages and sessions via a small wrapper (`lib/idb.ts`).
- `storage.local` for preferences and network settings.
- A compact export/import of a session is available from the Options page for backup.

---

## Testing

- Unit tests with Vitest for RTC helpers, signaling client, and storage.
- E2E with Playwright: launches two browser contexts with the built extension, creates a room in Context A, joins from Context B, verifies message echo, typing, and read receipts, then simulates network loss and TURN fallback.
- The agent must run `pnpm lint && pnpm typecheck && pnpm test` before opening PRs.

---

## Signaling server (dev)

A minimal Node server lives in `/server`:

- `ws` for WebSocket rooms and SDP/ICE relay.
- HTTPS/WSS in development with self‑signed certs.
- Optional relay endpoint for message frames when P2P is down.
- Rate limiting and simple room TTL cleanup.

Run locally:

```
cd server && pnpm i && pnpm dev
```

The extension connects to `VITE_SIGNALING_URL`.

---

## Release checklist

- Bump versions in `manifest` and `package.json`.
- `pnpm build && pnpm package` to produce Chrome/Firefox zips in `/artifacts`.
- Prepare store listings with permissions rationale and screenshots.

---

## Tasks Codex can safely take on

- Implement the signaling client and WebRTC DataChannel setup.
- Build the room‑code create/join flow and QR/link share.
- Add typing and read‑receipt control frames on the DataChannel.
- Implement IndexedDB storage and a small export/import.
- Add robust reconnection and TURN fallback.
- Create Playwright E2E that spins two contexts and validates a full chat roundtrip.
- Polish the panel UI and notifications.

### Implemented features

- Options page persists the user's display name using `storage.local`.
- Content script injects the UI inside a Shadow DOM host to avoid page styles.
- Basic real-time chat via a WebSocket relay.
- Minimal WebSocket signaling server for room-based message relay.

**When making changes**, update this file and add/adjust tests accordingly.

---

## Risks & constraints

- Avoid broad host permissions unless necessary for injection.
- Keep background work short‑lived; handle suspension gracefully.
- Never log message bodies in production builds.
- TURN usage can incur cost; gate with settings and document it.
