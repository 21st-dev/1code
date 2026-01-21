import { useEffect, useMemo } from "react"
import { AnimatePresence, motion } from "motion/react"
import { createPortal } from "react-dom"
import { useAtomValue } from "jotai"
import { CmdIcon } from "../../icons"
import { ctrlTabTargetAtom } from "../../lib/atoms"

interface AgentsShortcutsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const

interface Shortcut {
  label: string
  keys: Array<string>
  altKeys?: Array<string>
}

function ShortcutKey({ keyName }: { keyName: string }) {
  if (keyName === "cmd") {
    return (
      <kbd className="inline-flex h-5 min-w-5 min-h-5 max-h-full items-center justify-center rounded border border-muted bg-secondary px-1 font-[inherit] text-[11px] font-normal text-secondary-foreground">
        <CmdIcon className="h-2.5 w-2.5" />
      </kbd>
    )
  }

  return (
    <kbd className="inline-flex h-5 min-w-5 min-h-5 max-h-full items-center justify-center rounded border border-muted bg-secondary px-1 font-[inherit] text-[11px] font-normal text-secondary-foreground">
      {keyName === "opt"
        ? "⌥"
        : keyName === "shift"
          ? "⇧"
          : keyName === "ctrl"
            ? "⌃"
            : keyName}
    </kbd>
  )
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{shortcut.label}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, index) => (
          <ShortcutKey key={index} keyName={key} />
        ))}
        {shortcut.altKeys && (
          <>
            <span className="text-xs text-muted-foreground mx-0.5">or</span>
            {shortcut.altKeys.map((key, index) => (
              <ShortcutKey key={`alt-${index}`} keyName={key} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// Desktop app shortcuts (simplified)
const GENERAL_SHORTCUTS: Shortcut[] = [
  { label: "Show shortcuts", keys: ["?"] },
  { label: "Settings", keys: ["cmd", ","] },
  { label: "Toggle sidebar", keys: ["cmd", "\\"] },
  { label: "Undo archive", keys: ["cmd", "Z"] },
]

// Dynamic shortcuts based on ctrlTabTarget preference
function getWorkspaceShortcuts(
  ctrlTabTarget: "workspaces" | "agents",
): Shortcut[] {
  return [
    { label: "New workspace", keys: ["cmd", "N"] },
    { label: "Search workspaces", keys: ["cmd", "K"] },
    { label: "Archive current workspace", keys: ["cmd", "E"] },
    {
      label: "Quick switch workspaces",
      keys:
        ctrlTabTarget === "workspaces" ? ["ctrl", "Tab"] : ["opt", "ctrl", "Tab"],
    },
  ]
}

function getAgentShortcuts(
  ctrlTabTarget: "workspaces" | "agents",
): Shortcut[] {
  return [
    // Creation & Management (mirrors Workspaces order)
    { label: "Create new agent", keys: ["cmd", "T"] },
    { label: "Search chats", keys: ["/"] },
    { label: "Search text in current chat", keys: ["cmd", "F"] },
    { label: "Archive current agent", keys: ["cmd", "W"] },
    // Navigation
    {
      label: "Quick switch agents",
      keys:
        ctrlTabTarget === "workspaces" ? ["opt", "ctrl", "Tab"] : ["ctrl", "Tab"],
    },
    {
      label: "Previous / Next agent",
      keys: ["cmd", "["],
      altKeys: ["cmd", "]"],
    },
    // Interaction
    { label: "Focus input", keys: ["Enter"] },
    { label: "Toggle focus", keys: ["cmd", "Esc"] },
    { label: "Stop generation", keys: ["Esc"], altKeys: ["ctrl", "C"] },
    { label: "Switch model", keys: ["cmd", "/"] },
    // Tools
    { label: "Toggle terminal", keys: ["cmd", "J"] },
    { label: "Open diff", keys: ["cmd", "D"] },
    { label: "Create PR", keys: ["cmd", "P"] },
  ]
}

export function AgentsShortcutsDialog({
  isOpen,
  onClose,
}: AgentsShortcutsDialogProps) {
  const ctrlTabTarget = useAtomValue(ctrlTabTargetAtom)

  // Memoize shortcuts based on preference
  const workspaceShortcuts = useMemo(
    () => getWorkspaceShortcuts(ctrlTabTarget),
    [ctrlTabTarget],
  )
  const agentShortcuts = useMemo(
    () => getAgentShortcuts(ctrlTabTarget),
    [ctrlTabTarget],
  )

  // Handle ESC key to close dialog
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

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
            onClick={onClose}
            style={{ pointerEvents: "auto" }}
            data-modal="agents-shortcuts"
          />

          {/* Main Dialog */}
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASING_CURVE }}
              className="w-[90vw] max-w-[420px] lg:max-w-[720px] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden" data-canvas-dialog>
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-5 text-center">
                    Keyboard Shortcuts
                  </h2>

                  {/* Two-column layout: General+Workspaces | Agents */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                    {/* Left column: General + Workspaces */}
                    <div className="space-y-6">
                      {/* General Section */}
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          General
                        </h3>
                        <div className="space-y-1.5">
                          {GENERAL_SHORTCUTS.map((shortcut, index) => (
                            <ShortcutRow key={index} shortcut={shortcut} />
                          ))}
                        </div>
                      </div>

                      {/* Workspaces Section */}
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Workspaces
                        </h3>
                        <div className="space-y-1.5">
                          {workspaceShortcuts.map((shortcut, index) => (
                            <ShortcutRow key={index} shortcut={shortcut} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right column: Agents */}
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Agents
                      </h3>
                      <div className="space-y-1.5">
                        {agentShortcuts.map((shortcut, index) => (
                          <ShortcutRow key={index} shortcut={shortcut} />
                        ))}
                      </div>
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
