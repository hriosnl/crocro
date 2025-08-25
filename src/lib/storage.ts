interface Message {
  id: string
  roomId: string
  text: string
  timestamp: number
  from: 'self' | 'peer'
  delivered?: boolean
  read?: boolean
}

interface Session {
  roomId: string
  createdAt: number
  type: 'creator' | 'joiner'
  peerDisplayName?: string
}

interface Profile {
  id: string
  displayName: string
  avatar?: string
  color?: string
}

export class StorageManager {
  private db: IDBDatabase | null = null
  private readonly dbName = 'CrocroChat'
  private readonly dbVersion = 1

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' })
          messageStore.createIndex('roomId', 'roomId', { unique: false })
          messageStore.createIndex('timestamp', 'timestamp', { unique: false })
        }
        
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'roomId' })
          sessionStore.createIndex('createdAt', 'createdAt', { unique: false })
        }
        
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' })
        }
      }
    })
  }

  async saveMessage(message: Message): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite')
      const store = transaction.objectStore('messages')
      
      const request = store.put(message)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getMessages(roomId: string, limit = 100): Promise<Message[]> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly')
      const store = transaction.objectStore('messages')
      const index = store.index('roomId')
      
      const request = index.getAll(roomId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const messages = request.result
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-limit)
        resolve(messages)
      }
    })
  }

  async updateMessageStatus(messageId: string, updates: Partial<Message>): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite')
      const store = transaction.objectStore('messages')
      
      const getRequest = store.get(messageId)
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const message = getRequest.result
        if (message) {
          Object.assign(message, updates)
          const putRequest = store.put(message)
          putRequest.onerror = () => reject(putRequest.error)
          putRequest.onsuccess = () => resolve()
        } else {
          reject(new Error('Message not found'))
        }
      }
    })
  }

  async saveSession(session: Session): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite')
      const store = transaction.objectStore('sessions')
      
      const request = store.put(session)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getSession(roomId: string): Promise<Session | null> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly')
      const store = transaction.objectStore('sessions')
      
      const request = store.get(roomId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async getAllSessions(): Promise<Session[]> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly')
      const store = transaction.objectStore('sessions')
      const index = store.index('createdAt')
      
      const request = index.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const sessions = request.result.sort((a, b) => b.createdAt - a.createdAt)
        resolve(sessions)
      }
    })
  }

  async deleteSession(roomId: string): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'messages'], 'readwrite')
      
      const sessionStore = transaction.objectStore('sessions')
      const messageStore = transaction.objectStore('messages')
      const messageIndex = messageStore.index('roomId')
      
      sessionStore.delete(roomId)
      
      const messageRequest = messageIndex.getAll(roomId)
      messageRequest.onsuccess = () => {
        const messages = messageRequest.result
        messages.forEach(message => {
          messageStore.delete(message.id)
        })
      }
      
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
  }

  async saveProfile(profile: Profile): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['profiles'], 'readwrite')
      const store = transaction.objectStore('profiles')
      
      const request = store.put(profile)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getProfile(id: string): Promise<Profile | null> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['profiles'], 'readonly')
      const store = transaction.objectStore('profiles')
      
      const request = store.get(id)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async clearAllData(): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages', 'sessions', 'profiles'], 'readwrite')
      
      const messageStore = transaction.objectStore('messages')
      const sessionStore = transaction.objectStore('sessions')
      const profileStore = transaction.objectStore('profiles')
      
      messageStore.clear()
      sessionStore.clear()
      profileStore.clear()
      
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export type { Message, Session, Profile }