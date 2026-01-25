/**
 * Mention System Types
 *
 * This module exports all types for the scalable mention system.
 * Import from here for a clean API.
 */

// Core types
export type { MentionProviderId, MentionTrigger, MentionCategory, MentionItem } from "./core"
export { createProviderId, MENTION_PREFIXES, getMentionPrefix, isMentionType } from "./core"
export type { MentionPrefix } from "./core"

// Provider types
export type {
  MentionProvider,
  TypedMentionProvider,
  MentionProviderOptions,
} from "./provider"
export { createMentionProvider } from "./provider"

// Search types
export type {
  MentionSearchContext,
  MentionSearchResult,
  AggregatedSearchResult,
  MentionSearchOptions,
  RelevanceScore,
} from "./search"
export { calculateRelevance, sortByRelevance } from "./search"
