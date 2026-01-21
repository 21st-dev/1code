"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useCallback } from "react"

interface DiffFullPageViewProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function DiffFullPageView({
  isOpen,
  onClose,
  children,
}: DiffFullPageViewProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-50 bg-background flex flex-col"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
