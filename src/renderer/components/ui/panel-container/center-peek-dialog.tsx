"use client"

import { AnimatePresence, motion } from "motion/react"

interface CenterPeekDialogProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function CenterPeekDialog({
  isOpen,
  onClose,
  children,
}: CenterPeekDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-50 flex flex-col bg-background border border-border/50 overflow-hidden"
            style={{
              top: "72px",
              left: "72px",
              right: "72px",
              height: "calc(100% - 144px)",
              maxWidth: "1200px",
              marginInline: "auto",
              borderRadius: "12px",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
