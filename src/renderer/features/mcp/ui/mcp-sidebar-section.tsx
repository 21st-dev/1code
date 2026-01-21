"use client"

import React from "react"
import { Plug } from "lucide-react"
import { useAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedMcpCategoryAtom } from "../atoms"

interface McpSidebarSectionProps {
  className?: string
}

export function McpSidebarSection({ className }: McpSidebarSectionProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(selectedMcpCategoryAtom)

  const handleClick = () => {
    // Toggle: if clicking the active category, deselect it
    if (selectedCategory === "mcp") {
      setSelectedCategory(null)
    } else {
      setSelectedCategory("mcp")
    }
  }

  return (
    <div className={cn("border-t border-border/50 py-2", className)}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory === "mcp"
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Plug className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">MCPs</span>
      </button>
    </div>
  )
}
