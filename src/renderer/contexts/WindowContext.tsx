import { createContext, useContext, useMemo } from "react"

const WindowContext = createContext<string>("default")

export function WindowProvider({ children }: { children: React.ReactNode }) {
  const windowId = useMemo(() => {
    return getWindowId()
  }, [])

  return (
    <WindowContext.Provider value={windowId}>
      {children}
    </WindowContext.Provider>
  )
}

export function useWindowId(): string {
  return useContext(WindowContext)
}

// Global getter for use outside React (in atom definitions)
// This is cached after first call for the lifetime of the window
let globalWindowId: string | null = null

/**
 * Get the unique window ID for this Electron window.
 * Can be called outside of React components (e.g., in atom definitions).
 *
 * Priority:
 * 1. URL query param (dev mode): ?windowId=1
 * 2. URL hash param (production): #windowId=1
 * 3. sessionStorage fallback (generates unique ID per tab/window)
 */
export function getWindowId(): string {
  if (globalWindowId) return globalWindowId

  // Try URL params first (dev mode)
  const urlParams = new URLSearchParams(window.location.search)
  let id = urlParams.get("windowId")

  // Try hash params (production file:// URLs)
  if (!id && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    id = hashParams.get("windowId")
  }

  // Fallback: use sessionStorage to preserve ID across page refresh
  // This handles cases like page refresh where URL params may be lost
  if (!id) {
    id = sessionStorage.getItem("windowId")
    if (!id) {
      // Default to "main" - this is the expected ID for the primary window
      // Using a stable default prevents orphan localStorage keys
      id = "main"
      sessionStorage.setItem("windowId", id)
    }
  } else {
    // Store the ID in sessionStorage so it persists across navigation/refresh
    sessionStorage.setItem("windowId", id)
  }

  globalWindowId = id
  return id
}

/**
 * Get initial window params (chatId, subChatId) passed when opening a new window.
 * These are one-time use - cleared from sessionStorage after first read.
 */
export function getInitialWindowParams(): { chatId?: string; subChatId?: string } {
  // Check if already consumed
  const consumed = sessionStorage.getItem("windowParamsConsumed")
  if (consumed) return {}

  // Try URL params first (dev mode)
  const urlParams = new URLSearchParams(window.location.search)
  let chatId = urlParams.get("chatId")
  let subChatId = urlParams.get("subChatId")

  // Try hash params (production file:// URLs)
  if (!chatId && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    chatId = hashParams.get("chatId")
    subChatId = hashParams.get("subChatId")
  }

  // Mark as consumed so we don't re-apply on hot reload
  if (chatId || subChatId) {
    sessionStorage.setItem("windowParamsConsumed", "true")
  }

  return {
    chatId: chatId || undefined,
    subChatId: subChatId || undefined,
  }
}
