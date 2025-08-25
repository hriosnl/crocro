import browser from 'webextension-polyfill'

class CrocroContentScript {
  private shadowRoot: ShadowRoot | null = null
  private hostElement: HTMLElement | null = null
  private isUIVisible = false
  private port: browser.Runtime.Port | null = null

  constructor() {
    this.initialize()
  }

  private async initialize() {
    console.log('Crocro content script initialized')
    
    // Connect to background script
    this.port = browser.runtime.connect({ name: 'crocro-content' })
    this.port.onMessage.addListener(this.handleBackgroundMessage.bind(this))
    
    // Listen for keyboard shortcut or extension icon click
    document.addEventListener('keydown', this.handleKeydown.bind(this))
    
    // Listen for messages from background
    browser.runtime.onMessage.addListener(this.handleMessage.bind(this))
    
    // Check if we should auto-show UI (e.g., from deep link)
    this.checkForAutoShow()
  }

  private handleKeydown(event: KeyboardEvent) {
    // Ctrl+Shift+C or Cmd+Shift+C to toggle UI
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'C') {
      event.preventDefault()
      this.toggleUI()
    }
  }

  private async handleMessage(message: any, _sender: browser.Runtime.MessageSender) {
    switch (message.type) {
      case 'TOGGLE_UI':
        this.toggleUI()
        break
      
      case 'SHOW_UI':
        this.showUI()
        break
      
      case 'HIDE_UI':
        this.hideUI()
        break
      
      case 'MESSAGE_RECEIVED':
        this.handleMessageReceived(message.payload)
        break
      
      case 'CONNECTION_STATE_CHANGED':
        this.handleConnectionStateChanged(message.payload.state)
        break
    }
  }

  private handleBackgroundMessage(message: any) {
    // Handle messages from background script via port
    this.handleMessage(message, { id: browser.runtime.id } as browser.Runtime.MessageSender)
  }

  private async checkForAutoShow() {
    // Check URL for deep link patterns
    const url = new URL(window.location.href)
    if (url.hash.includes('#crocro-join:')) {
      const roomId = url.hash.replace('#crocro-join:', '')
      if (roomId) {
        this.showUI()
        // Auto-join room after UI is loaded
        setTimeout(() => {
          this.sendToBackground('JOIN_ROOM', { roomId })
        }, 1000)
      }
    }
  }

  private toggleUI() {
    if (this.isUIVisible) {
      this.hideUI()
    } else {
      this.showUI()
    }
  }

  private async showUI() {
    if (this.isUIVisible) return

    this.createHostElement()
    this.createShadowDOM()
    await this.loadUI()
    
    this.isUIVisible = true
    console.log('Crocro UI shown')
  }

  private hideUI() {
    if (!this.isUIVisible) return

    if (this.hostElement) {
      this.hostElement.remove()
      this.hostElement = null
      this.shadowRoot = null
    }
    
    this.isUIVisible = false
    console.log('Crocro UI hidden')
  }

  private createHostElement() {
    this.hostElement = document.createElement('div')
    this.hostElement.id = 'crocro-chat-host'
    
    // Position the host element
    Object.assign(this.hostElement.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '350px',
      height: '500px',
      zIndex: '2147483647',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      backgroundColor: '#1a1a1a',
      overflow: 'hidden',
      resize: 'both',
      minWidth: '300px',
      minHeight: '400px',
      maxWidth: '500px',
      maxHeight: '700px'
    })

    document.body.appendChild(this.hostElement)
  }

  private createShadowDOM() {
    if (!this.hostElement) return

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' })
    
    // Create container
    const container = document.createElement('div')
    container.id = 'crocro-root'
    
    Object.assign(container.style, {
      width: '100%',
      height: '100%',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
      color: '#ffffff',
      backgroundColor: '#1a1a1a'
    })

    this.shadowRoot.appendChild(container)
  }

  private async loadUI() {
    if (!this.shadowRoot) return

    const container = this.shadowRoot.getElementById('crocro-root')
    if (!container) return

    // For now, create a simple HTML structure
    // In production, this would load the React app
    container.innerHTML = `
      <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #333;">
          <h2 style="margin: 0; font-size: 16px; font-weight: 600;">Crocro Chat</h2>
          <button id="close-btn" style="background: none; border: none; color: #666; cursor: pointer; font-size: 18px;">×</button>
        </div>
        
        <div id="connection-status" style="padding: 8px 12px; background: #333; border-radius: 6px; margin-bottom: 16px; font-size: 12px; color: #999;">
          Disconnected
        </div>
        
        <div id="room-setup" style="display: block;">
          <div style="margin-bottom: 16px;">
            <button id="create-room-btn" style="width: 100%; padding: 12px; background: #007bff; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px; font-weight: 500; margin-bottom: 8px;">
              Create New Room
            </button>
            <div style="text-align: center; margin: 12px 0; color: #666; font-size: 12px;">or</div>
            <input id="room-id-input" type="text" placeholder="Enter room code" style="width: 100%; padding: 12px; background: #333; border: 1px solid #555; border-radius: 6px; color: white; font-size: 14px; margin-bottom: 8px;" maxlength="6">
            <button id="join-room-btn" style="width: 100%; padding: 12px; background: #28a745; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px; font-weight: 500;">
              Join Room
            </button>
          </div>
        </div>
        
        <div id="chat-interface" style="display: none; flex: 1; display-direction: column;">
          <div id="room-info" style="padding: 8px 12px; background: #333; border-radius: 6px; margin-bottom: 16px; font-size: 12px;">
            <div id="room-id-display"></div>
            <div id="share-link" style="margin-top: 4px; word-break: break-all; color: #007bff; cursor: pointer;"></div>
          </div>
          
          <div id="messages" style="flex: 1; overflow-y: auto; padding: 0; margin-bottom: 16px; max-height: 300px; border: 1px solid #333; border-radius: 6px;">
            <!-- Messages will be inserted here -->
          </div>
          
          <div style="display: flex; gap: 8px;">
            <input id="message-input" type="text" placeholder="Type a message..." style="flex: 1; padding: 12px; background: #333; border: 1px solid #555; border-radius: 6px; color: white; font-size: 14px;">
            <button id="send-btn" style="padding: 12px 16px; background: #007bff; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">Send</button>
          </div>
        </div>
      </div>
    `

    this.attachEventListeners()
  }

  private attachEventListeners() {
    if (!this.shadowRoot) return

    // Close button
    const closeBtn = this.shadowRoot.getElementById('close-btn')
    closeBtn?.addEventListener('click', () => this.hideUI())

    // Create room
    const createRoomBtn = this.shadowRoot.getElementById('create-room-btn')
    createRoomBtn?.addEventListener('click', () => this.createRoom())

    // Join room
    const joinRoomBtn = this.shadowRoot.getElementById('join-room-btn')
    joinRoomBtn?.addEventListener('click', () => this.joinRoom())

    // Send message
    const sendBtn = this.shadowRoot.getElementById('send-btn')
    const messageInput = this.shadowRoot.getElementById('message-input') as HTMLInputElement
    
    sendBtn?.addEventListener('click', () => this.sendMessage())
    messageInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage()
      }
    })

    // Share link click
    const shareLink = this.shadowRoot.getElementById('share-link')
    shareLink?.addEventListener('click', () => this.copyShareLink())
  }

  private async createRoom() {
    const response = await this.sendToBackground('CREATE_ROOM')
    if (response?.roomId) {
      this.showChatInterface(response.roomId)
    } else {
      alert('Failed to create room: ' + (response?.error || 'Unknown error'))
    }
  }

  private async joinRoom() {
    const roomIdInput = this.shadowRoot?.getElementById('room-id-input') as HTMLInputElement
    const roomId = roomIdInput?.value?.trim().toUpperCase()
    
    if (!roomId) {
      alert('Please enter a room code')
      return
    }

    const response = await this.sendToBackground('JOIN_ROOM', { roomId })
    if (response?.success) {
      this.showChatInterface(roomId)
    } else {
      alert('Failed to join room: ' + (response?.error || 'Unknown error'))
    }
  }

  private showChatInterface(roomId: string) {
    if (!this.shadowRoot) return

    const roomSetup = this.shadowRoot.getElementById('room-setup')
    const chatInterface = this.shadowRoot.getElementById('chat-interface')
    const roomIdDisplay = this.shadowRoot.getElementById('room-id-display')
    const shareLink = this.shadowRoot.getElementById('share-link')

    if (roomSetup) roomSetup.style.display = 'none'
    if (chatInterface) chatInterface.style.display = 'flex'
    if (roomIdDisplay) roomIdDisplay.textContent = `Room: ${roomId}`
    if (shareLink) {
      const link = `${window.location.origin}${window.location.pathname}#crocro-join:${roomId}`
      shareLink.textContent = `Share: ${link}`
    }

    // Load existing messages
    this.loadMessages()
  }

  private async sendMessage() {
    const messageInput = this.shadowRoot?.getElementById('message-input') as HTMLInputElement
    const text = messageInput?.value?.trim()
    
    if (!text) return

    const response = await this.sendToBackground('SEND_MESSAGE', { text })
    if (response?.success) {
      messageInput.value = ''
    } else {
      alert('Failed to send message: ' + (response?.error || 'Unknown error'))
    }
  }

  private async loadMessages() {
    const response = await this.sendToBackground('GET_MESSAGES')
    if (response?.messages) {
      this.displayMessages(response.messages)
    }
  }

  private displayMessages(messages: any[]) {
    const messagesContainer = this.shadowRoot?.getElementById('messages')
    if (!messagesContainer) return

    messagesContainer.innerHTML = messages.map(message => `
      <div style="padding: 8px 12px; margin-bottom: 4px; ${message.from === 'self' ? 'text-align: right; background: #007bff; color: white; margin-left: 20px;' : 'background: #333; margin-right: 20px;'} border-radius: 8px; font-size: 13px;">
        <div style="margin-bottom: 2px;">${this.escapeHtml(message.text)}</div>
        <div style="font-size: 10px; opacity: 0.7;">${new Date(message.timestamp).toLocaleTimeString()}</div>
      </div>
    `).join('')

    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }

  private copyShareLink() {
    const shareLink = this.shadowRoot?.getElementById('share-link')?.textContent
    if (shareLink) {
      const link = shareLink.replace('Share: ', '')
      navigator.clipboard.writeText(link).then(() => {
        // Show brief feedback
        const originalText = shareLink
        if (this.shadowRoot) {
          const element = this.shadowRoot.getElementById('share-link')
          if (element) {
            element.textContent = 'Copied!'
            setTimeout(() => {
              element.textContent = originalText
            }, 1500)
          }
        }
      })
    }
  }

  private handleMessageReceived(message: any) {
    // Refresh messages when new message arrives
    this.loadMessages()
    
    // Show notification if window is not focused
    if (document.hidden) {
      this.showNotification('New message', message.text)
    }
  }

  private handleConnectionStateChanged(state: string) {
    const statusElement = this.shadowRoot?.getElementById('connection-status')
    if (statusElement) {
      statusElement.textContent = `Status: ${state}`
      statusElement.style.background = state === 'connected' ? '#28a745' : '#333'
    }
  }

  private async showNotification(title: string, message: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: browser.runtime.getURL('assets/icon-48.png')
      })
    }
  }

  private sendToBackground(type: string, payload?: any): Promise<any> {
    return new Promise((resolve) => {
      if (this.port) {
        // Use port for communication
        const messageId = crypto.randomUUID()
        const handler = (response: any) => {
          if (response?.messageId === messageId) {
            this.port?.onMessage.removeListener(handler)
            resolve(response.data)
          }
        }
        
        this.port.onMessage.addListener(handler)
        this.port.postMessage({ type, payload, messageId })
        
        // Timeout after 5 seconds
        setTimeout(() => {
          this.port?.onMessage.removeListener(handler)
          resolve({ error: 'Request timeout' })
        }, 5000)
      } else {
        // Fallback to runtime messaging
        browser.runtime.sendMessage({ type, payload }).then(resolve).catch(resolve)
      }
    })
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Initialize content script
new CrocroContentScript()