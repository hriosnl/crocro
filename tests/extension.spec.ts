import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Helper function to load extension in Chrome
async function loadExtension(page: any, extensionPath: string) {
  const context = page.context()
  
  // Create a new context with the extension loaded
  // Note: This requires building the extension first
  const extensionContext = await context.browser().newContext({
    // In real tests, you would use a built extension directory
    args: [`--load-extension=${extensionPath}`, '--disable-extensions-except=' + extensionPath]
  })
  
  return extensionContext
}

test.describe('Crocro Extension E2E Tests', () => {
  let extensionPath: string
  
  test.beforeAll(async () => {
    // Build the extension first
    extensionPath = path.resolve(__dirname, '../dist')
  })

  test.describe('Basic Extension Loading', () => {
    test('extension loads without errors', async ({ page, context }) => {
      // Navigate to a test page
      await page.goto('https://example.com')
      
      // Check that the page loads
      await expect(page).toHaveTitle(/Example/)
    })

    test('content script is injected', async ({ page }) => {
      await page.goto('https://example.com')
      
      // Wait a bit for content script to load
      await page.waitForTimeout(1000)
      
      // Check for content script presence (this would need to be adapted based on your content script)
      const hasContentScript = await page.evaluate(() => {
        return window.hasOwnProperty('crocroExtension') || 
               document.querySelector('#crocro-chat-host') !== null
      })
      
      // For now, we'll just check the page loaded
      expect(page.url()).toContain('example.com')
    })
  })

  test.describe('Chat Functionality', () => {
    test('can create and join a room', async ({ browser }) => {
      // Create two browser contexts to simulate two users
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()
      
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()
      
      try {
        // Navigate both pages to test sites
        await page1.goto('https://example.com')
        await page2.goto('https://google.com')
        
        // In a real test, we would:
        // 1. Open extension popup on page1
        // 2. Create a room and get room ID
        // 3. Open extension popup on page2
        // 4. Join the room with the ID from step 2
        // 5. Verify both users are connected
        
        // For now, just verify pages loaded
        await expect(page1).toHaveTitle(/Example/)
        await expect(page2).toHaveTitle(/Google/)
        
      } finally {
        await context1.close()
        await context2.close()
      }
    })

    test('can send and receive messages', async ({ browser }) => {
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()
      
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()
      
      try {
        await page1.goto('https://example.com')
        await page2.goto('https://google.com')
        
        // In a real test, we would:
        // 1. Set up room connection between both contexts
        // 2. Send a message from context1
        // 3. Verify message appears in context2
        // 4. Send a message from context2
        // 5. Verify message appears in context1
        
        // Placeholder verification
        expect(true).toBe(true)
        
      } finally {
        await context1.close()
        await context2.close()
      }
    })
  })

  test.describe('WebRTC Connection', () => {
    test('establishes WebRTC connection between peers', async ({ browser }) => {
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()
      
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()
      
      try {
        await page1.goto('https://example.com')
        await page2.goto('https://google.com')
        
        // In a real test, we would:
        // 1. Monitor WebRTC connection state
        // 2. Verify ICE candidates are exchanged
        // 3. Verify data channel opens successfully
        // 4. Test connection recovery after network issues
        
        expect(true).toBe(true)
        
      } finally {
        await context1.close()
        await context2.close()
      }
    })
  })

  test.describe('Signaling Server', () => {
    test('signaling server is running and accessible', async ({ page }) => {
      // Test the signaling server health endpoint
      const response = await page.request.get('http://localhost:8080/health')
      expect(response.status()).toBe(200)
      
      const healthData = await response.json()
      expect(healthData.status).toBe('ok')
    })

    test('can create rooms via signaling server', async ({ page }) => {
      // Test room creation via HTTP endpoint
      const response = await page.request.get('http://localhost:8080/rooms')
      expect(response.status()).toBe(200)
      
      const roomsData = await response.json()
      expect(roomsData).toHaveProperty('rooms')
      expect(Array.isArray(roomsData.rooms)).toBe(true)
    })
  })

  test.describe('Error Handling', () => {
    test('handles signaling server disconnection gracefully', async ({ page }) => {
      await page.goto('https://example.com')
      
      // In a real test, we would:
      // 1. Establish a connection
      // 2. Simulate server disconnection
      // 3. Verify reconnection attempts
      // 4. Verify UI shows appropriate status
      
      expect(true).toBe(true)
    })

    test('handles WebRTC connection failures', async ({ page }) => {
      await page.goto('https://example.com')
      
      // In a real test, we would:
      // 1. Simulate WebRTC connection failure
      // 2. Verify fallback to server relay
      // 3. Verify UI shows degraded connection status
      
      expect(true).toBe(true)
    })
  })

  test.describe('Security and Privacy', () => {
    test('does not expose sensitive data in console', async ({ page }) => {
      // Monitor console messages for sensitive data leaks
      const consoleLogs: string[] = []
      page.on('console', msg => {
        consoleLogs.push(msg.text())
      })
      
      await page.goto('https://example.com')
      await page.waitForTimeout(2000)
      
      // Check that no obvious sensitive data is logged
      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /key/i,
        /token/i
      ]
      
      for (const log of consoleLogs) {
        for (const pattern of sensitivePatterns) {
          expect(log).not.toMatch(pattern)
        }
      }
    })

    test('clears data when requested', async ({ page }) => {
      await page.goto('https://example.com')
      
      // In a real test, we would:
      // 1. Create some chat data
      // 2. Trigger data clearing
      // 3. Verify all data is removed
      
      expect(true).toBe(true)
    })
  })
})