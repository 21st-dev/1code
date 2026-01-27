import { Calendar, Database, Download, FolderOpen, MessageSquare, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Dialog, DialogContent } from "../../ui/dialog"
import { cn } from "../../../lib/utils"

interface UsageDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ViewMode = "date" | "model" | "project" | "subchat"

// Helper to format token count
function formatTokenCount(tokens: number): string {
  if (!tokens) return "0"
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

// Helper to format cost
function formatCost(cost: number): string {
  if (!cost) return "$0.00"
  return `$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`
}

// Get default start date (30 days ago)
function getDefaultStartDate(): string {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().split("T")[0]!
}

// Tab button component
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

// Usage table component
interface UsageTableProps {
  data: any[]
  columns: Array<{
    key: string
    label: string
    format?: (value: any) => string
    fallback?: string
  }>
}

function UsageTable({ data, columns }: UsageTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No usage data found for the selected period.
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2 text-left font-medium text-muted-foreground"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className="border-t border-border hover:bg-muted/30 transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2">
                  {col.format
                    ? col.format(row[col.key])
                    : row[col.key] || col.fallback || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// CSV export helper
function exportToCsv(data: any[], columns: Array<{ key: string; label: string }>, filename: string) {
  if (!data || data.length === 0) {
    toast.error("No data to export")
    return
  }

  // Build CSV header
  const header = columns.map((col) => col.label).join(",")

  // Build CSV rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key]
        // Handle null/undefined
        if (value === null || value === undefined) return ""
        // Escape quotes and wrap in quotes if contains comma
        const strValue = String(value)
        if (strValue.includes(",") || strValue.includes('"') || strValue.includes("\n")) {
          return `"${strValue.replace(/"/g, '""')}"`
        }
        return strValue
      })
      .join(",")
  )

  const csvContent = [header, ...rows].join("\n")

  // Create and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  toast.success(`Exported ${data.length} rows to ${filename}`)
}

