"use client"

import { useState } from "react"
import { useAtom } from "jotai"
import { Upload, X } from "lucide-react"
import { feedbackDialogOpenAtom } from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Dialog, DialogContent } from "../ui/dialog"
import { toast } from "sonner"

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "enhancement", label: "Enhancement" },
  { value: "idea", label: "Idea" },
  { value: "usability", label: "Usability" },
  { value: "other", label: "Other" },
] as const

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const

export function FeedbackDialog() {
  const [isOpen, setIsOpen] = useAtom(feedbackDialogOpenAtom)
  const [type, setType] = useState<(typeof FEEDBACK_TYPES)[number]["value"]>(
    "idea",
  )
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["value"]>(
    "medium",
  )
  const [description, setDescription] = useState("")
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createMutation = trpc.feedback.create.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted - thank you!")
      handleClose()
    },
    onError: (error) => {
      toast.error(`Failed to submit: ${error.message}`)
      setIsSubmitting(false)
    },
  })

  const handleClose = () => {
    setIsOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (description.length < 10) {
      toast.error("Description must be at least 10 characters")
      return
    }

    setIsSubmitting(true)
    try {
      await createMutation.mutateAsync({
        type,
        priority,
        description,
        screenshots,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleScreenshotUpload = async () => {
    // Use electron's dialog to select images via desktopApi
    const result = await window.desktopApi.showOpenDialog({
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif"] }],
      properties: ["multiSelections"],
    })

    if (!result.canceled && result.filePaths.length > 0) {
      // Copy each file to userData directory and store relative paths
      const newScreenshots: string[] = []
      for (const filePath of result.filePaths) {
        try {
          const relativePath = await window.desktopApi.copyFeedbackScreenshot(filePath)
          newScreenshots.push(relativePath)
        } catch (error) {
          console.error("[Feedback] Failed to copy screenshot:", error)
          // Fallback to original path if copy fails
          newScreenshots.push(filePath)
        }
      }
      setScreenshots((prev) => [...prev, ...newScreenshots])
    }
  }

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index))
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      // Reset form when dialog closes
      setType("idea")
      setPriority("medium")
      setDescription("")
      setScreenshots([])
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[500px]">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Submit Feedback</h2>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as typeof type)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as typeof priority)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us more about your feedback..."
                className="min-h-[120px] resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length}/2000
              </p>
            </div>

            {/* Screenshots */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Screenshots (optional)</label>
              <div className="flex flex-wrap gap-2">
                {screenshots.map((path, index) => (
                  <div key={index} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`file://${path}`}
                      alt={`Screenshot ${index + 1}`}
                      className="h-20 w-20 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleScreenshotUpload}
                  className="h-20 w-20 flex items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors"
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || description.length < 10}
              >
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
