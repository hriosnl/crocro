interface RTCConfig {
  stunServers: string[]
  turnServers: string[]
  turnUsername?: string
  turnPassword?: string
}

interface DataChannelMessage {
  type: 'message' | 'typing' | 'ack' | 'read-receipt'
  id?: string
  text?: string
  timestamp?: number
  isTyping?: boolean
}

export class RTCManager {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private config: RTCConfig
  private isInitiator = false
  private connectionState: RTCPeerConnectionState = 'new'

  onMessage: ((message: any) => void) | null = null
  onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null
  onSignal: ((signal: any) => void) | null = null

  constructor(config: RTCConfig) {
    this.config = config
  }

  async initialize(isInitiator = false): Promise<void> {
    console.log('RTCManager initializing, isInitiator:', isInitiator)
    this.isInitiator = isInitiator
    
    const iceServers = [
      ...this.config.stunServers.map(url => ({ urls: url })),
      ...this.config.turnServers.map(url => ({
        urls: url,
        username: this.config.turnUsername,
        credential: this.config.turnPassword
      }))
    ].filter(server => server.urls)

    console.log('ICE servers configured:', iceServers)

    this.peerConnection = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10
    })

    this.setupPeerConnectionEventHandlers()

    if (this.isInitiator) {
      console.log('Creating data channel and offer as initiator')
      this.createDataChannel()
      await this.createOffer()
    } else {
      console.log('Waiting for incoming offer as joiner')
    }
  }

  private setupPeerConnectionEventHandlers(): void {
    if (!this.peerConnection) return

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onSignal?.({
          type: 'ice-candidate',
          candidate: event.candidate
        })
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.connectionState = this.peerConnection.connectionState
        console.log('RTC connection state changed:', this.connectionState)
        this.onConnectionStateChange?.(this.connectionState)
      }
    }

    this.peerConnection.ondatachannel = (event) => {
      if (!this.isInitiator) {
        this.dataChannel = event.channel
        this.setupDataChannelEventHandlers()
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.peerConnection?.iceConnectionState)
    }

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', this.peerConnection?.iceGatheringState)
    }
  }

  private createDataChannel(): void {
    if (!this.peerConnection) return

    this.dataChannel = this.peerConnection.createDataChannel('chat', {
      ordered: true,
      maxRetransmits: 3
    })

    this.setupDataChannelEventHandlers()
  }

  private setupDataChannelEventHandlers(): void {
    if (!this.dataChannel) return

    this.dataChannel.onopen = () => {
      console.log('Data channel opened')
    }

    this.dataChannel.onclose = () => {
      console.log('Data channel closed')
    }

    this.dataChannel.onerror = (event) => {
      console.error('Data channel error:', event)
    }

    this.dataChannel.onmessage = (event) => {
      try {
        const message: DataChannelMessage = JSON.parse(event.data)
        this.handleDataChannelMessage(message)
      } catch (error) {
        console.error('Failed to parse data channel message:', error)
      }
    }
  }

  private handleDataChannelMessage(message: DataChannelMessage): void {
    switch (message.type) {
      case 'message':
        this.onMessage?.(message)
        this.sendAck(message.id!)
        break
      
      case 'typing':
        console.log('Peer typing status:', message.isTyping)
        break
      
      case 'ack':
        console.log('Message delivered:', message.id)
        break
      
      case 'read-receipt':
        console.log('Message read:', message.id)
        break
    }
  }

  private async createOffer(): Promise<void> {
    if (!this.peerConnection) return

    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)
    
    this.onSignal?.({
      type: 'offer',
      sdp: offer
    })
  }

  async handleSignal(signal: any): Promise<void> {
    console.log('RTCManager handling signal:', signal.type, signal)
    
    if (!this.peerConnection) {
      console.error('No peer connection available for handling signal')
      return
    }

    try {
      switch (signal.type) {
        case 'offer':
          console.log('Handling incoming offer')
          await this.handleOffer(signal.sdp || signal)
          break
        
        case 'answer':
          console.log('Handling incoming answer')
          await this.handleAnswer(signal.sdp || signal)
          break
        
        case 'ice-candidate':
          console.log('Handling ICE candidate')
          await this.handleIceCandidate(signal.candidate || signal)
          break
          
        default:
          console.warn('Unknown signal type:', signal.type)
      }
    } catch (error) {
      console.error('Error handling signal:', signal.type, error)
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return

    console.log('Setting remote description with offer:', offer)
    await this.peerConnection.setRemoteDescription(offer)
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)
    
    console.log('Sending answer:', answer)
    this.onSignal?.({
      type: 'answer',
      sdp: answer
    })
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return
    console.log('Setting remote description with answer:', answer)
    await this.peerConnection.setRemoteDescription(answer)
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return
    console.log('Adding ICE candidate:', candidate)
    await this.peerConnection.addIceCandidate(candidate)
  }

  async sendMessage(message: any): Promise<boolean> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('Data channel not ready for sending messages')
      return false
    }

    try {
      const dataChannelMessage: DataChannelMessage = {
        type: 'message',
        id: message.id,
        text: message.text,
        timestamp: message.timestamp
      }

      this.dataChannel.send(JSON.stringify(dataChannelMessage))
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      return false
    }
  }

  async sendTypingIndicator(isTyping: boolean): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }

    try {
      const message: DataChannelMessage = {
        type: 'typing',
        isTyping
      }
      this.dataChannel.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send typing indicator:', error)
    }
  }

  private sendAck(messageId: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }

    try {
      const message: DataChannelMessage = {
        type: 'ack',
        id: messageId
      }
      this.dataChannel.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send ack:', error)
    }
  }

  sendReadReceipt(messageId: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }

    try {
      const message: DataChannelMessage = {
        type: 'read-receipt',
        id: messageId
      }
      this.dataChannel.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send read receipt:', error)
    }
  }

  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open'
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.connectionState
  }

  getDataChannelState(): RTCDataChannelState | null {
    return this.dataChannel?.readyState || null
  }

  close(): void {
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }

    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    this.connectionState = 'closed'
  }
}