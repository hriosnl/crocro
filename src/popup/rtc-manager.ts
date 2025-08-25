import browser from 'webextension-polyfill'
import { RTCManager } from '../lib/rtc'

// RTCConfig interface moved to getConfig method

export class PopupRTCManager {
  private rtcManager: RTCManager | null = null
  private backgroundPort: browser.Runtime.Port
  private isInitiator = false
  // private _roomId: string | null = null

  onMessage: ((message: any) => void) | null = null
  onConnectionStateChange: ((state: string) => void) | null = null

  constructor() {
    console.log('PopupRTCManager constructor called')
    this.backgroundPort = browser.runtime.connect({ name: 'popup' })
    console.log('Background port connected:', this.backgroundPort)
    this.setupMessageHandling()
  }

  private setupMessageHandling() {
    console.log('Popup RTC setting up message handling')
    this.backgroundPort.onMessage.addListener((message) => {
      console.log('Popup RTC received from background:', message.type, message)
      
      switch (message.type) {
        case 'SIGNALING_MESSAGE':
          console.log('Processing signaling message:', message.payload)
          this.handleSignalingMessage(message.payload).catch(error => {
            console.error('Error handling signaling message:', error)
          })
          break
        
        case 'SEND_RTC_MESSAGE':
          this.sendRTCMessage(message.payload)
          break
        
        case 'SET_TYPING':
          this.setTyping(message.payload.isTyping)
          break
        
        case 'CLOSE_RTC_CONNECTION':
          this.closeConnection()
          break
        
        case 'RELAY_MESSAGE_RECEIVED':
          this.handleRelayMessage(message.payload)
          break
          
        default:
          console.log('Unknown message type from background:', message.type)
      }
    })
  }

  async initialize(_roomId: string, isInitiator: boolean) {
    // this._roomId = roomId
    this.isInitiator = isInitiator
    
    // Clean up existing connection if any
    if (this.rtcManager) {
      console.log('Cleaning up existing RTC manager')
      this.rtcManager.close()
      this.rtcManager = null
    }
    
    // Get RTC configuration and create new manager
    const config = this.getConfig()
    this.rtcManager = new RTCManager(config)
    this.setupRTCEventHandlers()

    // If we're the initiator, start WebRTC immediately to send offer
    if (this.isInitiator) {
      console.log('Initializing WebRTC as initiator (creator)')
      await this.rtcManager.initialize(true)
    }

    // Notify background that RTC manager is ready
    this.backgroundPort.postMessage({
      type: 'RTC_READY'
    })

    console.log('Popup RTC manager initialized, waiting for peer...')
  }

