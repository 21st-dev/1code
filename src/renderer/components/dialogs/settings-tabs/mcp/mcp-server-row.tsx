"use client"

import { ChevronRight, Pencil } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "../../../ui/button"
import { Switch } from "../../../ui/switch"
import { cn } from "../../../../lib/utils"
import type { McpServer } from "./types"

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "connected" && "bg-foreground",
        status !== "connected" && "bg-muted-foreground/50",
        status === "pending" && "animate-pulse",
      )}
    />
  )
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
  isEditable = false,
  showToggle = false,
}: McpServerRowProps) {
  const { tools, needsAuth } = server
  const hasTools = tools.length > 0
  const isConnected = server.status === "connected"
  const isDisabled = server.config._disabled === true

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 p-3 transition-colors",
          hasTools && "cursor-pointer hover:bg-muted/50",
          !hasTools && "cursor-default",
        )}
      >
        {/* Expand button */}
        <button
          onClick={hasTools ? onToggle : undefined}
          className={cn(
            "flex-shrink-0",
            !hasTools && "opacity-0 pointer-events-none",
          )}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        </button>

        {/* Status dot */}
        <StatusDot status={server.status} />

        {/* Server info - clickable to expand */}
        <button
          onClick={hasTools ? onToggle : undefined}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-medium truncate",
              isDisabled ? "text-muted-foreground" : "text-foreground"
            )}>
              {server.name}
            </span>
            {server.serverInfo?.version && (
              <span className="text-xs text-muted-foreground">
                v{server.serverInfo.version}
              </span>
            )}
          </div>
          {server.error && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {server.error}
            </p>
          )}
        </button>

        {/* Status / tool count */}
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {isConnected
            ? hasTools
              ? `${tools.length} tool${tools.length !== 1 ? "s" : ""}`
              : "No tools"
            : getStatusText(server.status)}
        </span>

        {/* Authenticate button */}
        {needsAuth && onAuth && !isDisabled && (
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onAuth()
            }}
          >
            {isConnected ? "Reconnect" : "Auth"}
          </Button>
        )}

        {/* Edit button */}
        {isEditable && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Enable/Disable toggle */}
        {showToggle && onToggleEnabled && (
          <Switch
            checked={!isDisabled}
            onCheckedChange={(checked) => {
              onToggleEnabled(checked)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Expanded tools list */}
      <AnimatePresence>
        {isExpanded && hasTools && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-10 pr-3 pb-3 space-y-1">
              {tools.map((tool) => (
                <div
                  key={tool}
                  className="text-xs text-muted-foreground font-mono py-0.5"
                >
                  {tool}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
