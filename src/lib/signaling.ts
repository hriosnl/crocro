interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'room-created' | 'room-joined' | 'peer-joined' | 'peer-left' | 'peer-reconnected' | 'relay-message' | 'error'
  roomId?: string
  peerId?: string
  data?: any
}

export class SignalingClient {
  private ws: WebSocket | null = null
  private urls: string[]
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false
  private currentRoomId: string | null = null
  private keepAliveInterval: number | null = null

  onSignal: ((signal: SignalMessage) => void) | null = null
  onMessage: ((message: any) => void) | null = null
  onConnected: (() => void) | null = null
  onDisconnected: (() => void) | null = null
  onError: ((error: string) => void) | null = null

  constructor(url: string) {
    // For production deployments (no localhost), use the URL as-is
    // For localhost development, create fallback URLs
    if (url.includes('localhost')) {
      // Development mode - create fallback URLs with different ports
      if (url.startsWith('ws://')) {
        const baseUrl = url.replace('ws://', '').replace(':8080', '')
        this.urls = [
          `wss://${baseUrl}:8443`,
          `ws://${baseUrl}:8080`
        ]
      } else if (url.startsWith('wss://')) {
        const baseUrl = url.replace('wss://', '').replace(':8443', '')
        this.urls = [
          `wss://${baseUrl}:8443`,
          `ws://${baseUrl}:8080`
        ]
      } else {
        this.urls = [url]
      }
    } else {
      // Production mode - use the exact URL provided (hosting platform handles HTTPS/WSS)
      this.urls = [url]
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tryConnect(0, resolve, reject)
    })
  }

  private tryConnect(urlIndex: number, resolve: () => void, reject: (error: Error) => void): void {
    if (urlIndex >= this.urls.length) {
      const errorMessage = `Failed to connect to any WebSocket URL: ${this.urls.join(', ')}`
      this.onError?.(errorMessage)
      reject(new Error(errorMessage))
      return
    }

    const currentUrl = this.urls[urlIndex]
    console.log(`Trying to connect to: ${currentUrl}`)

    try {
      this.ws = new WebSocket(currentUrl)
      
      this.ws.onopen = () => {
        console.log(`Signaling client connected to: ${currentUrl}`)
        this.isConnected = true
        this.reconnectAttempts = 0
        this.startKeepAlive()
        this.onConnected?.()
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: SignalMessage = JSON.parse(event.data)
          this.handleSignalMessage(message)
        } catch (error) {
          console.error('Failed to parse signaling message:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('Signaling connection closed:', event.code, event.reason)
        this.isConnected = false
        this.onDisconnected?.()
        
        // Only reconnect if it wasn't a clean close and we have attempts left
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log('Connection closed unexpectedly, scheduling reconnect...')
          this.scheduleReconnect()
        } else if (event.wasClean) {
          console.log('Connection closed cleanly')
        } else {
          console.log('Max reconnect attempts reached')
        }
      }

      this.ws.onerror = (event) => {
        console.error(`WebSocket connection error for ${currentUrl}:`, event)
        
        // Try the next URL if available
        if (urlIndex + 1 < this.urls.length) {
          console.log(`Trying next URL fallback...`)
          this.tryConnect(urlIndex + 1, resolve, reject)
        } else {
          const errorMessage = `WebSocket connection failed to all URLs: ${this.urls.join(', ')}`
          this.onError?.(errorMessage)
          reject(new Error(errorMessage))
        }
      }

    } catch (error) {
      if (urlIndex + 1 < this.urls.length) {
        this.tryConnect(urlIndex + 1, resolve, reject)
      } else {
        reject(error instanceof Error ? error : new Error('Unknown error'))
      }
    }
  }

  disconnect(): void {
    this.stopKeepAlive()
    if (this.ws) {
      this.ws.close(1000, 'Normal closure')
      this.ws = null
    }
    this.isConnected = false
    this.currentRoomId = null
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAliveInterval = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping' })
      }
    }, 30000) // Ping every 30 seconds
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }

  async createRoom(manualRoomId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to signaling server'))
        return
      }

      const roomId = manualRoomId || this.generateRoomId()
      
      const createRoomHandler = (message: SignalMessage) => {
        if (message.type === 'room-created' && message.roomId === roomId) {
          this.currentRoomId = roomId
          this.removeSignalHandler(createRoomHandler)
          resolve(roomId)
        } else if (message.type === 'error' && message.roomId === roomId) {
          this.removeSignalHandler(createRoomHandler)
          reject(new Error(message.data?.message || 'Failed to create room'))
        }
      }

      this.addSignalHandler(createRoomHandler)
      
      this.sendMessage({
        type: 'create-room',
        roomId
      })
    })
  }

  async joinRoom(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to signaling server'))
        return
      }

      const joinRoomHandler = (message: SignalMessage) => {
        if (message.type === 'room-joined' && message.roomId === roomId) {
          this.currentRoomId = roomId
          this.removeSignalHandler(joinRoomHandler)
          resolve()
        } else if (message.type === 'error' && message.roomId === roomId) {
          this.removeSignalHandler(joinRoomHandler)
          reject(new Error(message.data?.message || 'Failed to join room'))
        }
      }

      this.addSignalHandler(joinRoomHandler)
      
      this.sendMessage({
        type: 'join-room',
        roomId
      })
    })
  }

  sendSignal(signal: any): void {
    if (!this.isConnected || !this.currentRoomId) {
      console.warn('Cannot send signal: not connected or no active room')
      return
    }

    this.sendMessage({
      type: 'signal',
      roomId: this.currentRoomId,
      data: signal
    })
  }

  sendRelayMessage(messageData: any): void {
    if (!this.isConnected || !this.currentRoomId) {
      console.warn('Cannot send relay message: not connected or no active room')
      return
    }

    this.sendMessage({
      type: 'relay-message',
      roomId: this.currentRoomId,
      data: messageData
    })
  }

  private handleSignalMessage(message: SignalMessage): void {
    console.log('Received signaling message:', message.type, message)
    
    switch (message.type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Forward the entire message as the signal (it contains sdp, candidate, etc.)
        this.onSignal?.(message)
        break
      
      case 'peer-joined':
        console.log('Peer joined room:', message.peerId)
        // Trigger WebRTC initialization when peer joins
        this.onSignal?.({ type: 'peer-joined', peerId: message.peerId })
        break
      
      case 'peer-left':
        console.log('Peer left room:', message.peerId)
        this.onSignal?.({ type: 'peer-left', peerId: message.peerId })
        break
      
      case 'peer-reconnected':
        console.log('Peer reconnected:', message.peerId)
        // Forward the entire peer-reconnected signal with all data
        this.onSignal?.(message)
        break
      
      case 'relay-message':
        console.log('Received relay message from peer:', message.peerId)
        // Handle relay messages from the signaling server
        this.onMessage?.(message.data)
        break
      
      default:
        this.signalHandlers.forEach(handler => handler(message))
    }
  }

  private signalHandlers: Set<(message: SignalMessage) => void> = new Set()

  private addSignalHandler(handler: (message: SignalMessage) => void): void {
    this.signalHandlers.add(handler)
  }

  private removeSignalHandler(handler: (message: SignalMessage) => void): void {
    this.signalHandlers.delete(handler)
  }

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('Cannot send message: WebSocket not open')
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('Reconnect failed:', error)
        })
      }
    }, delay)
  }

  private generateRoomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  getConnectionState(): 'connecting' | 'connected' | 'disconnected' {
    if (!this.ws) return 'disconnected'
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting'
      case WebSocket.OPEN:
        return 'connected'
      default:
        return 'disconnected'
    }
  }
}