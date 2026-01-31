import { ChevronRight, Pencil } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "../../../ui/button"
import { Switch } from "../../../ui/switch"
import { cn } from "../../../../lib/utils"
import type { McpServer } from "./types"

function StatusDot({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
    case "failed":
      return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
    case "needs-auth":
      return <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
    case "pending":
      return <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
    case "disabled":
      return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
    default:
      return <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case "connected":
      return "Connected"
    case "failed":
      return "Failed"
    case "needs-auth":
      return "Needs auth"
    case "pending":
      return "Connecting..."
    case "disabled":
      return "Disabled"
    default:
      return status
  }
}

interface McpServerRowProps {
  server: McpServer
  isExpanded: boolean
  onToggle: () => void
  onAuth?: () => void
  onEdit?: () => void
  onToggleEnabled?: (enabled: boolean) => void
  isEditable?: boolean
  showToggle?: boolean
}

export function McpServerRow({
  server,
  isExpanded,
  onToggle,
  onAuth,
  onEdit,
  onToggleEnabled,
  isEditable = true,
  showToggle = false,
}: McpServerRowProps) {
  const isConnected = server.status === "connected"
  const hasTools = server.tools.length > 0
  const isDisabled = server.status === "disabled"

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
        <StatusDot status={server.status} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">
            {server.name}
          </span>
          {server.serverInfo?.version && (
            <span className="text-[10px] text-muted-foreground">
              v{server.serverInfo.version}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isConnected && hasTools
            ? `${server.tools.length} tool${server.tools.length !== 1 ? "s" : ""}`
            : getStatusText(server.status)}
        </span>
        {server.needsAuth && onAuth && (
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[11px] shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onAuth()
            }}
          >
            Auth
          </Button>
        )}
        {isEditable && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
        {showToggle && onToggleEnabled && (
          <Switch
            checked={!isDisabled}
            onCheckedChange={(checked) => {
              onToggleEnabled(checked)
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
        )}
      </button>

      {/* Expanded tools list */}
      <AnimatePresence initial={false}>
        {isExpanded && hasTools && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pt-0.5">
              <div className="border-t border-border pt-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Tools
                </p>
                <div className="flex flex-wrap gap-1">
                  {server.tools.map((tool) => {
                    const toolName = typeof tool === "string" ? tool : tool.name
                    return (
                      <span
                        key={toolName}
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {toolName}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      <AnimatePresence initial={false}>
        {isExpanded && server.error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5">
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2">
                <p className="text-[11px] text-red-400 font-mono break-all">
                  {server.error}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { StatusDot, getStatusText }