  private async handleSignalingMessage(signal: any) {
    console.log('Popup RTC handling signaling message:', signal.type, signal)
    
    if (signal.type === 'peer-joined') {
      console.log('Peer joined, starting WebRTC as initiator:', this.isInitiator)
      // Start WebRTC connection when peer joins (only for initiator)
      if (this.isInitiator) {
        setTimeout(() => {
          if (this.rtcManager) {
            console.log('Initializing WebRTC as initiator:', this.isInitiator)
            this.rtcManager.initialize(this.isInitiator)
          } else {
            console.error('RTC manager not available for initialization')
          }
        }, 100)
      }
    } else if (signal.type === 'peer-reconnected') {
      console.log('Peer reconnected, signal data:', signal)
      const peerWasInitiator = signal.isInitiator
      
      // If the peer that reconnected was not the initiator (joiner reconnected), 
      // and we are the initiator, we should reinitialize to send a fresh offer
      if (peerWasInitiator === false && this.isInitiator) {
        console.log('Joiner reconnected, re-initializing WebRTC as initiator')
        setTimeout(() => {
          if (this.rtcManager) {
            console.log('Re-initializing WebRTC after joiner reconnection, isInitiator:', this.isInitiator)
            this.rtcManager.initialize(this.isInitiator)
          } else {
            console.error('RTC manager not available for reconnection')
          }
        }, 100)
      } else if (peerWasInitiator === true && !this.isInitiator) {
        // Creator reconnected, we are the joiner - just wait for their fresh offer
        console.log('Creator reconnected, waiting for new offer as joiner')
      }
    } else if (signal.type === 'offer') {
      console.log('Received offer signal, rtcManager exists:', !!this.rtcManager)
      console.log('Current connection state:', this.rtcManager?.getConnectionState())
      
      // Initialize WebRTC for joiner when offer arrives
      if (!this.rtcManager) {
        console.log('Creating new RTCManager for joiner')
        this.rtcManager = new RTCManager(this.getConfig())
        this.setupRTCEventHandlers()
        await this.rtcManager.initialize(false) // false = not initiator
      } else {
        // RTCManager exists but check if WebRTC peer connection is initialized
        const currentState = this.rtcManager.getConnectionState()
        console.log('RTCManager exists with state:', currentState)
        
        if (currentState === 'new' || currentState === 'closed' || currentState === 'disconnected') {
          console.log('Re-initializing RTCManager as joiner')
          await this.rtcManager.initialize(false)
        }
      }
      
      // Forward offer to RTC manager
      console.log('Forwarding offer to RTC manager, state is now:', this.rtcManager.getConnectionState())
      await this.rtcManager.handleSignal(signal)
    } else {
      // Forward other WebRTC signals to RTC manager
      if (this.rtcManager) {
        console.log('Forwarding signal to RTC manager:', signal.type)
        this.rtcManager.handleSignal(signal)
      } else {
        console.warn('RTC manager not available, cannot handle signal:', signal.type)
      }
    }
  }

  private async sendRTCMessage(message: any): Promise<boolean> {
    if (this.rtcManager) {
      const success = await this.rtcManager.sendMessage(message)
      if (!success) {
        // WebRTC failed, notify background to use signaling server relay
        console.log('WebRTC send failed, requesting fallback to signaling server relay')
        this.backgroundPort.postMessage({
          type: 'RTC_SEND_FAILED',
          payload: message
        })
      }
      return success
    }
    return false
  }

  private async setTyping(isTyping: boolean) {
    if (this.rtcManager) {
      await this.rtcManager.sendTypingIndicator(isTyping)
    }
  }

  private handleIncomingMessage(message: any) {
    console.log('Received WebRTC message:', message)
    
    // Forward to background for storage
    this.backgroundPort.postMessage({
      type: 'SAVE_INCOMING_MESSAGE',
      payload: message
    })
    
    // Also notify the UI directly
    this.onMessage?.(message)
  }

  private handleRelayMessage(message: any) {
    console.log('Received relay message from signaling server:', message)
    this.onMessage?.(message)
  }

  private closeConnection() {
    if (this.rtcManager) {
      this.rtcManager.close()
      this.rtcManager = null
    }
  }

  private getConfig() {
    // Get RTC configuration (same as in initialize method)
    const stunServers = JSON.parse(import.meta.env.VITE_STUNS || '[\"stun:stun.l.google.com:19302\"]')
    const turnServers = JSON.parse(import.meta.env.VITE_TURNS || '[]')
    
    return {
      stunServers,
      turnServers,
      turnUsername: import.meta.env.VITE_TURN_USERNAME,
      turnPassword: import.meta.env.VITE_TURN_PASSWORD
    }
  }

  private setupRTCEventHandlers() {
    if (!this.rtcManager) return

    // Set up event handlers
    this.rtcManager.onMessage = (message) => {
      this.handleIncomingMessage(message)
    }

    this.rtcManager.onConnectionStateChange = (state) => {
      console.log('RTC connection state changed:', state)
      this.onConnectionStateChange?.(state)
    }

    this.rtcManager.onSignal = (signal) => {
      // Send signal to background for forwarding to signaling server
      this.backgroundPort.postMessage({
        type: 'RTC_SIGNAL',
        payload: signal
      })
    }
  }

  isConnected(): boolean {
    return !!this.rtcManager?.isConnected()
  }

  getConnectionState(): string {
    return this.rtcManager?.getConnectionState() || 'disconnected'
  }

  disconnect() {
    this.closeConnection()
    this.backgroundPort.disconnect()
  }
}