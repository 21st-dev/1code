import { useEffect, useRef, useState } from "react"

/**
 * VS Code style overflow detection hook
 *
 * Detects when an element's content overflows its container using ResizeObserver.
 * This approach avoids layout thrashing by:
 * - Using ResizeObserver instead of window resize events
 * - Batching measurements with requestAnimationFrame
 * - Proper cleanup through dispose pattern
 *
 * @param contentRef - Ref to the element to observe
 * @param deps - Additional dependencies that should trigger a re-measurement
 * @returns boolean indicating if the element has overflow
 *
 * @example
 * ```tsx
 * const contentRef = useRef<HTMLDivElement>(null)
 * const hasOverflow = useOverflowDetection(contentRef, [textContent])
 *
 * return (
 *   <div ref={contentRef} className="max-h-[100px] overflow-hidden">
 *     {textContent}
 *   </div>
 *   {hasOverflow && <div className="gradient-overlay" />}
 * )
 * ```
 */
export function useOverflowDetection(
  contentRef: React.RefObject<HTMLElement | null>,
  deps: unknown[] = []
): boolean {
  const [hasOverflow, setHasOverflow] = useState(false)
  const rafIdRef = useRef<number>(0)

  useEffect(() => {
    const element = contentRef.current
    if (!element) return

    // Dispose pattern - track if effect has been cleaned up
    let disposed = false

    const measureOverflow = () => {
      // Cancel any pending animation frame
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }

      // Schedule measurement at next animation frame to batch with browser paint
      rafIdRef.current = requestAnimationFrame(() => {
        if (disposed || !contentRef.current) return

        const el = contentRef.current
        // Single synchronous read - batched with browser's paint cycle
        const overflows = el.scrollHeight > el.clientHeight
        setHasOverflow(overflows)
      })
    }

    // Initial measurement
    measureOverflow()

    // ResizeObserver fires AFTER layout, not during - avoids layout thrashing
    const observer = new ResizeObserver(measureOverflow)
    observer.observe(element)

    // Cleanup (VS Code dispose pattern)
    return () => {
      disposed = true
      observer.disconnect()
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return hasOverflow
}
