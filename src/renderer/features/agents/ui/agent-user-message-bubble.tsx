"use client"

import { useState, useRef, useEffect, memo, useMemo } from "react"
import { cn } from "../../../lib/utils"
import { useOverflowDetection } from "../../../hooks/use-overflow-detection"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { AgentImageItem } from "./agent-image-item"
import { RenderFileMentions, extractTextMentions, TextMentionBlocks } from "../mentions/render-file-mentions"
import { useSearchHighlight, useSearchQuery } from "../search"

interface AgentUserMessageBubbleProps {
  messageId: string
  textContent: string
  imageParts?: Array<{
    data?: {
      filename?: string
      url?: string
    }
  }>
  /** If true, renders only images and text - no TextMentionBlocks (they're rendered by parent) */
  skipTextMentionBlocks?: boolean
}

// Helper function to highlight text in DOM using TreeWalker
function highlightTextInDom(
  container: HTMLElement,
  searchText: string,
  currentOffset: number | null,
  currentLength: number | null
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

  let globalOffset = 0
  for (const textNode of textNodes) {
    const text = textNode.nodeValue || ""
    const lowerText = text.toLowerCase()
    let lastIndex = 0
    const fragments: (string | HTMLElement)[] = []
    let searchIndex = 0

    while ((searchIndex = lowerText.indexOf(lowerSearch, lastIndex)) !== -1) {
      if (searchIndex > lastIndex) {
        fragments.push(text.slice(lastIndex, searchIndex))
      }

      const mark = document.createElement("mark")
      mark.className = "search-highlight"
      mark.textContent = text.slice(searchIndex, searchIndex + searchText.length)

      if (currentOffset !== null && currentLength !== null) {
        const matchStart = globalOffset + searchIndex
        if (matchStart === currentOffset) {
          mark.classList.add("search-highlight-current")
        }
      }

      fragments.push(mark)
      lastIndex = searchIndex + searchText.length
    }

    if (lastIndex < text.length) {
      fragments.push(text.slice(lastIndex))
    }

    if (fragments.length > 0) {
      const parent = textNode.parentNode
      if (parent) {
        fragments.forEach((frag) => {
          if (typeof frag === "string") {
            parent.insertBefore(document.createTextNode(frag), textNode)
          } else {
            parent.insertBefore(frag, textNode)
          }
        })
        parent.removeChild(textNode)
      }
    }

    globalOffset += text.length
  }
}

