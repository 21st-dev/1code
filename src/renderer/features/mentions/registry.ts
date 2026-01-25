/**
 * Mention Provider Registry
 *
 * Central registry for all mention providers.
 * Similar to VS Code's extension registration pattern.
 *
 * Features:
 * - Register/unregister providers dynamically
 * - Query providers by trigger character
 * - Reactive updates via Jotai atoms
 * - Automatic lifecycle management (activate/deactivate)
 */

import { atom, useAtomValue } from "jotai"
import { useEffect, useState, useMemo } from "react"
import type { MentionProvider, MentionProviderId } from "./types"

/**
 * Listener type for registry changes
 */
type RegistryListener = () => void

/**
 * Provider Registry class - manages all registered providers
 */
class MentionProviderRegistry {
  private providers = new Map<MentionProviderId, MentionProvider>()
  private listeners = new Set<RegistryListener>()
  private activationPromises = new Map<MentionProviderId, Promise<void>>()

  // Memoization for preventing re-renders
  private cachedProviders: MentionProvider[] | null = null
  private cachedByTrigger = new Map<string, MentionProvider[]>()
  private cachedCategories: Array<{ id: string; label: string; priority: number }> | null = null
  private cacheVersion = 0

  /**
   * Register a provider
   *
   * @param provider - Provider to register
   * @returns Unregister function
   */
  register(provider: MentionProvider): () => void {
    if (this.providers.has(provider.id)) {
      console.warn(
        `[MentionRegistry] Provider "${provider.id}" already registered, replacing`
      )
      // Deactivate existing provider
      const existing = this.providers.get(provider.id)
      existing?.deactivate?.()
    }

    this.providers.set(provider.id, provider)

    // Activate provider asynchronously
    if (provider.activate) {
      const activationPromise = provider.activate().catch((error) => {
        console.error(
          `[MentionRegistry] Failed to activate provider "${provider.id}":`,
          error
        )
      })
      this.activationPromises.set(provider.id, activationPromise)
    }

    this.notifyListeners()

    // Return unregister function
    return () => this.unregister(provider.id)
  }

  /**
   * Register multiple providers at once
   */
  registerAll(providers: MentionProvider[]): () => void {
    const unregisterFns = providers.map((p) => this.register(p))
    return () => unregisterFns.forEach((fn) => fn())
  }

  /**
   * Unregister a provider by ID
   */
  unregister(id: MentionProviderId): void {
    const provider = this.providers.get(id)
    if (provider) {
      provider.deactivate?.()
      this.providers.delete(id)
      this.activationPromises.delete(id)
      this.notifyListeners()
    }
  }

  /**
   * Get all registered providers sorted by priority
   * Returns cached array to prevent re-renders
   */
  getAll(): MentionProvider[] {
    if (this.cachedProviders !== null) {
      return this.cachedProviders
    }

    this.cachedProviders = Array.from(this.providers.values()).sort(
      (a, b) => b.priority - a.priority
    )
    return this.cachedProviders
  }

  /**
   * Get providers by trigger character
   * Returns cached array to prevent re-renders
   */
  getByTrigger(char: string): MentionProvider[] {
    const cached = this.cachedByTrigger.get(char)
    if (cached !== undefined) {
      return cached
    }

    const result = this.getAll().filter((p) => p.trigger.char === char)
    this.cachedByTrigger.set(char, result)
    return result
  }

  /**
   * Get provider by ID
   */
  get(id: MentionProviderId): MentionProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * Check if a provider is registered
   */
  has(id: MentionProviderId): boolean {
    return this.providers.has(id)
  }

  /**
   * Get available providers for a context
   */
  getAvailable(context: {
    projectPath?: string
    sessionId?: string
  }): MentionProvider[] {
    return this.getAll().filter(
      (p) => p.isAvailable?.(context) ?? true
    )
  }

  /**
   * Get unique trigger characters from all providers
   */
  getTriggers(): string[] {
    const triggers = new Set<string>()
    Array.from(this.providers.values()).forEach((provider) => {
      triggers.add(provider.trigger.char)
    })
    return Array.from(triggers)
  }

