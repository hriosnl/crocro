import browser from 'webextension-polyfill'
import { SignalingClient } from '../lib/signaling'
import { StorageManager } from '../lib/storage'
import { RTCManager } from '../lib/rtc'

interface ExtensionMessage {
  type: string
  payload?: any
}

class BackgroundService {
  private signalingClient: SignalingClient | null = null
  private rtcManager: RTCManager | null = null
  private storage: StorageManager
  private currentRoomId: string | null = null
  private popupPort: browser.Runtime.Port | null = null
  private isRoomInitiator: boolean = false
  private pendingMessages: any[] = []
  private isRelayConnected: boolean = false

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
      
      // When popup connects, send current connection status immediately
      const currentStatus = this.getConnectionStatus()
      port.postMessage({
        type: 'CONNECTION_STATE_CHANGED',
        payload: { state: currentStatus.status }
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
        
        case 'GET_RTC_CONNECTION_STATE':
          return this.getRTCConnectionState()
        
        case 'GET_PENDING_MESSAGES':
          return this.getPendingMessages()
        
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
      await this.initializeRTC()
      
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
      await this.initializeRTC()
      
      await this.storage.saveSession({ roomId, createdAt: Date.now(), type: 'joiner' })
      
      return { success: true }
    } catch (error) {
      console.error('Failed to join room:', error)
      return { error: error instanceof Error ? error.message : 'Failed to join room' }
    }
  }

  private async initializeSignaling() {
    if (!this.signalingClient || !this.currentRoomId) return

    // Set up signaling message handling - handle WebRTC directly in background
    this.signalingClient.onSignal = (signal: any) => {
      console.log('Background received signaling message:', signal.type)
      
      // If it's a peer-joined signal and WebRTC isn't available, mark as connected via relay
      if (signal.type === 'peer-joined' && typeof RTCPeerConnection === 'undefined') {
        console.log('Peer joined, WebRTC not available, using relay-only mode')
        this.isRelayConnected = true
        this.notifyConnectionStateChange('connected')
      }
      
      // For joiners, when they join a room and WebRTC isn't available, check if peer is already present
      if (signal.type === 'room-joined' && !this.isRoomInitiator && typeof RTCPeerConnection === 'undefined') {
        console.log('Joined room successfully, WebRTC not available, using relay-only mode')
        // If the room-joined signal indicates there's already a peer, mark as connected immediately
        if (signal.hasPeer || signal.peers?.length > 1) {
          console.log('Room already has peer, marking as connected via relay')
          this.isRelayConnected = true
          this.notifyConnectionStateChange('connected')
        } else {
          console.log('Room empty, waiting for peer to join')
          this.notifyConnectionStateChange('connecting')
        }
      }
      
      // For initiator, when they create a room and WebRTC isn't available, they're ready but waiting for peer
      if (signal.type === 'room-created' && this.isRoomInitiator && typeof RTCPeerConnection === 'undefined') {
        console.log('Room created successfully, WebRTC not available, using relay-only mode (waiting for peer)')
        this.notifyConnectionStateChange('connecting') // Show connecting until peer joins
      }
      
      this.handleRTCSignal(signal)
    }

    // Set up relay message handling for when WebRTC is not available
    this.signalingClient.onMessage = async (message: any) => {
      console.log('Background received relay message:', message)
      await this.handleIncomingMessage(message)
    }

    console.log('Signaling setup complete, waiting for peer connection...')
  }

