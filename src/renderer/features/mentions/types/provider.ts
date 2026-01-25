/**
 * Mention Provider Interface
 *
 * The core extension point for the mention system.
 * Similar to VS Code's CompletionItemProvider.
 *
 * Providers are responsible for:
 * - Searching for mention items based on user input
 * - Serializing/deserializing mentions for storage
 * - Optionally providing custom rendering
 */

import type { ReactNode } from "react"
import type {
  MentionProviderId,
  MentionCategory,
  MentionTrigger,
  MentionItem,
} from "./core"
import type { MentionSearchContext, MentionSearchResult } from "./search"

/**
 * Main provider interface - implement this to add new mention types
 */
export interface MentionProvider<TData = unknown> {
  /**
   * Unique provider ID (use createProviderId helper)
   */
  readonly id: MentionProviderId

  /**
   * Human-readable name for the provider
   */
  readonly name: string

  /**
   * Category for grouping in dropdown UI
   */
  readonly category: MentionCategory

  /**
   * Trigger configuration (when to activate this provider)
   */
  readonly trigger: MentionTrigger

  /**
   * Priority for ordering providers (higher = first)
   * Used when multiple providers share the same trigger
   */
  readonly priority: number

  /**
   * Search for mention items matching the query
   * Should be fast (<50ms for local, <500ms for remote)
   *
   * @param context - Search context with query, project path, etc.
   * @returns Promise resolving to search results
   */
  search(context: MentionSearchContext): Promise<MentionSearchResult<TData>>

  /**
   * Serialize a mention item for storage in messages
   * Returns the @[...] token format
   *
   * @param item - The mention item to serialize
   * @returns Serialized string (e.g., "@[file:local:/src/index.ts]")
   */
  serialize(item: MentionItem<TData>): string

  /**
   * Deserialize a stored token back to a mention item
   * Used when rendering messages with mentions
   *
   * @param token - The token without @[] wrapper (e.g., "file:local:/src/index.ts")
   * @returns Mention item or null if not owned by this provider
   */
  deserialize(token: string): MentionItem<TData> | null

  /**
   * Resolve full item details (lazy loading)
   * Called when item is selected or needs preview
   *
   * @param item - Partial item to resolve
   * @returns Promise resolving to fully populated item
   */
  resolve?(item: MentionItem<TData>): Promise<MentionItem<TData>>

  /**
   * Get children for hierarchical items
   * Called when user expands an item (e.g., file -> symbols)
   *
   * @param item - Parent item to get children for
   * @param context - Search context
   * @returns Promise resolving to child items
   */
  getChildren?(
    item: MentionItem<TData>,
    context: MentionSearchContext
  ): Promise<MentionSearchResult<TData>>

  /**
   * Custom renderer for dropdown item (optional)
   * If not provided, default renderer is used
   *
   * @param item - Item to render
   * @param isSelected - Whether item is currently selected
   * @returns React node
   */
  renderItem?(item: MentionItem<TData>, isSelected: boolean): ReactNode

  /**
   * Custom renderer for in-editor chip (optional)
   * If not provided, default chip renderer is used
   *
   * @param item - Item to render as chip
   * @returns React node
   */
  renderChip?(item: MentionItem<TData>): ReactNode

  /**
   * Custom renderer for tooltip/preview (optional)
   *
   * @param item - Item to render preview for
   * @returns React node
   */
  renderTooltip?(item: MentionItem<TData>): ReactNode

  /**
   * Called when provider is activated
   * Use for initialization, starting file watchers, etc.
   */
  activate?(): Promise<void>

  /**
   * Called when provider is deactivated
   * Use for cleanup
   */
  deactivate?(): void

  /**
   * Check if provider is available in current context
   * Return false to hide provider in certain situations
   *
   * @param context - Current context with project path, etc.
   * @returns Whether provider should be available
   */
  isAvailable?(context: { projectPath?: string; sessionId?: string }): boolean
}

/**
 * Helper type for defining provider with specific data type
 */
export type TypedMentionProvider<TData> = MentionProvider<TData>

/**
 * Options for creating a provider
 */
export interface MentionProviderOptions<TData = unknown> {
  id: string
  name: string
  category: Omit<MentionCategory, "id"> & { id?: string }
  trigger?: Partial<MentionTrigger>
  priority?: number
  search: MentionProvider<TData>["search"]
  serialize: MentionProvider<TData>["serialize"]
  deserialize: MentionProvider<TData>["deserialize"]
  resolve?: MentionProvider<TData>["resolve"]
  getChildren?: MentionProvider<TData>["getChildren"]
  renderItem?: MentionProvider<TData>["renderItem"]
  renderChip?: MentionProvider<TData>["renderChip"]
  renderTooltip?: MentionProvider<TData>["renderTooltip"]
  activate?: MentionProvider<TData>["activate"]
  deactivate?: MentionProvider<TData>["deactivate"]
  isAvailable?: MentionProvider<TData>["isAvailable"]
}

/**
 * Factory function to create a provider with sensible defaults
 */
export function createMentionProvider<TData = unknown>(
  options: MentionProviderOptions<TData>
): MentionProvider<TData> {
  return {
    id: options.id as MentionProviderId,
    name: options.name,
    category: {
      id: options.category.id ?? options.id,
      label: options.category.label,
      icon: options.category.icon,
      priority: options.category.priority,
    },
    trigger: {
      char: options.trigger?.char ?? "@",
      pattern: options.trigger?.pattern,
      position: options.trigger?.position ?? "standalone",
      allowSpaces: options.trigger?.allowSpaces ?? true,
      maxLength: options.trigger?.maxLength,
    },
    priority: options.priority ?? 50,
    search: options.search,
    serialize: options.serialize,
    deserialize: options.deserialize,
    resolve: options.resolve,
    getChildren: options.getChildren,
    renderItem: options.renderItem,
    renderChip: options.renderChip,
    renderTooltip: options.renderTooltip,
    activate: options.activate,
    deactivate: options.deactivate,
    isAvailable: options.isAvailable,
  }
}
