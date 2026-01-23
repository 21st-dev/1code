"use client"

import { cn } from "../../../lib/utils"
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
} from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

interface PreviewUrlInputProps {
  /** The base host (e.g., "localhost:3000") */
  baseHost: string | null
  /** Current path (e.g., "/dashboard") */
  currentPath: string
  /** Called when path changes */
  onPathChange: (path: string) => void
  /** Is the iframe currently loading? */
  isLoading?: boolean
  /** Optional class name for the container */
  className?: string
  /** Variant for different contexts */
  variant?: "default" | "mobile"
}

export function PreviewUrlInput({
  baseHost,
  currentPath,
  onPathChange,
  isLoading = false,
  className,
  variant = "default",
}: PreviewUrlInputProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Progress bar animation
  const progress = useMotionValue(0)
  const width = useTransform(progress, [0, 100], ["0%", "100%"])
  const glowOpacity = useTransform(progress, [0, 95, 100], [1, 1, 0])
  const animationRef = useRef<ReturnType<typeof animate> | null>(null)

  // Handle loading state changes for progress animation
  useEffect(() => {
    if (isLoading) {
      // Reset and start loading animation
      progress.jump(0)

      // Animate to ~90% with decreasing speed (simulating uncertain progress)
      animationRef.current = animate(progress, 90, {
        duration: 12, // Takes 12s to reach 90%
        ease: [0.1, 0.4, 0.2, 1], // Fast start, very slow end
      })

      // Safety timeout: if still loading after 15s, force completion
      const timeoutId = setTimeout(() => {
        animationRef.current?.stop()
        animationRef.current = animate(progress, 100, {
          duration: 0.15,
          ease: "easeOut",
        })
      }, 15_000)

      return () => {
        clearTimeout(timeoutId)
        animationRef.current?.stop()
      }
    } else {
      // Stop the slow animation
      animationRef.current?.stop()

      // Quickly complete to 100%
      animationRef.current = animate(progress, 100, {
        duration: 0.15,
        ease: "easeOut",
      })

      return () => {
        animationRef.current?.stop()
      }
    }
  }, [isLoading, progress])

  // Focus and select when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      const input = inputRef.current
      input.focus()

      const value = input.value
      // Display format is "~{currentPath}", e.g. "~/community/components"
      // Select only the path after "~/" so user can type new path directly
      const pathStartAfterSlash = 2 // Skip "~/"

      // If path is just "/" (main page), place cursor at end
      // Otherwise select the path portion AFTER "~/"
      if (currentPath === "/") {
        input.setSelectionRange(value.length, value.length)
      } else {
        input.setSelectionRange(pathStartAfterSlash, value.length)
      }
    }
  }, [isEditing, currentPath])

  const handleSubmit = useCallback(() => {
    let input = inputValue.trim()

    // Handle ~ prefix format (our display format)
    if (input.startsWith("~")) {
      input = input.slice(1) // Remove ~ prefix
    }

    // Extract path from full URL or just use as path
    let newPath = "/"
    try {
      // Check if it's a full URL
      if (input.startsWith("http://") || input.startsWith("https://")) {
        const url = new URL(input)
        newPath = url.pathname + url.search + url.hash
      } else if (input.includes(".") && input.includes("/")) {
        // It's host + path like "localhost:3000/some/path"
        const slashIndex = input.indexOf("/")
        newPath = input.slice(slashIndex)
      } else if (input.startsWith("/")) {
        // Just a path starting with /
        newPath = input
      } else {
        // Just a path without leading /
        newPath = "/" + input
      }
    } catch {
      // If parsing fails, treat as path
      newPath = input.startsWith("/") ? input : "/" + input
    }

    if (!newPath) newPath = "/"

    // Only navigate if path actually changed
    if (newPath !== currentPath) {
      onPathChange(newPath)
    }
    setIsEditing(false)
  }, [inputValue, currentPath, onPathChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === "Escape") {
        e.preventDefault()
        setInputValue(`~${currentPath}`)
        setIsEditing(false)
      }
    },
    [handleSubmit, currentPath],
  )

  const startEditing = useCallback(() => {
    setInputValue(`~${currentPath}`)
    setIsEditing(true)
  }, [currentPath])

  if (!baseHost) {
    return null
  }

  // Shared styling for consistent height/positioning between button and input
  const sharedStyles =
    "font-mono text-xs rounded-md px-3 h-7 leading-7 w-full max-w-[350px] text-center"

  return (
    <div
      className={cn(
        "min-w-0 flex-1 text-center flex items-center justify-center relative",
        className,
      )}
    >
      {/* URL input/button container */}
      <div className="relative max-w-[350px] w-full">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSubmit}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className={cn(
              sharedStyles,
              variant === "mobile"
                ? "bg-muted shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 text-foreground"
                : "bg-background shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 text-foreground",
            )}
            placeholder="~/"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={cn(
              sharedStyles,
              variant === "mobile"
                ? "truncate text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-muted hover:bg-muted/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                : "truncate text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:bg-background hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            )}
          >
            ~{currentPath}
          </button>
        )}

        {/* Progress bar at bottom with upward glow */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-0 left-0 right-0 pointer-events-none z-0 rounded-md overflow-hidden"
            >
              {/* Glow effect - uniform along progress, fades at edges via blur */}
              <motion.div
                className="absolute -bottom-2 left-0 h-4"
                style={{
                  width,
                  opacity: glowOpacity,
                  background: "hsl(var(--primary) / 0.15)",
                  filter: "blur(4px)",
                }}
              />
              {/* Progress bar line */}
              <motion.div
                className="absolute bottom-0 left-0 h-[0.5px] bg-primary/60"
                style={{ width }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
