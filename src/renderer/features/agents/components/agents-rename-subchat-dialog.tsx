"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { useI18n } from "../../../lib/i18n"

interface AgentsRenameSubChatDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
  currentName: string
  isLoading?: boolean
}

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const
const INTERACTION_DELAY_MS = 250

export function AgentsRenameSubChatDialog({
  isOpen,
  onClose,
  onSave,
  currentName,
  isLoading = false,
}: AgentsRenameSubChatDialogProps) {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(false)
  const [name, setName] = useState(currentName)
  const [isSaving, setIsSaving] = useState(false)
  const openAtRef = useRef<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      openAtRef.current = performance.now()
      setName(currentName)
    }
  }, [isOpen, currentName])

  const handleAnimationComplete = () => {
    // Focus and select input after animation completes (only if still open)
    if (isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        handleClose()
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        handleSave()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, name])

  const handleClose = () => {
    const canInteract = performance.now() - openAtRef.current > INTERACTION_DELAY_MS
    if (!canInteract || isSaving) return
    onClose()
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName === currentName) {
      handleClose()
      return
    }
    
    setIsSaving(true)
    try {
      await onSave(trimmedName)
      handleClose()
    } catch {
      // Error is already handled by parent (toast), keep dialog open
    } finally {
      setIsSaving(false)
    }
  }

  if (!mounted) return null

  const portalTarget = typeof document !== "undefined" ? document.body : null
  if (!portalTarget) return null

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
            data-modal="agents-rename-subchat"
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
                    {t("agent.chat.renameChat")}
                  </h2>

                  {/* Input */}
                  <Input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("agent.chat.chatName")}
                    className="w-full h-11 text-sm"
                    disabled={isSaving || isLoading}
                  />
                </div>

                {/* Footer with buttons */}
                <div className="bg-muted p-4 flex justify-between border-t border-border rounded-b-xl">
                  <Button
                    onClick={handleClose}
                    variant="ghost"
                    disabled={isSaving || isLoading}
                    className="rounded-md"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleSave}
                    variant="default"
                    disabled={!name.trim() || name.trim() === currentName || isSaving || isLoading}
                    className="rounded-md"
                  >
                    {isSaving || isLoading ? t("common.saving") : t("common.save")}
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
