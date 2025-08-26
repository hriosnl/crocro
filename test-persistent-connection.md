# Test Plan: Persistent Connections

## Test Scenario: Message Sending When Popup is Closed

### Setup:
1. Build extension: `npm run build`
2. Start signaling server: `cd server && npm run dev`
3. Load extension in Chrome/Firefox dev mode from `dist` folder

### Test Steps:

#### Part 1: Initial Connection
1. **User A**: Open extension popup, click "Create New Room"
2. Note the room code (e.g., "ABC123")
3. **User B**: Open extension popup, enter room code, click "Join Room"
4. Both users should see "Connected" status
5. **User A**: Send message "Hello from A" - should work
6. **User B**: Send message "Hello from B" - should work
7. Both users should see both messages

#### Part 2: Test Popup Close Persistence
1. **User A**: Close the extension popup (close popup window)
2. **User B**: Send message "A's popup is closed" 
3. **Expected Result**: Message should still send successfully (WebRTC handled by background)
4. **User A**: Reopen extension popup
5. **Expected Result**: Should see the new message from User B
6. **User A**: Send message "I'm back" while User B has popup open
7. **Expected Result**: User B should receive the message immediately

#### Part 3: Test Both Popups Closed
1. **User A**: Close popup
2. **User B**: Close popup
3. **User A**: Reopen popup, send message "Both were closed"
4. **User B**: Reopen popup
5. **Expected Result**: User B should see the message from User A

### Success Criteria:
- ✅ Messages can be sent even when recipient's popup is closed
- ✅ Messages can be sent even when sender's popup was closed and reopened
- ✅ Connection persists in background service worker
- ✅ Messages are delivered when popup reopens
- ✅ No connection drops when popup is closed/opened

### Previous Issue (Fixed):
- ❌ Connection would drop when popup closed
- ❌ Unable to send messages when peer's popup was closed
- ❌ Had to reconnect every time popup was reopened

### Solution Implemented:
- Moved WebRTC connection management from popup to background service worker
- Background service worker maintains persistent connections
- Popup now just displays messages and sends commands to background
- Messages are queued and delivered when popup reconnects