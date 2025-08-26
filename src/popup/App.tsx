import React, { useState, useEffect, useRef } from 'react'
import browser from 'webextension-polyfill'
import './App.css'

interface Message {
  id: string
  text: string
  timestamp: number
  from: 'self' | 'peer'
  delivered?: boolean
  read?: boolean
}

interface ConnectionStatus {
  connected: boolean
  roomId: string | null
  connectionState: string
  signaling?: boolean
  status?: string
  isInitiator?: boolean
}

const App: React.FC = () => {
  console.log('Crocro App component rendering')
  const [currentView, setCurrentView] = useState<'setup' | 'chat'>('setup')
  const [roomId, setRoomId] = useState('')
  const [inputRoomId, setInputRoomId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    roomId: null,
    connectionState: 'disconnected'
  })
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Get initial connection status
    getConnectionStatus()
    
    // Establish port connection for real-time updates
    const port = browser.runtime.connect({ name: 'popup' })
    
    // Set up periodic status checks to ensure UI stays in sync
    const statusInterval = setInterval(() => {
      getConnectionStatus()
    }, 2000) // Check every 2 seconds
    
    // Listen for port messages
    const portMessageListener = (message: any) => {
      switch (message.type) {
        case 'MESSAGE_RECEIVED':
          loadMessages()
          break
        case 'MESSAGE_SENT':
          loadMessages()
          break
        case 'CONNECTION_STATE_CHANGED':
          console.log('Received connection state change via port:', message.payload)
          updateConnectionStatus(message.payload.state)
          break
        case 'RTC_MESSAGE_RECEIVED':
          handleIncomingMessage(message.payload)
          break
        case 'RELAY_MESSAGE_RECEIVED':
          handleIncomingMessage(message.payload)
          break
        case 'PENDING_MESSAGE':
          handleIncomingMessage(message.payload)
          break
      }
    }
    
    port.onMessage.addListener(portMessageListener)
    
    // Also listen for background messages (fallback)
    const messageListener = (message: any) => {
      switch (message.type) {
        case 'MESSAGE_RECEIVED':
          loadMessages()
          break
        case 'MESSAGE_SENT':
          loadMessages()
          break
        case 'CONNECTION_STATE_CHANGED':
          console.log('Received connection state change:', message.payload)
          updateConnectionStatus(message.payload.state)
          break
        case 'RTC_MESSAGE_RECEIVED':
          handleIncomingMessage(message.payload)
          break
        case 'PENDING_MESSAGE':
          handleIncomingMessage(message.payload)
          break
      }
    }

    browser.runtime.onMessage.addListener(messageListener)
    
    return () => {
      clearInterval(statusInterval)
      port.disconnect()
      browser.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const getConnectionStatus = async () => {
    try {
      const response = await browser.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' })
      setConnectionStatus(response)
      
      if (response.roomId) {
        setRoomId(response.roomId)
        setCurrentView('chat')
        loadMessages()
        
        console.log('Reconnecting to existing room:', response.roomId, 'isInitiator:', response.isInitiator)
      }
    } catch (error) {
      console.error('Failed to get connection status:', error)
    }
  }

  const loadMessages = async () => {
    try {
      const response = await browser.runtime.sendMessage({ type: 'GET_MESSAGES' })
      if (response.messages) {
        setMessages(response.messages)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const handleIncomingMessage = async (message: any) => {
    console.log('Popup received message:', message)
    // Immediately refresh messages when receiving any message
    await loadMessages()
  }

  const updateConnectionStatus = (state: string) => {
    console.log('App: Updating connection status to:', state)
    setConnectionStatus(prev => ({
      ...prev,
      connected: state === 'connected',
      connectionState: state,
      status: state === 'connected' ? 'connected' : 
             state === 'connecting' ? 'connecting' :
             state === 'disconnected' || state === 'failed' ? 'disconnected' : state
    }))
  }

  const createRoom = async () => {
    setIsLoading(true)
    try {
      const response = await browser.runtime.sendMessage({ type: 'CREATE_ROOM' })
      if (response.roomId) {
        setRoomId(response.roomId)
        setCurrentView('chat')
        await loadMessages()
        
        console.log('Created room:', response.roomId, 'WebRTC handled by background')
      } else {
        alert('Failed to create room: ' + (response.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to create room:', error)
      alert('Failed to create room')
    } finally {
      setIsLoading(false)
    }
  }

  const joinRoom = async () => {
    if (!inputRoomId.trim()) {
      alert('Please enter a room code')
      return
    }

    setIsLoading(true)
    try {
      const response = await browser.runtime.sendMessage({ 
        type: 'JOIN_ROOM', 
        payload: { roomId: inputRoomId.trim().toUpperCase() }
      })
      
      if (response.success) {
        const roomIdToJoin = inputRoomId.trim().toUpperCase()
        setRoomId(roomIdToJoin)
        setCurrentView('chat')
        await loadMessages()
        
        console.log('Joined room:', roomIdToJoin, 'WebRTC handled by background')
      } else {
        alert('Failed to join room: ' + (response.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to join room:', error)
      alert('Failed to join room')
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!messageInput.trim()) return

    try {
      const response = await browser.runtime.sendMessage({ 
        type: 'SEND_MESSAGE', 
        payload: { text: messageInput.trim() }
      })
      
      if (response.success) {
        setMessageInput('')
        // Immediately refresh messages after successful send
        await loadMessages()
      } else {
        alert('Failed to send message: ' + (response.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    }
  }

  const leaveRoom = async () => {
    try {
      await browser.runtime.sendMessage({ type: 'LEAVE_ROOM' })
      setCurrentView('setup')
      setRoomId('')
      setInputRoomId('')
      setMessages([])
      setConnectionStatus({
        connected: false,
        roomId: null,
        connectionState: 'disconnected'
      })
    } catch (error) {
      console.error('Failed to leave room:', error)
    }
  }

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      // Could add a toast notification here
    })
  }

  // const copyShareLink = () => {
  //   const link = `${window.location.origin}/join/${roomId}`
  //   navigator.clipboard.writeText(link).then(() => {
  //     // Could add a toast notification here
  //   })
  // }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  if (currentView === 'setup') {
    return (
      <div className="app">
        <div className="header">
          <h1 className="title">Crocro Chat</h1>
          <p className="subtitle">Private messaging between friends</p>
        </div>

        <div className="setup-content">
          <div className="setup-section">
            <button 
              className="btn btn-primary btn-large"
              onClick={createRoom}
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create New Room'}
            </button>
          </div>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="setup-section">
            <input
              type="text"
              placeholder="Enter room code"
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
              className="input"
              maxLength={6}
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
            />
            <button 
              className="btn btn-secondary"
              onClick={joinRoom}
              disabled={isLoading || !inputRoomId.trim()}
            >
              {isLoading ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </div>

        <div className="footer">
          <p className="help-text">
            Create a room to get started, or enter a code to join an existing room.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="chat-header">
        <div className="room-info">
          <div className="room-id" onClick={copyRoomId} title="Click to copy">
            Room: {roomId}
          </div>
          <div className={`connection-status ${connectionStatus.connected ? 'connected' : 'disconnected'}`}>
            {connectionStatus.status === 'connected' ? 'Connected' : 
             connectionStatus.status === 'connecting' ? 'Connecting...' : 
             'Disconnected'}
          </div>
        </div>
        <button className="btn btn-small" onClick={leaveRoom}>
          Leave
        </button>
      </div>

      <div className="messages-container">
        <div className="messages">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`message ${message.from === 'self' ? 'message-self' : 'message-peer'}`}
            >
              <div className="message-content">
                {message.text}
              </div>
              <div className="message-meta">
                {formatTime(message.timestamp)}
                {message.from === 'self' && (
                  <span className="delivery-status">
                    {message.read ? '✓✓' : message.delivered ? '✓' : '⏱'}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="message-input-container">
        <input
          type="text"
          placeholder="Type a message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="message-input"
          disabled={!connectionStatus.connected}
        />
        <button 
          className="btn btn-primary"
          onClick={sendMessage}
          disabled={!messageInput.trim() || !connectionStatus.connected}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default App