  private async initializeRTC() {
    // Check if WebRTC APIs are available in this context
    if (typeof RTCPeerConnection === 'undefined') {
      console.log('WebRTC APIs not available in background service worker, using relay-only mode')
      this.rtcManager = null
      return
    }

    if (this.rtcManager) {
      console.log('Cleaning up existing RTC manager')
      this.rtcManager.close()
      this.rtcManager = null
    }

    try {
      // Get RTC configuration
      const config = this.getRTCConfig()
      this.rtcManager = new RTCManager(config)
      
      // Set up RTC event handlers
      this.rtcManager.onMessage = (message) => {
        this.handleIncomingRTCMessage(message)
      }

      this.rtcManager.onConnectionStateChange = (state) => {
        console.log('Background RTC connection state changed:', state)
        this.notifyConnectionStateChange(state)
        
        // If connected, try sending any queued messages
        if (state === 'connected' && this.pendingMessages.length > 0) {
          this.sendQueuedMessages()
        }
      }

      this.rtcManager.onSignal = (signal) => {
        // Send signal to signaling server
        if (this.signalingClient) {
          this.signalingClient.sendSignal(signal)
        }
      }

      // If we're the initiator, start WebRTC immediately
      if (this.isRoomInitiator) {
        console.log('Initializing WebRTC as initiator (creator)')
        await this.rtcManager.initialize(true)
      }

      console.log('Background RTC manager initialized')
    } catch (error) {
      console.error('Failed to initialize WebRTC in background, falling back to relay-only:', error)
      this.rtcManager = null
    }
  }

  private handlePopupConnection() {
    // When popup reconnects, send pending messages if any
    if (this.pendingMessages.length > 0 && this.popupPort) {
      console.log('Sending', this.pendingMessages.length, 'pending messages to popup')
      for (const message of this.pendingMessages) {
        this.popupPort.postMessage({
          type: 'PENDING_MESSAGE',
          payload: message
        })
      }
      this.pendingMessages = []
    }
  }

  private async handleRTCSignal(signal: any): Promise<void> {
    console.log('Background handling RTC signal:', signal.type)
    
    // If WebRTC is not available, we rely purely on relay messaging
    if (typeof RTCPeerConnection === 'undefined' || !this.rtcManager) {
      console.log('WebRTC not available, skipping signal handling:', signal.type)
      
      // For peer-joined signal, mark as connected via relay
      if (signal.type === 'peer-joined') {
        this.isRelayConnected = true
        this.notifyConnectionStateChange('connected')
      }
      // For peer-left signal, mark as disconnected
      else if (signal.type === 'peer-left') {
        this.isRelayConnected = false
        this.notifyConnectionStateChange('connecting') // Back to connecting/waiting for peer
      }
      return
    }
    
    if (signal.type === 'peer-joined') {
      console.log('Peer joined, starting WebRTC as initiator:', this.isRoomInitiator)
      // Start WebRTC connection when peer joins (only for initiator)
      if (this.isRoomInitiator && this.rtcManager) {
        setTimeout(() => {
          if (this.rtcManager) {
            console.log('Initializing WebRTC as initiator:', this.isRoomInitiator)
            this.rtcManager.initialize(this.isRoomInitiator)
          }
        }, 100)
      }
    } else if (signal.type === 'peer-reconnected') {
      console.log('Peer reconnected, signal data:', signal)
      const peerWasInitiator = signal.isInitiator || signal.data?.isInitiator
      
      // If the peer that reconnected was not the initiator (joiner reconnected), 
      // and we are the initiator, we should reinitialize to send a fresh offer
      if (peerWasInitiator === false && this.isRoomInitiator && this.rtcManager) {
        console.log('Joiner reconnected, re-initializing WebRTC as initiator')
        setTimeout(() => {
          if (this.rtcManager) {
            this.rtcManager.initialize(this.isRoomInitiator)
          }
        }, 100)
      }
    } else if (signal.type === 'offer') {
      console.log('Received offer signal, rtcManager exists:', !!this.rtcManager)
      
      // Initialize WebRTC for joiner when offer arrives
      if (!this.rtcManager) {
        console.log('Creating new RTCManager for joiner')
        await this.initializeRTC()
      }
      
      if (this.rtcManager) {
        const currentState = this.rtcManager.getConnectionState()
        console.log('RTCManager state:', currentState)
        
        if (currentState === 'new' || currentState === 'closed' || currentState === 'disconnected') {
          console.log('Re-initializing RTCManager as joiner')
          await this.rtcManager.initialize(false)
        }
        
        // Forward offer to RTC manager
        await this.rtcManager.handleSignal(signal)
      }
    } else if (this.rtcManager) {
      // Forward other WebRTC signals to RTC manager
      console.log('Forwarding signal to RTC manager:', signal.type)
      this.rtcManager.handleSignal(signal)
    }
  }