export const AgentUserMessageBubble = memo(function AgentUserMessageBubble({
  messageId,
  textContent,
  imageParts = [],
  skipTextMentionBlocks = false,
}: AgentUserMessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Extract quote/diff mentions to display above the bubble
  const { textMentions, cleanedText } = useMemo(
    () => extractTextMentions(textContent),
    [textContent]
  )

  // VS Code style overflow detection using ResizeObserver (no layout thrashing)
  const showGradient = useOverflowDetection(contentRef, [textContent])

  // Search highlight support
  const highlights = useSearchHighlight(messageId, 0, "text")
  const searchQuery = useSearchQuery()
  const currentHighlight = highlights.find(h => h.isCurrent)

  // Determine if we should scroll for search (has current highlight in this message)
  const hasCurrentSearchHighlight = currentHighlight !== undefined

  // Track previous highlight state to detect when search leaves this message
  const prevHadHighlight = useRef(false)

  // Scroll to current highlight within the user message bubble
  useEffect(() => {
    if (hasCurrentSearchHighlight && contentRef.current) {
      // Wait for DOM highlighting to be applied
      requestAnimationFrame(() => {
        const highlightEl = contentRef.current?.querySelector(".search-highlight-current")
        if (highlightEl) {
          highlightEl.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      })
    }

    // Reset scroll position when search leaves this message
    if (prevHadHighlight.current && !hasCurrentSearchHighlight && contentRef.current) {
      contentRef.current.scrollTop = 0
    }

    prevHadHighlight.current = hasCurrentSearchHighlight
  }, [hasCurrentSearchHighlight, currentHighlight?.offset])

  // Apply DOM-based highlighting after render
  useEffect(() => {
    if (!contentRef.current) return

    highlightTextInDom(
      contentRef.current,
      searchQuery,
      currentHighlight?.offset ?? null,
      currentHighlight?.length ?? null
    )

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
  }, [searchQuery, currentHighlight?.offset, currentHighlight?.length, textContent])

  return (
    <>
      <div className="flex justify-start drop-shadow-[0_10px_20px_hsl(var(--background))]" data-user-bubble>
        <div className="space-y-2 w-full">
          {/* Show attached images from stored message */}
          {imageParts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                // Build allImages array for gallery navigation
                const resolveImgUrl = (img: any) =>
                  img.data?.base64Data && img.data?.mediaType
                    ? `data:${img.data.mediaType};base64,${img.data.base64Data}`
                    : img.data?.url || ""
                const allImages = imageParts
                  .filter((img) => img.data?.url || img.data?.base64Data)
                  .map((img, idx) => ({
                    id: `${messageId}-img-${idx}`,
                    filename: img.data?.filename || "image",
                    url: resolveImgUrl(img),
                  }))

                return imageParts.map((img, idx) => (
                  <AgentImageItem
                    key={`${messageId}-img-${idx}`}
                    id={`${messageId}-img-${idx}`}
                    filename={img.data?.filename || "image"}
                    url={resolveImgUrl(img)}
                    allImages={allImages}
                    imageIndex={idx}
                  />
                ))
              })()}
            </div>
          )}
          {/* Show text mentions (quote/diff) as blocks above text bubble - only if not rendered by parent */}
          {!skipTextMentionBlocks && textMentions.length > 0 && (
            <TextMentionBlocks mentions={textMentions} />
          )}
          {/* Text bubble with overflow detection */}
          {cleanedText ? (
            <div
              ref={contentRef}
              onClick={() => showGradient && !hasCurrentSearchHighlight && setIsExpanded(true)}
              className={cn(
                "relative bg-input-background border px-3 py-2 rounded-xl whitespace-pre-wrap text-sm transition-all duration-200 max-h-[100px]",
                // When searching in this message, allow scroll; otherwise hide overflow
                hasCurrentSearchHighlight ? "overflow-y-auto" : "overflow-hidden",
                // Cursor and hover only when can expand (not during search)
                showGradient && !hasCurrentSearchHighlight && "cursor-pointer hover:brightness-110",
              )}
              data-message-id={messageId}
              data-part-index={0}
              data-part-type="text"
            >
              <RenderFileMentions text={cleanedText} />
              {/* Show gradient only when collapsed and not searching in this message */}
              {showGradient && !hasCurrentSearchHighlight && (
                <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-[hsl(var(--input-background))] to-transparent rounded-b-xl" />
              )}
            </div>
          ) : (imageParts.length > 0 || textMentions.length > 0) && !skipTextMentionBlocks ? (
            // Show "Using X" summary when no text but have attachments rendered inline
            <div className="bg-input-background border px-3 py-2 rounded-xl text-sm text-muted-foreground italic">
              {(() => {
                const parts: string[] = []

                // Count images
                if (imageParts.length > 0) {
                  parts.push(imageParts.length === 1 ? "image" : `${imageParts.length} images`)
                }

                // Count text mentions by type
                const quoteCount = textMentions.filter(m => m.type === "quote").length
                const pastedCount = textMentions.filter(m => m.type === "pasted").length
                const codeCount = textMentions.filter(m => m.type === "diff").length

                if (quoteCount > 0) {
                  parts.push(quoteCount === 1 ? "selected text" : `${quoteCount} text selections`)
                }
                if (pastedCount > 0) {
                  parts.push(pastedCount === 1 ? "pasted text" : `${pastedCount} pasted texts`)
                }
                if (codeCount > 0) {
                  parts.push(codeCount === 1 ? "code selection" : `${codeCount} code selections`)
                }

                return `Using ${parts.join(", ")}`
              })()}
            </div>
          ) : null}
        </div>
      </div>

      {/* Full message dialog */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-muted-foreground">
              Full message
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {textMentions.length > 0 && (
              <TextMentionBlocks mentions={textMentions} />
            )}
            <div className="whitespace-pre-wrap text-sm">
              <RenderFileMentions text={cleanedText} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
