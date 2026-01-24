import { safeStorage } from "electron"

export interface ClerkTokens {
  accessToken: string
  refreshToken: string
  userId: string
  email?: string
  name?: string
  imageUrl?: string
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
  userId: string
  email?: string
  name?: string
  imageUrl?: string
}

// Lazy load electron-store (ES Module)
let Store: any = null
let store: any = null

async function getStore() {
  if (!store) {
    if (!Store) {
      Store = (await import("electron-store")).default
    }
    store = new Store({
      name: "kcode-clerk-auth",
    })
  }
  return store
}

/**
 * Store authentication tokens securely using OS keychain/credential manager
 */
export async function storeClerkTokens(tokens: ClerkTokens): Promise<void> {
  console.log("[TokenStore] Storing tokens for user:", tokens.userId)

  const store = await getStore()

  if (safeStorage.isEncryptionAvailable()) {
    // Use OS keychain/credential manager (preferred)
    try {
      const encryptedAccess = safeStorage.encryptString(tokens.accessToken)
      const encryptedRefresh = safeStorage.encryptString(tokens.refreshToken)

      store.set("accessToken", encryptedAccess.toString("base64"))
      store.set("refreshToken", encryptedRefresh.toString("base64"))
      store.set("userId", tokens.userId)
      if (tokens.email) {
        store.set("email", tokens.email)
      }
      if (tokens.name) {
        store.set("name", tokens.name)
      }
      if (tokens.imageUrl) {
        store.set("imageUrl", tokens.imageUrl)
      }

      console.log("[TokenStore] Tokens stored with OS encryption")
    } catch (error) {
      console.error("[TokenStore] Failed to encrypt tokens:", error)
      // Fallback to electron-store encryption
      store.set("accessToken", tokens.accessToken)
      store.set("refreshToken", tokens.refreshToken)
      store.set("userId", tokens.userId)
      if (tokens.email) {
        store.set("email", tokens.email)
      }
      if (tokens.name) {
        store.set("name", tokens.name)
      }
      if (tokens.imageUrl) {
        store.set("imageUrl", tokens.imageUrl)
      }
      console.log("[TokenStore] Tokens stored with electron-store encryption")
    }
  } else {
    // Fallback to electron-store encryption
    store.set("accessToken", tokens.accessToken)
    store.set("refreshToken", tokens.refreshToken)
    store.set("userId", tokens.userId)
    if (tokens.email) {
      store.set("email", tokens.email)
    }
    if (tokens.name) {
      store.set("name", tokens.name)
    }
    if (tokens.imageUrl) {
      store.set("imageUrl", tokens.imageUrl)
    }
    console.log(
      "[TokenStore] Tokens stored with electron-store encryption (OS encryption not available)",
    )
  }
}

/**
 * Retrieve stored authentication tokens
 */
export async function getClerkTokens(): Promise<ClerkTokens | null> {
  try {
    const store = await getStore()
    const userId = store.get("userId")
    if (!userId) {
      console.log("[TokenStore] No tokens found")
      return null
    }

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const encryptedAccess = store.get("accessToken")
        const encryptedRefresh = store.get("refreshToken")

        if (!encryptedAccess || !encryptedRefresh) {
          console.log("[TokenStore] Incomplete token data")
          return null
        }

        const accessToken = safeStorage.decryptString(
          Buffer.from(encryptedAccess, "base64"),
        )
        const refreshToken = safeStorage.decryptString(
          Buffer.from(encryptedRefresh, "base64"),
        )

        console.log("[TokenStore] Tokens retrieved with OS decryption")
        return {
          accessToken,
          refreshToken,
          userId,
          email: store.get("email"),
          name: store.get("name"),
          imageUrl: store.get("imageUrl"),
        }
      } catch (error) {
        console.error("[TokenStore] Failed to decrypt tokens:", error)
        // Try fallback
        const accessToken = store.get("accessToken")
        const refreshToken = store.get("refreshToken")

        if (!accessToken || !refreshToken) {
          return null
        }

        console.log("[TokenStore] Tokens retrieved with electron-store")
        return {
          accessToken,
          refreshToken,
          userId,
          email: store.get("email"),
          name: store.get("name"),
          imageUrl: store.get("imageUrl"),
        }
      }
    } else {
      const accessToken = store.get("accessToken")
      const refreshToken = store.get("refreshToken")

      if (!accessToken || !refreshToken) {
        console.log("[TokenStore] Incomplete token data")
        return null
      }

      console.log("[TokenStore] Tokens retrieved with electron-store")
      return {
        accessToken,
        refreshToken,
        userId,
        email: store.get("email"),
        name: store.get("name"),
        imageUrl: store.get("imageUrl"),
      }
    }
  } catch (error) {
    console.error("[TokenStore] Failed to retrieve tokens:", error)
    return null
  }
}

/**
 * Clear all stored authentication tokens
 */
export async function clearClerkTokens(): Promise<void> {
  console.log("[TokenStore] Clearing all tokens")
  const store = await getStore()
  store.clear()
}

/**
 * Check if user is authenticated (has valid tokens stored)
 */
export async function hasStoredTokens(): Promise<boolean> {
  const store = await getStore()
  return store.get("userId") !== undefined
}
