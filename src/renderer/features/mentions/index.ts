/**
 * Scalable Mention System
 *
 * A plugin-based mention system inspired by VS Code's extension model.
 * Supports unlimited mention types through a provider system.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { registerBuiltInProviders, useMentionProviders } from './mentions'
 *
 * // Register built-in providers at app startup
 * registerBuiltInProviders()
 *
 * // Use providers in React components
 * function MyComponent() {
 *   const providers = useMentionProviders()
 *   // ...
 * }
 * ```
 *
 * ## Creating Custom Providers
 *
 * ```typescript
 * import { createMentionProvider, registerProvider } from './mentions'
 *
 * const myProvider = createMentionProvider({
 *   id: 'my-provider',
 *   name: 'My Provider',
 *   category: { label: 'My Category', priority: 50 },
 *   search: async (context) => {
 *     // Return matching items
 *     return { items: [...], hasMore: false }
 *   },
 *   serialize: (item) => `@[my:${item.id}]`,
 *   deserialize: (token) => {
 *     if (!token.startsWith('my:')) return null
 *     // Parse and return item
 *   },
 * })
 *
 * registerProvider(myProvider)
 * ```
 */

// Types
export type {
  MentionProviderId,
  MentionTrigger,
  MentionCategory,
  MentionItem,
  MentionPrefix,
  MentionProvider,
  TypedMentionProvider,
  MentionProviderOptions,
  MentionSearchContext,
  MentionSearchResult,
  AggregatedSearchResult,
  MentionSearchOptions,
  RelevanceScore,
} from "./types"

export {
  createProviderId,
  MENTION_PREFIXES,
  getMentionPrefix,
  isMentionType,
  createMentionProvider,
  calculateRelevance,
  sortByRelevance,
} from "./types"

// Registry
export {
  mentionRegistry,
  mentionProvidersAtom,
  syncedMentionProvidersAtom,
  useMentionProviders,
  useMentionProvidersByTrigger,
  useAvailableMentionProviders,
  useMentionCategories,
  useMentionProvider,
} from "./registry"

// Providers
export {
  filesProvider,
  skillsProvider,
  agentsProvider,
  toolsProvider,
  builtInProviders,
  registerBuiltInProviders,
  registerProvider,
} from "./providers"

export type { FileData, SkillData, AgentData, ToolData, ToolsSearchContext } from "./providers"

// Search
export {
  MentionCache,
  GitAwareCache,
  mentionCache,
  gitAwareCache,
  MentionSearchEngine,
  mentionSearchEngine,
} from "./search"

// Hooks
export {
  useMentionSearch,
  type UseMentionSearchOptions,
  type UseMentionSearchResult,
} from "./hooks"
