"use client"

import { trpc } from "@/lib/trpc"
import { IconSpinner } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"
import { toast } from "sonner"

interface PrCommentsListProps {
  chatId: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function buildCopyText(c: {
  author: string
  createdAt: string
  body: string
  path?: string | null
  diffHunk?: string | null
}): string {
  const header = `${c.author} · ${new Date(c.createdAt).toLocaleString()}${
    c.path ? `\n${c.path}` : ""
  }`
  const hunk = c.diffHunk ? `\n\n${c.diffHunk}` : ""
  return `${header}\n\n${c.body}${hunk}`
}

export function PrCommentsList({ chatId }: PrCommentsListProps) {
  const { data, isLoading, isError, error } = trpc.chats.getPrComments.useQuery(
    { chatId },
    { refetchInterval: 60_000, enabled: !!chatId },
  )

  if (isLoading) {
    return (
      <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/50">
        <IconSpinner className="h-3.5 w-3.5" />
        Loading comments…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground border-t border-border/50">
        Couldn't load comments: {error?.message}
      </div>
    )
  }

  const comments = data ?? []
  if (comments.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground border-t border-border/50">
        No comments yet.
      </div>
    )
  }

  const copyAll = async () => {
    const text = comments.map(buildCopyText).join("\n\n---\n\n")
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${comments.length} comment${comments.length === 1 ? "" : "s"}`)
  }

  const copyOne = async (c: (typeof comments)[number]) => {
    await navigator.clipboard.writeText(buildCopyText(c))
    toast.success("Comment copied")
  }

  return (
    <div className="border-t border-border/50">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {comments.length} comment{comments.length === 1 ? "" : "s"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyAll}
          className="h-6 px-2 text-[11px] gap-1"
        >
          <Copy className="h-3 w-3" />
          Copy all
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border/40">
        {comments.map((c) => (
          <li key={`${c.kind}-${c.id}`} className="px-3 py-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                <span className="font-medium text-foreground truncate">
                  {c.author}
                </span>
                <span>·</span>
                <span>{relativeTime(c.createdAt)}</span>
                {c.kind === "review" && (
                  <span className="px-1 py-0.5 rounded bg-muted/60 text-[10px] font-mono flex-shrink-0">
                    review
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => copyOne(c)}
                className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent flex-shrink-0"
                aria-label="Copy comment"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            {c.path && (
              <div className="text-[11px] font-mono text-muted-foreground truncate">
                {c.path}
                {c.line ? `:${c.line}` : ""}
              </div>
            )}
            {c.diffHunk && (
              <pre className="text-[10px] font-mono bg-muted/40 rounded border border-border/40 px-2 py-1 overflow-x-auto whitespace-pre">
                {c.diffHunk}
              </pre>
            )}
            <div className="text-xs whitespace-pre-wrap break-words">
              {c.body}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