export function UsageDetailsDialog({
  open,
  onOpenChange,
}: UsageDetailsDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("date")
  const [dateRange, setDateRange] = useState({
    startDate: getDefaultStartDate(),
    endDate: new Date().toISOString().split("T")[0]!,
  })

  // Data queries
  const { data: byDate, isLoading: byDateLoading } =
    trpc.usage.getByDate.useQuery(dateRange, {
      enabled: open && viewMode === "date",
    })
  const { data: byModel, isLoading: byModelLoading } =
    trpc.usage.getByModel.useQuery(dateRange, {
      enabled: open && viewMode === "model",
    })
  const { data: byProject, isLoading: byProjectLoading } =
    trpc.usage.getByProject.useQuery(dateRange, {
      enabled: open && viewMode === "project",
    })
  const { data: bySubChat, isLoading: bySubChatLoading } =
    trpc.usage.getBySubChat.useQuery(dateRange, {
      enabled: open && viewMode === "subchat",
    })

  const isLoading =
    (viewMode === "date" && byDateLoading) ||
    (viewMode === "model" && byModelLoading) ||
    (viewMode === "project" && byProjectLoading) ||
    (viewMode === "subchat" && bySubChatLoading)

  // Handle CSV export
  const handleExport = () => {
    const timestamp = new Date().toISOString().split("T")[0]

    switch (viewMode) {
      case "date":
        exportToCsv(
          byDate || [],
          [
            { key: "date", label: "Date" },
            { key: "totalInputTokens", label: "Input Tokens" },
            { key: "totalOutputTokens", label: "Output Tokens" },
            { key: "totalTokens", label: "Total Tokens" },
            { key: "totalCostUsd", label: "Cost (USD)" },
            { key: "count", label: "Requests" },
          ],
          `usage-by-date-${timestamp}.csv`
        )
        break
      case "model":
        exportToCsv(
          byModel || [],
          [
            { key: "model", label: "Model" },
            { key: "totalInputTokens", label: "Input Tokens" },
            { key: "totalOutputTokens", label: "Output Tokens" },
            { key: "totalTokens", label: "Total Tokens" },
            { key: "totalCostUsd", label: "Cost (USD)" },
            { key: "count", label: "Requests" },
          ],
          `usage-by-model-${timestamp}.csv`
        )
        break
      case "project":
        exportToCsv(
          byProject || [],
          [
            { key: "projectName", label: "Project" },
            { key: "totalInputTokens", label: "Input Tokens" },
            { key: "totalOutputTokens", label: "Output Tokens" },
            { key: "totalTokens", label: "Total Tokens" },
            { key: "totalCostUsd", label: "Cost (USD)" },
            { key: "count", label: "Requests" },
          ],
          `usage-by-project-${timestamp}.csv`
        )
        break
      case "subchat":
        exportToCsv(
          bySubChat || [],
          [
            { key: "subChatName", label: "Agent" },
            { key: "chatName", label: "Workspace" },
            { key: "projectName", label: "Project" },
            { key: "totalInputTokens", label: "Input Tokens" },
            { key: "totalOutputTokens", label: "Output Tokens" },
            { key: "totalTokens", label: "Total Tokens" },
            { key: "totalCostUsd", label: "Cost (USD)" },
            { key: "count", label: "Requests" },
          ],
          `usage-by-agent-${timestamp}.csv`
        )
        break
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      )
    }

    switch (viewMode) {
      case "date":
        return (
          <UsageTable
            data={byDate || []}
            columns={[
              { key: "date", label: "Date" },
              {
                key: "totalInputTokens",
                label: "Input",
                format: formatTokenCount,
              },
              {
                key: "totalOutputTokens",
                label: "Output",
                format: formatTokenCount,
              },
              {
                key: "totalTokens",
                label: "Total",
                format: formatTokenCount,
              },
              { key: "totalCostUsd", label: "Cost", format: formatCost },
              { key: "count", label: "Requests" },
            ]}
          />
        )
      case "model":
        return (
          <UsageTable
            data={byModel || []}
            columns={[
              { key: "model", label: "Model" },
              {
                key: "totalInputTokens",
                label: "Input",
                format: formatTokenCount,
              },
              {
                key: "totalOutputTokens",
                label: "Output",
                format: formatTokenCount,
              },
              {
                key: "totalTokens",
                label: "Total",
                format: formatTokenCount,
              },
              { key: "totalCostUsd", label: "Cost", format: formatCost },
              { key: "count", label: "Requests" },
            ]}
          />
        )
      case "project":
        return (
          <UsageTable
            data={byProject || []}
            columns={[
              { key: "projectName", label: "Project", fallback: "Unknown" },
              {
                key: "totalInputTokens",
                label: "Input",
                format: formatTokenCount,
              },
              {
                key: "totalOutputTokens",
                label: "Output",
                format: formatTokenCount,
              },
              {
                key: "totalTokens",
                label: "Total",
                format: formatTokenCount,
              },
              { key: "totalCostUsd", label: "Cost", format: formatCost },
              { key: "count", label: "Requests" },
            ]}
          />
        )
      case "subchat":
        return (
          <UsageTable
            data={bySubChat || []}
            columns={[
              { key: "subChatName", label: "Agent", fallback: "Unnamed" },
              { key: "chatName", label: "Workspace", fallback: "Unnamed" },
              { key: "projectName", label: "Project", fallback: "Unknown" },
              {
                key: "totalTokens",
                label: "Tokens",
                format: formatTokenCount,
              },
              { key: "totalCostUsd", label: "Cost", format: formatCost },
            ]}
          />
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[90vw] h-[80vh] p-0 gap-0 flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Usage Details</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* View Mode Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <TabButton
              active={viewMode === "date"}
              onClick={() => setViewMode("date")}
              icon={Calendar}
              label="By Date"
            />
            <TabButton
              active={viewMode === "model"}
              onClick={() => setViewMode("model")}
              icon={Database}
              label="By Model"
            />
            <TabButton
              active={viewMode === "project"}
              onClick={() => setViewMode("project")}
              icon={FolderOpen}
              label="By Project"
            />
            <TabButton
              active={viewMode === "subchat"}
              onClick={() => setViewMode("subchat")}
              icon={MessageSquare}
              label="By Agent"
            />
          </div>

          {/* Date Range Picker and Export */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">From:</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  className="px-2 py-1 text-sm border rounded bg-background"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">To:</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  className="px-2 py-1 text-sm border rounded bg-background"
                />
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={isLoading}
            >
              <Download className="h-3 w-3 mr-1" />
              Export CSV
            </Button>
          </div>

          {/* Table */}
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
