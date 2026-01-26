import { ArrowDown } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useEffect, useRef, useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { Kbd } from "../../../components/ui/kbd"
import { cn } from "../../../lib/utils"

interface ScrollToBottomButtonProps {
  containerRef: React.RefObject<HTMLElement | null>
  onScrollToBottom: () => void
  hasStackedCards?: boolean
  subChatId?: string
  isActive?: boolean
}

/**
 * Scroll to bottom button - shows when user scrolls up from bottom
 * Isolated component to avoid re-renders during streaming
 */
export const ScrollToBottomButton = memo(function ScrollToBottomButton({
  containerRef,
  onScrollToBottom,
  hasStackedCards = false,
  subChatId,
  isActive = true,
}: ScrollToBottomButtonProps) {
  const [isVisible, setIsVisible] = useState(false)

  // Keep isActive in ref for scroll event handler
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    // Skip scroll monitoring for inactive tabs (keep-alive)
    if (!isActive) return

    const container = containerRef.current
    if (!container) return

    // RAF throttle to avoid setState on every scroll event
    let rafId: number | null = null
    let lastAtBottom: boolean | null = null

    const checkVisibility = () => {
      // Skip if not active or RAF already pending
      if (!isActiveRef.current || rafId !== null) return

      rafId = requestAnimationFrame(() => {
        rafId = null
        // Double-check active state in RAF callback
        if (!isActiveRef.current) return

        const threshold = 50
        const atBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight <=
          threshold

        // Only update state if value actually changed
        if (lastAtBottom !== atBottom) {
          lastAtBottom = atBottom
          setIsVisible(!atBottom)
        }
      })
    }

    // Check initial state after a short delay to allow scroll position to be set
    // This handles the case when entering a sub-chat that's scrolled to a specific position
    const timeoutId = setTimeout(() => {
      // Skip if not active
      if (!isActiveRef.current) return

      // Direct check for initial state (no RAF needed)
      const threshold = 50
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        threshold
      lastAtBottom = atBottom
      setIsVisible(!atBottom)
    }, 50)

    container.addEventListener("scroll", checkVisibility, { passive: true })
    return () => {
      clearTimeout(timeoutId)
      if (rafId !== null) cancelAnimationFrame(rafId)
      container.removeEventListener("scroll", checkVisibility)
    }
  }, [containerRef, subChatId, isActive])

  return (
    <AnimatePresence>
      {isVisible && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <motion.button
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={onScrollToBottom}
              className={cn(
                "absolute right-4 p-2.5 rounded-full bg-background/95 backdrop-blur-sm border border-border/60 shadow-lg hover:bg-accent hover:shadow-xl active:scale-[0.95] transition-all duration-200 z-20 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                hasStackedCards ? "bottom-44 sm:bottom-36" : "bottom-32 sm:bottom-24"
              )}
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4 text-foreground" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Scroll to bottom
            <span className="inline-flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>
                <ArrowDown className="h-3 w-3" />
              </Kbd>
            </span>
          </TooltipContent>
        </Tooltip>
      )}
    </AnimatePresence>
  )
})
