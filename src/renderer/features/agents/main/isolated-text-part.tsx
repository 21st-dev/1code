"use client"

import { memo, useMemo, useEffect, useRef, useSyncExternalStore, useCallback } from "react"
import { useAtomValue } from "jotai"
import { cn } from "../../../lib/utils"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"
import { messageAtomFamily, isMessageStreamingAtomFamily } from "../stores/message-store"
import { useSearchHighlight, useSearchQuery } from "../search"
import { appStore } from "../../../lib/jotai-store"

// ============================================================================
// TEXT PART STORE - External store for text parts to avoid re-renders
// ============================================================================
// Problem: Jotai's derived atoms always call the getter when dependencies change,
// even if the result is the same. This causes IsolatedTextPart to re-render
// even when its specific text part hasn't changed.
//
// Solution: Use useSyncExternalStore with a custom store that only triggers
// re-renders when the specific text part actually changes.

// Cache for text content per part
const textPartStore = new Map<string, string>()

// Subscribers per part key
const textPartSubscribers = new Map<string, Set<() => void>>()

// Get text from a specific part
function getTextPart(messageId: string, partIndex: number): string {
  const key = `${messageId}:${partIndex}`
  const cached = textPartStore.get(key)
  if (cached !== undefined) return cached

  // Get from Jotai store
  const message = appStore.get(messageAtomFamily(messageId))
  const parts = message?.parts || []
  const part = parts[partIndex]
  const text = part?.type === "text" ? (part.text || "") : ""
  textPartStore.set(key, text)
  return text
}

// Subscribe to changes for a specific part
function subscribeToTextPart(messageId: string, partIndex: number, callback: () => void): () => void {
  const key = `${messageId}:${partIndex}`

  // Add to subscribers
  if (!textPartSubscribers.has(key)) {
    textPartSubscribers.set(key, new Set())
  }
  textPartSubscribers.get(key)!.add(callback)

  // Subscribe to Jotai message atom
  const unsubscribe = appStore.sub(messageAtomFamily(messageId), () => {
    const message = appStore.get(messageAtomFamily(messageId))
    const parts = message?.parts || []
    const part = parts[partIndex]
    const newText = part?.type === "text" ? (part.text || "") : ""

    const oldText = textPartStore.get(key)
    if (oldText !== newText) {
      textPartStore.set(key, newText)
      // Only notify THIS part's subscribers
      const subs = textPartSubscribers.get(key)
      if (subs) {
        subs.forEach(cb => cb())
      }
    }
  })

  return () => {
    textPartSubscribers.get(key)?.delete(callback)
    unsubscribe()
  }
}

// Hook to get text part with minimal re-renders
function useTextPart(messageId: string, partIndex: number): string {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToTextPart(messageId, partIndex, callback),
    [messageId, partIndex]
  )

  const getSnapshot = useCallback(
    () => getTextPart(messageId, partIndex),
    [messageId, partIndex]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// ISOLATED TEXT PART - Subscribes to atom directly, parent doesn't get text
// ============================================================================
// This component is the KEY optimization for streaming performance.
//
// Problem: When text is passed as a prop, every parent component that
// passes the text must re-render when text changes (every streaming chunk).
//
// Solution: This component receives only stable props (messageId, partIndex)
// and subscribes DIRECTLY to the Jotai atom. The parent doesn't know about
// the text content at all, so it doesn't re-render.
//
// Data flow:
// Before (bad):
//   AssistantMessageItem(message) → re-render on every chunk
//     └─ MemoizedTextPart(text) → re-render on every chunk
//         └─ Streamdown(content) → re-render on every chunk
//
// After (good):
//   AssistantMessageItem(messageId) → NO re-render during streaming
//     └─ IsolatedTextPart(messageId, partIndex) → subscribes to atom
//         └─ Streamdown(content) → re-render on every chunk (only this!)
// ============================================================================

interface IsolatedTextPartProps {
  messageId: string
  partIndex: number
  isFinalText: boolean
  visibleStepsCount: number
}

// Stable comparison - only re-render if props change (they don't during streaming)
function arePropsEqual(prev: IsolatedTextPartProps, next: IsolatedTextPartProps): boolean {
  return (
    prev.messageId === next.messageId &&
    prev.partIndex === next.partIndex &&
    prev.isFinalText === next.isFinalText &&
    prev.visibleStepsCount === next.visibleStepsCount
  )
}


// Helper function to highlight text in DOM using TreeWalker
// currentMatchIndex: which match (0-based) to mark as current, or null if none
function highlightTextInDom(
  container: HTMLElement,
  searchText: string,
  currentMatchIndex: number | null = null
) {
  // Remove existing highlights first
  const existingHighlights = container.querySelectorAll(".search-highlight")
  existingHighlights.forEach((el) => {
    const parent = el.parentNode
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ""), el)
      parent.normalize()
    }
  })

  if (!searchText) return

  const lowerSearch = searchText.toLowerCase()
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  )

  const textNodes: Text[] = []
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (node.nodeValue && node.nodeValue.toLowerCase().includes(lowerSearch)) {
      textNodes.push(node)
    }
  }

  let matchCounter = 0
  for (const textNode of textNodes) {
    const text = textNode.nodeValue || ""
    const lowerText = text.toLowerCase()
    let lastIndex = 0
    const fragments: (string | HTMLElement)[] = []
    let searchIndex = 0

    while ((searchIndex = lowerText.indexOf(lowerSearch, lastIndex)) !== -1) {
      // Add text before match
      if (searchIndex > lastIndex) {
        fragments.push(text.slice(lastIndex, searchIndex))
      }

      // Create highlight mark
      const mark = document.createElement("mark")
      mark.className = "search-highlight"
      mark.textContent = text.slice(searchIndex, searchIndex + searchText.length)

      // Mark match as current if it's the one we're looking for
      if (currentMatchIndex !== null && matchCounter === currentMatchIndex) {
        mark.classList.add("search-highlight-current")
      }
      matchCounter++

      fragments.push(mark)
      lastIndex = searchIndex + searchText.length
    }

    // Add remaining text
    if (lastIndex < text.length) {
      fragments.push(text.slice(lastIndex))
    }

    // Replace text node with fragments
    if (fragments.length > 0) {
      const parent = textNode.parentNode
      if (parent) {
        fragments.forEach((frag, i) => {
          if (typeof frag === "string") {
            parent.insertBefore(document.createTextNode(frag), textNode)
          } else {
            parent.insertBefore(frag, textNode)
          }
        })
        parent.removeChild(textNode)
      }
    }
  }
}

