"use client"

import { useCallback, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { GripVertical, Box, TerminalSquare, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { PlanIcon, DiffIcon, OriginalMCPIcon } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import {
  WIDGET_REGISTRY,
  widgetVisibilityAtomFamily,
  widgetOrderAtomFamily,
  type WidgetId,
} from "./atoms"

interface WidgetSettingsPopupProps {
  workspaceId: string
}

// Get the correct icon for each widget (matching details-sidebar.tsx)
function getWidgetIcon(widgetId: WidgetId) {
  switch (widgetId) {
    case "info":
      return Box
    case "todo":
      return ListTodo
    case "plan":
      return PlanIcon
    case "terminal":
      return TerminalSquare
    case "diff":
      return DiffIcon
    case "mcp":
      return OriginalMCPIcon
    default:
      return Box
  }
}

export function WidgetSettingsPopup({ workspaceId }: WidgetSettingsPopupProps) {
  const { t } = useI18n()
  const visibilityAtom = useMemo(
    () => widgetVisibilityAtomFamily(workspaceId),
    [workspaceId],
  )
  const orderAtom = useMemo(
    () => widgetOrderAtomFamily(workspaceId),
    [workspaceId],
  )
  const [visibleWidgets, setVisibleWidgets] = useAtom(visibilityAtom)
  const [widgetOrder, setWidgetOrder] = useAtom(orderAtom)

  // Drag state
  const [draggedWidget, setDraggedWidget] = useState<WidgetId | null>(null)
  const [dragOverWidget, setDragOverWidget] = useState<WidgetId | null>(null)
  const [draggableWidget, setDraggableWidget] = useState<WidgetId | null>(null)

  const toggleWidget = useCallback(
    (widgetId: WidgetId) => {
      if (visibleWidgets.includes(widgetId)) {
        setVisibleWidgets(visibleWidgets.filter((id) => id !== widgetId))
      } else {
        // Add widget - preserve current order
        const newVisibleWidgets = [...visibleWidgets, widgetId]
        // Sort by widgetOrder
        newVisibleWidgets.sort(
          (a, b) => widgetOrder.indexOf(a) - widgetOrder.indexOf(b),
        )
        setVisibleWidgets(newVisibleWidgets)
      }
    },
    [visibleWidgets, setVisibleWidgets, widgetOrder],
  )

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, widgetId: WidgetId) => {
      setDraggedWidget(widgetId)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", widgetId)
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, widgetId: WidgetId) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      if (draggedWidget && draggedWidget !== widgetId) {
        setDragOverWidget(widgetId)
      }
    },
    [draggedWidget],
  )

  const handleDragLeave = useCallback(() => {
    setDragOverWidget(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetWidgetId: WidgetId) => {
      e.preventDefault()
      if (!draggedWidget || draggedWidget === targetWidgetId) {
        setDraggedWidget(null)
        setDragOverWidget(null)
        return
      }

      // Reorder widgets
      const newOrder = [...widgetOrder]
      const draggedIndex = newOrder.indexOf(draggedWidget)
      const targetIndex = newOrder.indexOf(targetWidgetId)

      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Remove dragged widget from its position
        newOrder.splice(draggedIndex, 1)
        // Insert at target position
        newOrder.splice(targetIndex, 0, draggedWidget)
        setWidgetOrder(newOrder)

        // Also update visible widgets order
        const newVisibleWidgets = visibleWidgets.slice().sort(
          (a, b) => newOrder.indexOf(a) - newOrder.indexOf(b),
        )
        setVisibleWidgets(newVisibleWidgets)
      }

      setDraggedWidget(null)
      setDragOverWidget(null)
    },
    [draggedWidget, widgetOrder, visibleWidgets, setWidgetOrder, setVisibleWidgets],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedWidget(null)
    setDragOverWidget(null)
  }, [])

  // Get widgets in current order
  const orderedWidgets = useMemo(() => {
    return [...WIDGET_REGISTRY].sort(
      (a, b) => widgetOrder.indexOf(a.id) - widgetOrder.indexOf(b.id),
    )
  }, [widgetOrder])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors rounded-md"
        >
          {t("details.editWidgets")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-2"
        sideOffset={8}
      >
        <div className="space-y-1">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("details.widgets")}
          </div>
          {orderedWidgets.map((widget) => {
            const isVisible = visibleWidgets.includes(widget.id)
            const Icon = getWidgetIcon(widget.id)
            const isDragging = draggedWidget === widget.id
            const isDragOver = dragOverWidget === widget.id

            return (
              <div
                key={widget.id}
                draggable={draggableWidget === widget.id}
                onDragStart={(e) => handleDragStart(e, widget.id)}
                onDragOver={(e) => handleDragOver(e, widget.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, widget.id)}
                onDragEnd={() => { handleDragEnd(); setDraggableWidget(null) }}
                onClick={() => toggleWidget(widget.id)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer",
                  isDragging && "opacity-50",
                  isDragOver && "bg-muted/80 ring-1 ring-primary/50",
                )}
              >
                <GripVertical
                  className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 cursor-grab active:cursor-grabbing"
                  onMouseDown={() => setDraggableWidget(widget.id)}
                  onMouseUp={() => setDraggableWidget(null)}
                  onClick={(e) => e.stopPropagation()}
                />
                <Checkbox
                  checked={isVisible}
                  onCheckedChange={() => toggleWidget(widget.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 pointer-events-none"
                />
                <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm flex-1">{t(widget.labelKey)}</span>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
