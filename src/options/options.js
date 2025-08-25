import browser from 'webextension-polyfill'

class OptionsManager {
  constructor() {
    this.initializeOptions()
  }

  async initializeOptions() {
    await this.loadSettings()
    this.attachEventListeners()
    console.log('Options page initialized')
  }

  async loadSettings() {
    try {
      const settings = await browser.storage.local.get({
        displayName: '',
        signalingUrl: '',
        stunServers: 'stun:stun.l.google.com:19302',
        turnServers: '',
        turnUsername: '',
        turnPassword: '',
        notificationsEnabled: true,
        clearOnClose: false
      })

      // Populate form fields
      document.getElementById('display-name').value = settings.displayName || ''
      document.getElementById('signaling-url').value = settings.signalingUrl || ''
      document.getElementById('stun-servers').value = settings.stunServers || ''
      document.getElementById('turn-servers').value = settings.turnServers || ''
      document.getElementById('turn-username').value = settings.turnUsername || ''
      document.getElementById('turn-password').value = settings.turnPassword || ''
      document.getElementById('notifications-enabled').checked = settings.notificationsEnabled
      document.getElementById('clear-on-close').checked = settings.clearOnClose

      console.log('Settings loaded:', settings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      this.showStatusMessage('Failed to load settings', 'error')
    }
  }

  attachEventListeners() {
    const saveBtn = document.getElementById('save-btn')
    const resetBtn = document.getElementById('reset-btn')

    saveBtn.addEventListener('click', () => this.saveSettings())
    resetBtn.addEventListener('click', () => this.resetSettings())

    // Auto-save on certain fields
    const autoSaveFields = ['display-name', 'notifications-enabled', 'clear-on-close']
    autoSaveFields.forEach(fieldId => {
      const field = document.getElementById(fieldId)
      if (field) {
        field.addEventListener('change', () => {
          // Debounce auto-save
          clearTimeout(this.autoSaveTimeout)
          this.autoSaveTimeout = setTimeout(() => {
            this.saveSettings(true)
          }, 1000)
        })
      }
    })
  }

  async saveSettings(isAutoSave = false) {
    try {
      const settings = {
        displayName: document.getElementById('display-name').value.trim(),
        signalingUrl: document.getElementById('signaling-url').value.trim(),
        stunServers: document.getElementById('stun-servers').value.trim(),
        turnServers: document.getElementById('turn-servers').value.trim(),
        turnUsername: document.getElementById('turn-username').value.trim(),
        turnPassword: document.getElementById('turn-password').value.trim(),
        notificationsEnabled: document.getElementById('notifications-enabled').checked,
        clearOnClose: document.getElementById('clear-on-close').checked
      }

      // Validate settings
      const validation = this.validateSettings(settings)
      if (!validation.valid) {
        this.showStatusMessage(validation.error, 'error')
        return
      }

      await browser.storage.local.set(settings)
      
      if (!isAutoSave) {
        this.showStatusMessage('Settings saved successfully!', 'success')
      }

      // Request notification permission if enabled
      if (settings.notificationsEnabled && 'Notification' in window) {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          console.warn('Notification permission denied')
        }
      }

      console.log('Settings saved:', settings)
    } catch (error) {
      console.error('Failed to save settings:', error)
      this.showStatusMessage('Failed to save settings', 'error')
    }
  }

  validateSettings(settings) {
    // Validate signaling URL
    if (settings.signalingUrl) {
      try {
        const url = new URL(settings.signalingUrl)
        if (!['ws:', 'wss:'].includes(url.protocol)) {
          return { valid: false, error: 'Signaling URL must use ws:// or wss:// protocol' }
        }
      } catch (error) {
        return { valid: false, error: 'Invalid signaling URL format' }
      }
    }

    // Validate STUN servers
    if (settings.stunServers) {
      const stunList = settings.stunServers.split(',').map(s => s.trim())
      for (const stun of stunList) {
        if (stun && !stun.startsWith('stun:')) {
          return { valid: false, error: 'STUN servers must start with "stun:"' }
        }
      }
    }

    // Validate TURN servers
    if (settings.turnServers) {
      const turnList = settings.turnServers.split(',').map(s => s.trim())
      for (const turn of turnList) {
        if (turn && !turn.startsWith('turn:') && !turn.startsWith('turns:')) {
          return { valid: false, error: 'TURN servers must start with "turn:" or "turns:"' }
        }
      }
    }

    // Validate display name
    if (settings.displayName && settings.displayName.length > 50) {
      return { valid: false, error: 'Display name must be 50 characters or less' }
    }

    return { valid: true }
  }

  async resetSettings() {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
      return
    }

    try {
      await browser.storage.local.clear()
      await this.loadSettings()
      this.showStatusMessage('Settings reset to defaults', 'success')
      console.log('Settings reset to defaults')
    } catch (error) {
      console.error('Failed to reset settings:', error)
      this.showStatusMessage('Failed to reset settings', 'error')
    }
  }

  showStatusMessage(message, type = 'success') {
    const statusElement = document.getElementById('status-message')
    
    statusElement.textContent = message
    statusElement.className = `status-message status-${type}`
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusElement.className = 'status-message hidden'
    }, 3000)
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager()
})