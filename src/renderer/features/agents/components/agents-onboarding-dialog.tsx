"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import { createPortal } from "react-dom"
// Desktop: stub for next/image
const Image = ({ src, alt, width, height, className }: any) => <img src={src} alt={alt} width={width} height={height} className={className} />
import { useTheme } from "next-themes"
import { X } from "lucide-react"
import { useAtom } from "jotai"
import { Button } from "../../../components/ui/button"
import { agentsDebugModeAtom } from "../atoms"
import { useI18n } from "../../../lib/i18n"

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const

const ONBOARDING_STORAGE_KEY = "agents-onboarding-seen"

// Self-contained onboarding dialog that checks localStorage
// Shows only the welcome screen - full onboarding is at /agents/onboarding
export function AgentsOnboardingDialog() {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const openAtRef = useRef<number>(0)
  const { resolvedTheme } = useTheme()
  const [debugMode, setDebugMode] = useAtom(agentsDebugModeAtom)

  useEffect(() => {
    setMounted(true)

    // Check if debug mode wants to reset onboarding
    if (debugMode.enabled && debugMode.resetOnboarding) {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY)
      // Reset the flag to prevent infinite loops
      setDebugMode((prev) => ({ ...prev, resetOnboarding: false }))
    }

    // Check localStorage on mount
    const hasSeenOnboarding = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!hasSeenOnboarding) {
      setIsOpen(true)
    }
  }, [debugMode.enabled, debugMode.resetOnboarding, setDebugMode])

  useEffect(() => {
    if (isOpen) {
      openAtRef.current = performance.now()
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    const canInteract = performance.now() - openAtRef.current > 250
    if (!canInteract) return

    // Mark onboarding as seen
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true")
    setIsOpen(false)
  }, [])

  // Handle ESC key to close dialog
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        handleClose()
      } else if (e.key === "Enter") {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleClose])

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
            className="fixed inset-0 z-[45] bg-black/40"
            onClick={handleClose}
            style={{ pointerEvents: "auto" }}
            data-modal="agents-onboarding"
          />

          {/* Main Dialog */}
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASING_CURVE }}
              className="w-[90vw] max-w-[384px] pointer-events-auto relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden" data-canvas-dialog>
                {/* Close Button */}
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute appearance-none outline-none select-none top-4 right-4 rounded-full cursor-pointer flex items-center justify-center ring-offset-background focus:ring-ring bg-secondary h-8 w-8 text-foreground/70 hover:text-foreground focus:outline-hidden disabled:pointer-events-none active:scale-95 transition-all duration-200 ease-in-out z-[60] focus:outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t("common.close")}</span>
                </button>

                  <div className="flex flex-col">
                    {/* Images Section */}
                    <div className="bg-primary px-5 pt-10 flex items-start justify-center">
                      <div className="relative w-full flex items-start justify-center pt-4">
                        {/* Container showing only top 70% of image (16/7 aspect ratio = 70% of 16/10) */}
                        <div
                          className="relative w-full overflow-hidden rounded-t-lg border"
                          style={{ aspectRatio: "16/7", maxHeight: "126px" }}
                        >
                          <div
                            className="absolute inset-0"
                            style={{ height: "142.86%", top: 0 }}
                          >
                            <Image
                              src={
                                resolvedTheme === "dark"
                                  ? "/agents-onboarding-dark.webp"
                                  : "/agents-onboarding-light.webp"
                              }
                              alt={t("agent.onboarding.imageAlt")}
                              fill
                              className="object-cover"
                              style={{ objectPosition: "top" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 space-y-2">
                      <h2 className="text-base font-semibold">
                        {t("agent.onboarding.title")}
                      </h2>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">
                        {t("agent.onboarding.description")}
                      </p>

                      {/* Button - bottom right */}
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                        onClick={handleClose}
                        className="h-7 text-xs rounded-md"
                        >
                          {t("agent.onboarding.letsGo")}
                        </Button>
                      </div>
                    </div>
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
