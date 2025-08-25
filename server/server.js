import WebSocket, { WebSocketServer } from 'ws'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'

const app = express()
const server = createServer(app)

app.use(cors())
app.use(express.json())

// In-memory storage for rooms and connections
const rooms = new Map() // roomId -> { clients: Set<WebSocket>, createdAt: Date }
const clients = new Map() // WebSocket -> { roomId: string, peerId: string }

const wss = new WebSocketServer({ 
  server,
  path: '/'
})

// Room management
class RoomManager {
  static createRoom(roomId) {
    if (rooms.has(roomId)) {
      return false
    }
    
    rooms.set(roomId, {
      clients: new Set(),
      createdAt: new Date(),
      messageHistory: []
    })
    
    console.log(`Room created: ${roomId}`)
    return true
  }
  
  static joinRoom(ws, roomId, peerId) {
    const room = rooms.get(roomId)
    if (!room) {
      return false
    }
    
    // Limit to 2 clients per room
    if (room.clients.size >= 2) {
      return false
    }
    
    room.clients.add(ws)
    clients.set(ws, { roomId, peerId })
    
    // Notify other clients in the room
    this.broadcastToRoom(roomId, {
      type: 'peer-joined',
      roomId,
      peerId
    }, ws)
    
    console.log(`Client ${peerId} joined room: ${roomId}`)
    return true
  }
  
  static leaveRoom(ws) {
    const clientInfo = clients.get(ws)
    if (!clientInfo) return
    
    const { roomId, peerId } = clientInfo
    const room = rooms.get(roomId)
    
    if (room) {
      room.clients.delete(ws)
      
      // Notify other clients
      this.broadcastToRoom(roomId, {
        type: 'peer-left',
        roomId,
        peerId
      }, ws)
      
      // Clean up empty rooms
      if (room.clients.size === 0) {
        rooms.delete(roomId)
        console.log(`Room deleted: ${roomId}`)
      }
    }
    
    clients.delete(ws)
    console.log(`Client ${peerId} left room: ${roomId}`)
  }
  
  static broadcastToRoom(roomId, message, excludeWs = null) {
    const room = rooms.get(roomId)
    if (!room) return
    
    const messageStr = JSON.stringify(message)
    
    room.clients.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(messageStr)
      }
    })
  }
  
  static getRoomInfo(roomId) {
    const room = rooms.get(roomId)
    if (!room) return null
    
    return {
      roomId,
      clientCount: room.clients.size,
      createdAt: room.createdAt
    }
  }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const peerId = generatePeerId()
  console.log(`New WebSocket connection: ${peerId}`)
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      handleMessage(ws, message, peerId)
    } catch (error) {
      console.error('Failed to parse message:', error)
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' }
      }))
    }
  })
  
  ws.on('close', () => {
    console.log(`WebSocket connection closed: ${peerId}`)
    RoomManager.leaveRoom(ws)
  })
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${peerId}:`, error)
    RoomManager.leaveRoom(ws)
  })
  
  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    peerId
  }))
})

function handleMessage(ws, message, peerId) {
  console.log(`Message from ${peerId}:`, message.type)
  
  switch (message.type) {
    case 'create-room':
      handleCreateRoom(ws, message, peerId)
      break
      
    case 'join-room':
      handleJoinRoom(ws, message, peerId)
      break
      
    case 'signal':
      handleSignal(ws, message, peerId)
      break
      
    case 'relay-message':
      handleRelayMessage(ws, message, peerId)
      break
      
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))
      break
      
    default:
      console.warn(`Unknown message type: ${message.type}`)
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Unknown message type' }
      }))
  }
}

function handleCreateRoom(ws, message, peerId) {
  const roomId = message.roomId || generateRoomId()
  
  if (RoomManager.createRoom(roomId)) {
    if (RoomManager.joinRoom(ws, roomId, peerId)) {
      ws.send(JSON.stringify({
        type: 'room-created',
        roomId
      }))
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        roomId,
        data: { message: 'Failed to join created room' }
      }))
    }
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      roomId,
      data: { message: 'Room already exists' }
    }))
  }
}

function handleJoinRoom(ws, message, peerId) {
  const { roomId } = message
  
  if (!roomId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Room ID required' }
    }))
    return
  }
  
  if (RoomManager.joinRoom(ws, roomId, peerId)) {
    ws.send(JSON.stringify({
      type: 'room-joined',
      roomId
    }))
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      roomId,
      data: { message: 'Failed to join room (room not found or full)' }
    }))
  }
}

function handleSignal(ws, message, peerId) {
  const clientInfo = clients.get(ws)
  if (!clientInfo) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Not in a room' }
    }))
    return
  }
  
  const { roomId } = clientInfo
  
  // Forward the signal exactly as received from the data field
  const signalData = message.data
  const signalMessage = {
    type: signalData.type,
    roomId,
    peerId,
    ...signalData  // Spread the signal data (sdp, candidate, etc.)
  }
  
  // Relay signal to other clients in the room
  RoomManager.broadcastToRoom(roomId, signalMessage, ws)
}

function handleRelayMessage(ws, message, peerId) {
  const clientInfo = clients.get(ws)
  if (!clientInfo) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Not in a room' }
    }))
    return
  }
  
  const { roomId } = clientInfo
  const room = rooms.get(roomId)
  
  if (room) {
    // Store message in room history (optional, for debugging)
    room.messageHistory.push({
      peerId,
      message: message.data,
      timestamp: Date.now()
    })
    
    // Relay to other clients
    RoomManager.broadcastToRoom(roomId, {
      type: 'relay-message',
      roomId,
      peerId,
      data: message.data
    }, ws)
  }
}

// HTTP endpoints for room management and health checks
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    connections: clients.size,
    uptime: process.uptime()
  })
})

app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    clientCount: room.clients.size,
    createdAt: room.createdAt
  }))
  
  res.json({ rooms: roomList })
})

app.get('/rooms/:roomId', (req, res) => {
  const roomInfo = RoomManager.getRoomInfo(req.params.roomId)
  if (roomInfo) {
    res.json(roomInfo)
  } else {
    res.status(404).json({ error: 'Room not found' })
  }
})

// Utility functions
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function generatePeerId() {
  return Math.random().toString(36).substr(2, 9)
}

// Cleanup old rooms periodically
setInterval(() => {
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24 hours
  
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt.getTime() > maxAge && room.clients.size === 0) {
      rooms.delete(roomId)
      console.log(`Cleaned up old room: ${roomId}`)
    }
  }
}, 60 * 60 * 1000) // Run every hour

const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`Crocro signaling server running on port ${PORT}`)
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})