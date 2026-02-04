import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Mock window.desktopApi for tests
global.window = global.window || {}
global.window.desktopApi = {
  showNotification: vi.fn(),
  // Add other desktop API mocks as needed
}

// Mock getWindowId for Zustand store tests
vi.mock('./src/renderer/contexts/WindowContext', () => ({
  getWindowId: () => 'test-window',
  WindowContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}))
