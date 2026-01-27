"use client"

import { useAtom } from "jotai"
import { Copy, Check, CircleCheck } from "lucide-react"
import { useState } from "react"
import {
  feedbackListDialogOpenAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import {
  Dialog,
  DialogContent,
} from "../ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { toast } from "sonner"

type FeedbackType = "bug" | "feature" | "enhancement" | "idea" | "usability" | "other"
type FeedbackPriority = "low" | "medium" | "high" | "critical"

// Type for feedback item returned from tRPC
interface FeedbackItem {
  id: string
  type: FeedbackType
  priority: FeedbackPriority
  description: string
  screenshots: string
  resolved: boolean
  createdAt: Date | null
  updatedAt: Date | null
}

const PRIORITY_COLORS: Record<FeedbackPriority, string> = {
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug",
  feature: "Feature",
  enhancement: "Enhancement",
  idea: "Idea",
  usability: "Usability",
  other: "Other",
}

const PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}

export function FeedbackListDialog() {
  const [isOpen, setIsOpen] = useAtom(feedbackListDialogOpenAtom)
  const [filterType, setFilterType] = useState<FeedbackType | "all">("all")
  const [filterResolved, setFilterResolved] = useState<"all" | "resolved" | "unresolved">("all")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: feedbackList, refetch } = trpc.feedback.list.useQuery(
    {
      type: filterType === "all" ? undefined : filterType,
      resolved: filterResolved === "all" ? undefined : filterResolved === "resolved",
    },
    { enabled: isOpen },
  )

  const resolveMutation = trpc.feedback.resolve.useMutation({
    onSuccess: () => {
      toast.success("Feedback marked as resolved")
      refetch()
    },
    onError: (error) => {
      toast.error(`Failed to resolve: ${error.message}`)
    },
  })

  const handleClose = () => {
    setIsOpen(false)
  }

  const handleCopyJson = (item: FeedbackItem) => {
    const json = JSON.stringify(
      {
        id: item.id,
        type: item.type,
        priority: item.priority,
        description: item.description,
        screenshots: JSON.parse(item.screenshots || "[]"),
        resolved: item.resolved,
        createdAt: item.createdAt?.toISOString(),
        updatedAt: item.updatedAt?.toISOString(),
      },
      null,
      2,
    )
    navigator.clipboard.writeText(json)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleResolve = (id: string) => {
    resolveMutation.mutate({ id })
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[75vw] max-w-6xl max-h-[85vh] h-[85vh]">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b">
            <h2 className="text-lg font-semibold">Feedback List</h2>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Type:</label>
              <Select
                value={filterType}
                onValueChange={(v) => setFilterType(v as FeedbackType | "all")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="enhancement">Enhancement</SelectItem>
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="usability">Usability</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select
                value={filterResolved}
                onValueChange={(v) => setFilterResolved(v as "all" | "resolved" | "unresolved")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <div className="text-sm text-muted-foreground">
              {feedbackList?.length || 0} items
            </div>
          </div>

          {/* Table */}
          <ScrollArea className="flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Priority</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feedbackList?.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted">
                        {TYPE_LABELS[item.type as FeedbackType]}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          PRIORITY_COLORS[item.priority as FeedbackPriority]
                        }`}
                      >
                        {PRIORITY_LABELS[item.priority as FeedbackPriority]}
                      </span>
                    </td>
                    <td className="p-3 max-w-md">
                      <p className="truncate">{item.description}</p>
                    </td>
                    <td className="p-3">
                      {item.resolved ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CircleCheck className="h-4 w-4" />
                          Resolved
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Open</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyJson(item)}
                          title="Copy as JSON"
                        >
                          {copiedId === item.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        {!item.resolved && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResolve(item.id)}
                            disabled={resolveMutation.isPending}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!feedbackList || feedbackList.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No feedback found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
