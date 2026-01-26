import { useCallback, useLayoutEffect, useRef, useEffect } from "react"

/**
 * Custom hook for managing chat scroll behavior
 * 
 * Handles:
 * - Auto-scroll to bottom when new messages arrive
 * - Detecting user scroll to disable auto-scroll
 * - Smooth scroll-to-bottom animation
 * - Scroll initialization on mount
 * 
 * Uses refs to avoid re-renders on scroll events
 */
export function useChatScroll({
  containerRef,
  isActive,
  subChatId,
  shouldAutoScroll = true,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  isActive?: boolean
  subChatId: string
  shouldAutoScroll?: boolean
}) {
  // Scroll management state (using refs to avoid re-renders)
  const shouldAutoScrollRef = useRef(shouldAutoScroll)
  const isAutoScrollingRef = useRef(false) // Flag to ignore scroll events caused by auto-scroll
  const isInitializingScrollRef = useRef(false) // Flag to ignore scroll events during scroll initialization
  const prevScrollTopRef = useRef(0)
  const scrollInitializedRef = useRef(false)
  const hasInitializedRef = useRef(false)

  // Keep isActive in ref for use in callbacks (avoid stale closures)
  const isActiveRef = useRef(isActive ?? true)
  isActiveRef.current = isActive ?? true

  // Update shouldAutoScrollRef when prop changes
  useEffect(() => {
    shouldAutoScrollRef.current = shouldAutoScroll
  }, [shouldAutoScroll])

  // Cleanup isAutoScrollingRef on unmount to prevent stuck state
  useEffect(() => {
    return () => {
      isAutoScrollingRef.current = false
    }
  }, [])

  // Check if user is at bottom of chat
  const isAtBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return true
    const threshold = 50 // pixels from bottom
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    )
  }, [containerRef])

  // Handle scroll events to detect user scrolling
  // Updates shouldAutoScrollRef based on scroll direction
  // Using refs only to avoid re-renders on scroll
  const handleScroll = useCallback(() => {
    // Skip scroll handling for inactive tabs (keep-alive)
    if (!isActiveRef.current) return

    const container = containerRef.current
    if (!container) return

    const currentScrollTop = container.scrollTop
    const prevScrollTop = prevScrollTopRef.current
    prevScrollTopRef.current = currentScrollTop

    // Ignore scroll events during initialization (content loading)
    if (isAutoScrollingRef.current || isInitializingScrollRef.current) return

    // If user scrolls UP - disable auto-scroll immediately
    if (currentScrollTop < prevScrollTop) {
      shouldAutoScrollRef.current = false
      return
    }

    // If user scrolls DOWN and reaches bottom - enable auto-scroll
    shouldAutoScrollRef.current = isAtBottom()
  }, [isAtBottom, containerRef])

  // Scroll to bottom handler with ease-in-out animation
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    isAutoScrollingRef.current = true
    shouldAutoScrollRef.current = true

    const start = container.scrollTop
    const duration = 300 // ms
    const startTime = performance.now()

    // Ease-in-out cubic function
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeInOutCubic(progress)

      // Calculate end on each frame to handle dynamic content
      const end = container.scrollHeight - container.clientHeight
      container.scrollTop = start + (end - start) * easedProgress

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      } else {
        // Ensure we're at the absolute bottom
        container.scrollTop = container.scrollHeight
        isAutoScrollingRef.current = false
      }
    }

    requestAnimationFrame(animateScroll)
  }, [containerRef])

  // Initialize scroll position on mount (only once per tab with keep-alive)
  // Strategy: wait for content to stabilize, then scroll to bottom ONCE
  useLayoutEffect(() => {
    // Skip if not active (keep-alive: hidden tabs don't need scroll init)
    if (!isActiveRef.current) return

    const container = containerRef.current
    if (!container) return

    // With keep-alive, only initialize once per tab mount
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    // Reset on sub-chat change
    scrollInitializedRef.current = false
    isInitializingScrollRef.current = true

    // IMMEDIATE scroll to bottom - no waiting
    container.scrollTop = container.scrollHeight
    shouldAutoScrollRef.current = true

    // Mark as initialized IMMEDIATELY
    scrollInitializedRef.current = true
    isInitializingScrollRef.current = false

    // MutationObserver for async content (images, code blocks loading after initial render)
    const observer = new MutationObserver((mutations) => {
      // Skip if not active (keep-alive: don't scroll hidden tabs)
      if (!isActiveRef.current) return
      if (!shouldAutoScrollRef.current) return

      // Check if content was added
      const hasAddedContent = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      )

      if (hasAddedContent) {
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      }
    })

    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [subChatId, containerRef])

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [handleScroll, containerRef])

  // Auto-scroll when new messages arrive (if shouldAutoScroll is true)
  // This effect is triggered externally when messages change
  const triggerAutoScroll = useCallback(() => {
    if (!shouldAutoScrollRef.current) return
    if (!isActiveRef.current) return

    const container = containerRef.current
    if (!container) return

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      if (shouldAutoScrollRef.current && !isAutoScrollingRef.current) {
        isAutoScrollingRef.current = true
        container.scrollTop = container.scrollHeight
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = false
        })
      }
    })
  }, [containerRef])

  return {
    scrollToBottom,
    shouldAutoScrollRef,
    isAutoScrollingRef,
    isInitializingScrollRef,
    scrollInitializedRef,
    triggerAutoScroll,
  }
}