  /**
   * Get categories from all providers (deduplicated)
   * Returns cached array to prevent re-renders
   */
  getCategories(): Array<{ id: string; label: string; priority: number }> {
    if (this.cachedCategories !== null) {
      return this.cachedCategories
    }

    const categories = new Map<
      string,
      { id: string; label: string; priority: number }
    >()

    Array.from(this.providers.values()).forEach((provider) => {
      if (!categories.has(provider.category.id)) {
        categories.set(provider.category.id, {
          id: provider.category.id,
          label: provider.category.label,
          priority: provider.category.priority,
        })
      }
    })

    this.cachedCategories = Array.from(categories.values()).sort(
      (a, b) => b.priority - a.priority
    )
    return this.cachedCategories
  }

  /**
   * Wait for all providers to be activated
   */
  async waitForActivation(): Promise<void> {
    await Promise.all(Array.from(this.activationPromises.values()))
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Clear all providers (for testing)
   */
  clear(): void {
    Array.from(this.providers.values()).forEach((provider) => {
      provider.deactivate?.()
    })
    this.providers.clear()
    this.activationPromises.clear()
    this.notifyListeners()
  }

  /**
   * Invalidate all caches (called when providers change)
   */
  private invalidateCache(): void {
    this.cachedProviders = null
    this.cachedByTrigger.clear()
    this.cachedCategories = null
    this.cacheVersion++
  }

  private notifyListeners(): void {
    // Invalidate cache before notifying listeners
    this.invalidateCache()

    Array.from(this.listeners).forEach((listener) => {
      try {
        listener()
      } catch (error) {
        console.error("[MentionRegistry] Listener error:", error)
      }
    })
  }
}

/**
 * Singleton registry instance
 */
export const mentionRegistry = new MentionProviderRegistry()

/**
 * Jotai atom for reactive provider list
 * Updates automatically when registry changes
 */
export const mentionProvidersAtom = atom<MentionProvider[]>([])

/**
 * Internal atom to track registry version
 */
const registryVersionAtom = atom(0)

/**
 * Writable atom that syncs with registry
 */
export const syncedMentionProvidersAtom = atom(
  (get) => {
    // Subscribe to version changes
    get(registryVersionAtom)
    return mentionRegistry.getAll()
  },
  (_, set) => {
    // Increment version to trigger re-read
    set(registryVersionAtom, (v) => v + 1)
  }
)

/**
 * Hook to get all providers (reactive)
 */
export function useMentionProviders(): MentionProvider[] {
  const [providers, setProviders] = useState(() => mentionRegistry.getAll())

  useEffect(() => {
    return mentionRegistry.subscribe(() => {
      setProviders(mentionRegistry.getAll())
    })
  }, [])

  return providers
}

/**
 * Hook to get providers by trigger (reactive)
 */
export function useMentionProvidersByTrigger(
  trigger: string
): MentionProvider[] {
  const [providers, setProviders] = useState(() =>
    mentionRegistry.getByTrigger(trigger)
  )

  useEffect(() => {
    return mentionRegistry.subscribe(() => {
      setProviders(mentionRegistry.getByTrigger(trigger))
    })
  }, [trigger])

  return providers
}

/**
 * Hook to get available providers for context (reactive)
 */
export function useAvailableMentionProviders(context: {
  projectPath?: string
  sessionId?: string
}): MentionProvider[] {
  const providers = useMentionProviders()

  return providers.filter((p) => p.isAvailable?.(context) ?? true)
}

/**
 * Hook to get categories (reactive)
 */
export function useMentionCategories(): Array<{
  id: string
  label: string
  priority: number
}> {
  const [categories, setCategories] = useState(() =>
    mentionRegistry.getCategories()
  )

  useEffect(() => {
    return mentionRegistry.subscribe(() => {
      setCategories(mentionRegistry.getCategories())
    })
  }, [])

  return categories
}

/**
 * Hook to get a specific provider by ID
 * Uses memoized atom to prevent re-subscriptions on every render
 */
export function useMentionProvider(
  id: MentionProviderId
): MentionProvider | undefined {
  const derivedAtom = useMemo(
    () =>
      atom((get) => {
        get(registryVersionAtom)
        return mentionRegistry.get(id)
      }),
    [id]
  )

  return useAtomValue(derivedAtom)
}