export const IsolatedTextPart = memo(function IsolatedTextPart({
  messageId,
  partIndex,
  isFinalText,
  visibleStepsCount,
}: IsolatedTextPartProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Use external store to subscribe to ONLY this text part
  // This prevents re-renders when other parts of the same message change
  const text = useTextPart(messageId, partIndex)

  // Use per-message streaming atom instead of global isStreamingAtom
  // This prevents re-renders of old messages when streaming status changes
  const isTextStreaming = useAtomValue(isMessageStreamingAtomFamily(messageId))

  // Get search highlights for this text part
  const highlights = useSearchHighlight(messageId, partIndex, "text")

  // Get search query from context
  const searchQuery = useSearchQuery()

  // Find current highlight (the one marked as current)
  const currentHighlight = highlights.find(h => h.isCurrent)
  // Memoize the current index to ensure stable dependency for useEffect
  const currentMatchIndexInPart = currentHighlight?.indexInPart ?? null

  // Apply DOM-based highlighting after render
  // If currentHighlight exists, use its indexInPart to mark the correct match as current
  useEffect(() => {
    if (!contentRef.current || isTextStreaming) return

    // Apply highlighting
    highlightTextInDom(
      contentRef.current,
      searchQuery,
      currentMatchIndexInPart
    )

    // Cleanup on unmount or when highlights change
    return () => {
      if (contentRef.current) {
        const existingHighlights = contentRef.current.querySelectorAll(".search-highlight")
        existingHighlights.forEach((el) => {
          const parent = el.parentNode
          if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent || ""), el)
            parent.normalize()
          }
        })
      }
    }
  }, [searchQuery, currentMatchIndexInPart, isTextStreaming, text])

  if (!text?.trim()) return null

  return (
    <div
      className={cn(
        "text-foreground px-2",
        isFinalText && visibleStepsCount > 0 && "pt-3 border-t border-border/50",
      )}
      data-message-id={messageId}
      data-part-index={partIndex}
      data-part-type="text"
    >
      {isFinalText && visibleStepsCount > 0 && (
        <div className="text-[12px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1">
          Response
        </div>
      )}
      <div ref={contentRef}>
        <MemoizedMarkdown
          content={text}
          id={`${messageId}-${partIndex}`}
          size="sm"
        />
      </div>
    </div>
  )
}, arePropsEqual)

// ============================================================================
// ISOLATED TEXT PARTS LIST - Renders all text parts for a message
// ============================================================================
// This component finds all text parts and renders IsolatedTextPart for each.
// It only re-renders when the NUMBER of text parts changes (new part added),
// NOT when text content changes within existing parts.

interface IsolatedTextPartsProps {
  messageId: string
  // For determining which parts to show and how
  finalTextIndex: number  // Index where "final text" starts (-1 if none)
  visibleStepsCount: number
  showOnlyFinalText?: boolean  // If true, only show parts >= finalTextIndex
}

function areListPropsEqual(prev: IsolatedTextPartsProps, next: IsolatedTextPartsProps): boolean {
  return (
    prev.messageId === next.messageId &&
    prev.finalTextIndex === next.finalTextIndex &&
    prev.visibleStepsCount === next.visibleStepsCount &&
    prev.showOnlyFinalText === next.showOnlyFinalText
  )
}

export const IsolatedTextPartsList = memo(function IsolatedTextPartsList({
  messageId,
  finalTextIndex,
  visibleStepsCount,
  showOnlyFinalText = false,
}: IsolatedTextPartsProps) {
  // Subscribe to message just to get parts structure (not content)
  const message = useAtomValue(messageAtomFamily(messageId))

  // Find indices of text parts that should be rendered
  // This is a stable calculation - only changes when parts array structure changes
  const textPartIndices = useMemo(() => {
    const parts = message?.parts || []
    const indices: number[] = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part.type === "text" && part.text?.trim()) {
        // Apply filtering based on finalTextIndex
        if (showOnlyFinalText) {
          if (finalTextIndex !== -1 && i >= finalTextIndex) {
            indices.push(i)
          }
        } else {
          if (finalTextIndex === -1 || i < finalTextIndex) {
            indices.push(i)
          }
        }
      }
    }

    return indices
  }, [message?.parts?.length, finalTextIndex, showOnlyFinalText])

  if (textPartIndices.length === 0) return null

  return (
    <>
      {textPartIndices.map((partIndex) => (
        <IsolatedTextPart
          key={`${messageId}-text-${partIndex}`}
          messageId={messageId}
          partIndex={partIndex}
          isFinalText={showOnlyFinalText && finalTextIndex !== -1 && partIndex === finalTextIndex}
          visibleStepsCount={visibleStepsCount}
        />
      ))}
    </>
  )
}, areListPropsEqual)
