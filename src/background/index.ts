import browser from 'webextension-polyfill'
import { SignalingClient } from '../lib/signaling'
import { StorageManager } from '../lib/storage'

interface ExtensionMessage {
  type: string
  payload?: any
}

class BackgroundService {
  private signalingClient: SignalingClient | null = null
  private storage: StorageManager
  private currentRoomId: string | null = null
  private popupPort: browser.Runtime.Port | null = null
  private isRoomInitiator: boolean = false
  private pendingSignals: any[] = []
  private hasPopupConnectedBefore: boolean = false

  constructor() {
    this.storage = new StorageManager()
    this.initializeExtension()
  }

  private async initializeExtension() {
    browser.runtime.onMessage.addListener(this.handleMessage.bind(this))
    browser.runtime.onConnect.addListener(this.handleConnection.bind(this))
    
    console.log('Crocro background service initialized')
  }

  private handleConnection(port: browser.Runtime.Port) {
    console.log('Port connected:', port.name)
    
    if (port.name === 'popup') {
      this.popupPort = port
      port.onDisconnect.addListener(() => {
        this.popupPort = null
      })
      
      // When popup reconnects, send queued signals
      this.handlePopupConnection()
    }
    
    port.onMessage.addListener(async (message: ExtensionMessage) => {
      const response = await this.handleMessage(message, port.sender!, () => {})
      if (response) {
        port.postMessage(response)
      }
    })
  }