  private getRTCConfig() {
    const stunServers = JSON.parse(import.meta.env.VITE_STUNS || '[\"stun:stun.l.google.com:19302\"]')
    const turnServers = JSON.parse(import.meta.env.VITE_TURNS || '[]')
    
    return {
      stunServers,
      turnServers,
      turnUsername: import.meta.env.VITE_TURN_USERNAME,
      turnPassword: import.meta.env.VITE_TURN_PASSWORD
    }
  }

  private async handleIncomingRTCMessage(message: any) {
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
        type: 'RTC_MESSAGE_RECEIVED',
        payload: incomingMessage
      })
    } else {
      // Queue for when popup connects
      this.pendingMessages.push(incomingMessage)
    }
    
    this.notifyMessageReceived(incomingMessage)
  }

  private async sendQueuedMessages() {
    if (!this.rtcManager || !this.rtcManager.isConnected()) return
    
    console.log('Sending queued messages via WebRTC')
    // Note: Queued outgoing messages are handled by the storage system
    // This method is for ensuring pending incoming messages are delivered to popup
  }

  private getRTCConnectionState() {
    return {
      connected: this.rtcManager?.isConnected() || false,
      connectionState: this.rtcManager?.getConnectionState() || 'disconnected',
      dataChannelState: this.rtcManager?.getDataChannelState() || null
    }
  }

  private getPendingMessages() {
    return { messages: this.pendingMessages }
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

      // Try WebRTC first if available and connected
      let messageSent = false
      if (this.rtcManager && this.rtcManager.isConnected()) {
        const success = await this.rtcManager.sendMessage(message)
        if (success) {
          messageSent = true
          console.log('Message sent via WebRTC')
        } else {
          console.log('WebRTC send failed, falling back to relay')
        }
      }
      
      // If WebRTC didn't work or isn't available, use signaling server relay
      if (!messageSent) {
        console.log('Sending message via relay (WebRTC not available or failed)')
        if (this.signalingClient) {
          this.signalingClient.sendRelayMessage(message)
          messageSent = true
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
    // Close WebRTC connection managed by background
    if (this.rtcManager) {
      this.rtcManager.close()
      this.rtcManager = null
    }

    if (this.signalingClient) {
      this.signalingClient.disconnect()
      this.signalingClient = null
    }

    this.currentRoomId = null
    this.isRoomInitiator = false
    this.isRelayConnected = false
    this.pendingMessages = []
    return { success: true }
  }

  private async setTyping(isTyping: boolean): Promise<{ success: boolean }> {
    // Send typing indicator via WebRTC managed by background
    if (this.rtcManager && this.rtcManager.isConnected()) {
      await this.rtcManager.sendTypingIndicator(isTyping)
    }
    return { success: true }
  }

  private getConnectionStatus() {
    const signalingConnected = this.signalingClient?.getConnectionState() === 'connected'
    const webrtcConnected = this.rtcManager?.isConnected() || false
    const webrtcState = this.rtcManager?.getConnectionState() || 'disconnected'
    
    // If WebRTC is not available, use relay connection status
    const effectivelyConnected = webrtcConnected || (typeof RTCPeerConnection === 'undefined' && this.isRelayConnected)
    const effectiveState = webrtcConnected ? webrtcState : (this.isRelayConnected ? 'connected' : 'connecting')
    
    let status = 'disconnected'
    if (effectivelyConnected) {
      status = 'connected'
    } else if (signalingConnected && this.currentRoomId) {
      status = 'connecting'
    }
    
    return {
      connected: effectivelyConnected,
      roomId: this.currentRoomId,
      connectionState: effectiveState,
      signaling: signalingConnected,
      status: status,
      isInitiator: this.isRoomInitiator
    }
  }

  private notifyMessageSent(message: any) {
    this.broadcastToUI('MESSAGE_SENT', message)
  }

  private notifyMessageReceived(message: any) {
    this.broadcastToUI('MESSAGE_RECEIVED', message)
  }

  private notifyConnectionStateChange(state: string) {
    this.broadcastToUI('CONNECTION_STATE_CHANGED', { state })
    
    // Also notify popup if connected
    if (this.popupPort) {
      this.popupPort.postMessage({
        type: 'CONNECTION_STATE_CHANGED',
        payload: { state }
      })
    }
  }

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