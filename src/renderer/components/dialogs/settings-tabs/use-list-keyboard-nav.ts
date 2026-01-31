import { useCallback, useRef } from "react"

/**
 * Hook for arrow key navigation in settings sidebar lists.
 * Returns a ref for the scrollable container and an onKeyDown handler.
 * Items must have `data-item-id` attributes on their buttons.
 */
export function useListKeyboardNav<T extends string>({
  items,
  selectedItem,
  onSelect,
}: {
  items: T[]
  selectedItem: T | null
  onSelect: (item: T) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      if (items.length === 0) return

      e.preventDefault()

      const currentIndex = selectedItem ? items.indexOf(selectedItem) : -1
      let nextIndex: number

      if (e.key === "ArrowDown") {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : currentIndex
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : 0
      }

      if (nextIndex === currentIndex && currentIndex !== -1) return

      const nextItem = items[nextIndex]!
      onSelect(nextItem)

      // Focus the item and scroll into view
      requestAnimationFrame(() => {
        const el = containerRef.current?.querySelector<HTMLElement>(
          `[data-item-id="${CSS.escape(nextItem)}"]`
        )
        if (el) {
          el.focus()
          el.scrollIntoView({ block: "nearest" })
        }
      })
    },
    [items, selectedItem, onSelect]
  )

  return { containerRef, onKeyDown }
}
