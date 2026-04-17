/// <reference types="vite/client" />

// Extend Vite's ImportMetaEnv with our custom env vars
declare global {
  interface ImportMetaEnv {
    // Main process (MAIN_VITE_ prefix)
    readonly MAIN_VITE_SENTRY_DSN?: string
    readonly MAIN_VITE_POSTHOG_KEY?: string
    readonly MAIN_VITE_POSTHOG_HOST?: string

    // Renderer process (VITE_ prefix)
    readonly VITE_POSTHOG_KEY?: string
    readonly VITE_POSTHOG_HOST?: string
    readonly VITE_FEEDBACK_URL?: string
    readonly VITE_OPENCODEX_COMMUNITY_URL?: string
    readonly VITE_OPENCODEX_CHANGELOG_URL?: string
    readonly VITE_OPENCODEX_AGENTS_CHANGELOG_URL?: string
    readonly VITE_OPENCODEX_CHANGELOG_FEED_URL?: string
  }
}

export {}