  private async handleMessage(
    message: ExtensionMessage, 
    _sender: browser.Runtime.MessageSender,
    _sendResponse: (response?: any) => void
  ): Promise<any> {
    console.log('Background received message:', message.type)

    try {
      switch (message.type) {
        case 'CREATE_ROOM':
          return await this.createRoom()
        
        case 'JOIN_ROOM':
          return await this.joinRoom(message.payload.roomId)
        
        case 'SEND_MESSAGE':
          return await this.sendMessage(message.payload.text)
        
        case 'GET_MESSAGES':
          return await this.getMessages()
        
        case 'LEAVE_ROOM':
          return await this.leaveRoom()
        
        case 'SET_TYPING':
          return await this.setTyping(message.payload.isTyping)
        
        case 'GET_CONNECTION_STATUS':
          return this.getConnectionStatus()
        
        case 'RTC_SIGNAL':
          return await this.handleRTCSignal(message.payload)
        
        case 'RTC_READY':
          return await this.notifyRTCReady()
        
        case 'RTC_SEND_FAILED':
          return await this.handleRTCSendFailure(message.payload)
        
        case 'SAVE_INCOMING_MESSAGE':
          return await this.saveIncomingMessage(message.payload)
        
        default:
          console.warn('Unknown message type:', message.type)
          return { error: 'Unknown message type' }
      }
    } catch (error) {
      console.error('Error handling message:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private async createRoom(): Promise<{ roomId: string } | { error: string }> {
    try {
      const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080'
      this.signalingClient = new SignalingClient(signalingUrl)
      
      await this.signalingClient.connect()
      const roomId = await this.signalingClient.createRoom()
      
      this.currentRoomId = roomId
      this.isRoomInitiator = true
      await this.initializeSignaling()
      
      await this.storage.saveSession({ roomId, createdAt: Date.now(), type: 'creator' })
      
      return { roomId }
    } catch (error) {
      console.error('Failed to create room:', error)
      return { error: error instanceof Error ? error.message : 'Failed to create room' }
    }
  }

  private async joinRoom(roomId: string): Promise<{ success: boolean } | { error: string }> {
    try {
      const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080'
      this.signalingClient = new SignalingClient(signalingUrl)
      
      await this.signalingClient.connect()
      await this.signalingClient.joinRoom(roomId)
      
      this.currentRoomId = roomId
      this.isRoomInitiator = false
      await this.initializeSignaling()
      
      await this.storage.saveSession({ roomId, createdAt: Date.now(), type: 'joiner' })
      
      return { success: true }
    } catch (error) {
      console.error('Failed to join room:', error)
      return { error: error instanceof Error ? error.message : 'Failed to join room' }
    }
  }

  private async initializeSignaling() {
    if (!this.signalingClient || !this.currentRoomId) return

    // Set up signaling message handling - forward to popup or queue if not available
    this.signalingClient.onSignal = (signal: any) => {
      console.log('Background forwarding signal to popup:', signal.type, 'popupConnected:', !!this.popupPort)
      
      if (this.popupPort) {
        // Forward signal to popup for WebRTC handling
        console.log('Sending signal to popup:', signal)
        this.popupPort.postMessage({
          type: 'SIGNALING_MESSAGE',
          payload: signal
        })
      } else {
        // Queue signals when popup is not connected
        console.log('Popup not connected, queuing signal:', signal.type)
        this.pendingSignals.push(signal)
      }
    }

    // Set up relay message handling for when WebRTC is not available
    this.signalingClient.onMessage = async (message: any) => {
      console.log('Background received relay message:', message)
      await this.handleIncomingMessage(message)
    }

    console.log('Signaling setup complete, waiting for peer connection...')
  }

  private handlePopupConnection() {
    // When popup reconnects, send any queued signals
    if (this.pendingSignals.length > 0) {
      console.log('Sending', this.pendingSignals.length, 'queued signals to popup')
      for (const signal of this.pendingSignals) {
        this.popupPort!.postMessage({
          type: 'SIGNALING_MESSAGE',
          payload: signal
        })
      }
      this.pendingSignals = []
    }
  }

  private async handleRTCSignal(signal: any): Promise<{ success: boolean }> {
    // Forward RTC signals from popup to signaling server
    if (this.signalingClient) {
      this.signalingClient.sendSignal(signal)
      return { success: true }
    }
    return { success: false }
  }

  private async notifyRTCReady(): Promise<{ success: boolean }> {
    // Popup RTC manager is ready, send any queued signals
    console.log('Popup RTC manager is ready')
    this.handlePopupConnection()
    
    // If this is a reconnection (popup was closed and reopened), notify the other peer
    // Both creators and joiners should send reconnection signal
    if (this.signalingClient && this.currentRoomId && this.hasPopupConnectedBefore) {
      console.log(`Notifying signaling server of ${this.isRoomInitiator ? 'creator' : 'joiner'} reconnection`)
      this.signalingClient.sendSignal({
        type: 'peer-reconnected',
        isInitiator: this.isRoomInitiator
      })
    }
    
    // Mark that popup has connected at least once
    this.hasPopupConnectedBefore = true
    
    return { success: true }
  }

  private async handleRTCSendFailure(message: any): Promise<{ success: boolean }> {
    console.log('WebRTC send failed, falling back to signaling server relay')
    if (this.signalingClient) {
      // Send via relay - message is already saved in storage
      this.signalingClient.sendRelayMessage(message)
      return { success: true }
    }
    return { success: false }
  }

  private async saveIncomingMessage(message: any): Promise<{ success: boolean }> {
    if (!this.currentRoomId) {
      return { success: false }
    }

    try {
      const incomingMessage = {
        ...message,
        from: 'peer' as const,
        roomId: this.currentRoomId
      }
      
      await this.storage.saveMessage(incomingMessage)
      this.notifyMessageReceived(incomingMessage)
      return { success: true }
    } catch (error) {
      console.error('Error saving incoming message:', error)
      return { success: false }
    }
  }

  private async sendMessage(text: string): Promise<{ success: boolean } | { error: string }> {
    if (!this.currentRoomId) {
      return { error: 'Not connected to a room' }
    }

    try {
      const message = {
        id: crypto.randomUUID(),
        roomId: this.currentRoomId,
        text,
        timestamp: Date.now(),
        from: 'self' as const
      }

      // Save message locally first
      await this.storage.saveMessage(message)

      // Try WebRTC first if popup is connected
      if (this.popupPort) {
        this.popupPort.postMessage({
          type: 'SEND_RTC_MESSAGE',
          payload: message
        })
      } else {
        // Fallback to signaling server relay when popup is not connected
        if (this.signalingClient) {
          this.signalingClient.sendRelayMessage(message)
        }
      }
      
      // Notify that message was sent (after storage is complete)
      this.notifyMessageSent(message)
      return { success: true }
    } catch (error) {
      console.error('Error sending message:', error)
      return { error: error instanceof Error ? error.message : 'Failed to send message' }
    }
  }

  private async handleIncomingMessage(message: any) {
    if (!this.currentRoomId) return
    
    const incomingMessage = {
      ...message,
      from: 'peer' as const,
      roomId: this.currentRoomId
    }
    
    await this.storage.saveMessage(incomingMessage)
    
    // Forward to popup if connected
    if (this.popupPort) {
      this.popupPort.postMessage({
        type: 'RELAY_MESSAGE_RECEIVED',
        payload: incomingMessage
      })
    }
    
    this.notifyMessageReceived(incomingMessage)
  }

  private async getMessages(): Promise<{ messages: any[] }> {
    if (!this.currentRoomId) {
      return { messages: [] }
    }

    const messages = await this.storage.getMessages(this.currentRoomId)
    return { messages }
  }

  private async leaveRoom(): Promise<{ success: boolean }> {
    // Notify popup to close WebRTC connection
    if (this.popupPort) {
      this.popupPort.postMessage({
        type: 'CLOSE_RTC_CONNECTION'
      })
    }

    if (this.signalingClient) {
      this.signalingClient.disconnect()
      this.signalingClient = null
    }

    this.currentRoomId = null
    this.isRoomInitiator = false
    this.pendingSignals = []
    this.hasPopupConnectedBefore = false
    return { success: true }
  }

  private async setTyping(isTyping: boolean): Promise<{ success: boolean }> {
    // Forward typing indicator to popup for WebRTC sending
    if (this.popupPort) {
      this.popupPort.postMessage({
        type: 'SET_TYPING',
        payload: { isTyping }
      })
    }
    return { success: true }
  }

  private getConnectionStatus() {
    const signalingConnected = this.signalingClient?.getConnectionState() === 'connected'
    
    // If we have a room and signaling is connected, we're ready for WebRTC
    // The actual WebRTC state will be managed by the popup when it connects
    const isReadyForWebRTC = signalingConnected && this.currentRoomId
    
    return {
      connected: false, // WebRTC connection status will be managed by popup
      roomId: this.currentRoomId,
      connectionState: isReadyForWebRTC ? 'connecting' : 'disconnected',
      signaling: signalingConnected,
      status: isReadyForWebRTC ? 'connecting' : 'disconnected',
      isInitiator: this.isRoomInitiator
    }
  }

  private notifyMessageSent(message: any) {
    this.broadcastToUI('MESSAGE_SENT', message)
  }

  private notifyMessageReceived(message: any) {
    this.broadcastToUI('MESSAGE_RECEIVED', message)
  }

  // Note: Connection state changes now handled by popup
  // private notifyConnectionStateChange(state: string) {
  //   this.broadcastToUI('CONNECTION_STATE_CHANGED', { state })
  // }

  private async broadcastToUI(type: string, payload: any) {
    try {
      const tabs = await browser.tabs.query({ active: true })
      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, { type, payload }).catch(() => {
            // Ignore errors for tabs without content script
          })
        }
      }
    } catch (error) {
      console.warn('Failed to broadcast to UI:', error)
    }
  }
}

new BackgroundService()