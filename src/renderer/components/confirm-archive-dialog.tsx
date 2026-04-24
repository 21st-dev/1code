import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "./ui/button"

interface ConfirmArchiveDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  activeProcessCount: number
}

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const
const INTERACTION_DELAY_MS = 250

export function ConfirmArchiveDialog({
  isOpen,
  onClose,
  onConfirm,
  activeProcessCount,
}: ConfirmArchiveDialogProps) {
  const [mounted, setMounted] = useState(false)
  const openAtRef = useRef<number>(0)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      openAtRef.current = performance.now()
    }
  }, [isOpen])

  const handleAnimationComplete = useCallback(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus()
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    const canInteract = performance.now() - openAtRef.current > INTERACTION_DELAY_MS
    if (!canInteract) return
    onClose()
  }, [onClose])

  const handleConfirm = useCallback(() => {
    const canInteract = performance.now() - openAtRef.current > INTERACTION_DELAY_MS
    if (!canInteract) return
    onConfirm()
    onClose()
  }, [onConfirm, onClose])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        handleClose()
      }
      if (event.key === "Enter") {
        event.preventDefault()
        handleConfirm()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleClose, handleConfirm])

  if (!mounted) return null

  const portalTarget = typeof document !== "undefined" ? document.body : null
  if (!portalTarget) return null

  const hasProcesses = activeProcessCount > 0

  return createPortal(
    <AnimatePresence mode="wait" initial={false}>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: 0.18, ease: EASING_CURVE },
            }}
            exit={{
              opacity: 0,
              pointerEvents: "none" as const,
              transition: { duration: 0.15, ease: EASING_CURVE },
            }}
            className="fixed inset-0 z-[45] bg-black/25"
            onClick={handleClose}
            style={{ pointerEvents: "auto" }}
            data-modal="confirm-archive-dialog"
          />

          {/* Main Dialog */}
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASING_CURVE }}
              onAnimationComplete={handleAnimationComplete}
              className="w-[90vw] max-w-[400px] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden" data-canvas-dialog>
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    Archive Workspace
                  </h2>

                  {hasProcesses && (
                    <p className="text-sm text-muted-foreground">
                      {activeProcessCount} running {activeProcessCount === 1 ? "process" : "processes"} will be stopped.
                    </p>
                  )}
                </div>

                {/* Footer with buttons */}
                <div className="bg-muted p-4 flex justify-between border-t border-border rounded-b-xl">
                  <Button
                    onClick={handleClose}
                    variant="ghost"
                    className="rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button
                    ref={confirmButtonRef}
                    onClick={handleConfirm}
                    variant="default"
                    className="rounded-md"
                  >
                    Archive
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}
