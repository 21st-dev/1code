/**
 * Core types for the scalable mention system
 *
 * This module defines the fundamental types used across all mention providers.
 * Inspired by VS Code's extension model for maximum extensibility.
 */

import type { ComponentType } from "react"

/**
 * Branded type for provider IDs to ensure type safety
 */
export type MentionProviderId = string & { readonly __brand: "MentionProviderId" }

/**
 * Helper to create a MentionProviderId
 */
export function createProviderId(id: string): MentionProviderId {
  return id as MentionProviderId
}

/**
 * Trigger character configuration for mention providers
 * Supports single char (@, /, #) or regex patterns
 */
export interface MentionTrigger {
  /**
   * The trigger character(s) - e.g., '@', '/', '#'
   */
  char: string

  /**
   * Optional regex pattern for more complex triggers
   * e.g., /#\d+/ for GitHub issue numbers
   */
  pattern?: RegExp

  /**
   * Position requirements for the trigger:
   * - 'start-of-line': Must be at the beginning of a line
   * - 'standalone': Must be preceded by whitespace or start of input
   * - 'any': Can appear anywhere
   */
  position: "start-of-line" | "standalone" | "any"

  /**
   * Allow continuation after space (for multi-word search)
   * e.g., "@agents sidebar" matches files containing both words
   */
  allowSpaces: boolean

  /**
   * Maximum characters in the search query before auto-close
   * Prevents runaway searches
   */
  maxLength?: number
}

/**
 * Category for grouping mentions in the dropdown UI
 */
export interface MentionCategory {
  /**
   * Unique category ID
   */
  id: string

  /**
   * Display label for the category
   */
  label: string

  /**
   * Optional icon component for the category
   */
  icon?: ComponentType<{ className?: string }>

  /**
   * Sort priority (higher = shown first)
   */
  priority: number
}

/**
 * Base mention item that all providers must return
 * Generic TData allows providers to attach custom data
 */
export interface MentionItem<TData = unknown> {
  /**
   * Unique ID within the provider
   * Format: prefix:source:identifier
   * e.g., "file:local:/src/index.ts", "skill:claude-code"
   */
  id: string

  /**
   * Display label in dropdown (usually filename or name)
   */
  label: string

  /**
   * Optional secondary text (path, description)
   */
  description?: string

  /**
   * Icon identifier (string) or component
   * String IDs map to the icon registry
   */
  icon?: string | ComponentType<{ className?: string }>

  /**
   * Provider-specific data payload
   * Type-safe when provider specifies TData
   */
  data: TData

  /**
   * Additional keywords for fuzzy search (beyond label)
   */
  keywords?: string[]

  /**
   * Sort priority within results (higher = shown first)
   */
  priority?: number

  /**
   * Whether this item can be expanded (hierarchical navigation)
   * e.g., file -> symbols, folder -> files
   */
  hasChildren?: boolean

  /**
   * Parent item ID for hierarchical mentions
   */
  parentId?: string

  /**
   * Disabled state with optional reason
   */
  disabled?: { reason: string } | false

  /**
   * Optional metadata for display purposes
   */
  metadata?: {
    /**
     * For files: diff stats (+additions, -deletions)
     */
    diffStats?: { additions: number; deletions: number }

    /**
     * Truncated path for display
     */
    truncatedPath?: string

    /**
     * Type hint for rendering
     */
    type?: "file" | "folder" | "skill" | "agent" | "tool" | "category" | "symbol"

    /**
     * Repository name (for multi-repo support)
     */
    repository?: string
  }
}

/**
 * Mention prefix constants for different item types
 * Used in serialization/deserialization
 */
export const MENTION_PREFIXES = {
  FILE: "file:",
  FOLDER: "folder:",
  SKILL: "skill:",
  AGENT: "agent:",
  TOOL: "tool:",
  QUOTE: "quote:",
  DIFF: "diff:",
  PASTED: "pasted:",
  SYMBOL: "symbol:",
  GITHUB_ISSUE: "github:issue:",
  GITHUB_PR: "github:pr:",
} as const

export type MentionPrefix = (typeof MENTION_PREFIXES)[keyof typeof MENTION_PREFIXES]

/**
 * Extract prefix from a mention ID
 */
export function getMentionPrefix(id: string): MentionPrefix | null {
  for (const prefix of Object.values(MENTION_PREFIXES)) {
    if (id.startsWith(prefix)) {
      return prefix
    }
  }
  return null
}

/**
 * Check if a mention ID belongs to a specific type
 */
export function isMentionType(
  id: string,
  type: keyof typeof MENTION_PREFIXES
): boolean {
  return id.startsWith(MENTION_PREFIXES[type])
}
