"use client"

import { useState, useMemo } from "react"
import { Check, X, Copy } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { type ToolActivity } from "../../../lib/atoms"
import { cn } from "../../../lib/utils"
import { detectCommand } from "../../../lib/bash-command-utils"
import { CommandIcon } from "../../../lib/command-icons"

interface BashModalContentProps {
  activity: ToolActivity
}

function parseActivityData(activity: ToolActivity) {
  let input: { command?: string; description?: string } = {}
  let output: { stdout?: string; stderr?: string; exitCode?: number; exit_code?: number; output?: string } = {}

  try {
    if (activity.input) {
      input = JSON.parse(activity.input)
    }
  } catch {
    // Keep empty
  }

  try {
    if (activity.output) {
      output = JSON.parse(activity.output)
    }
  } catch {
    // Keep empty
  }

  return { input, output }
}

export function BashModalContent({ activity }: BashModalContentProps) {
  const [copied, setCopied] = useState(false)

  const { input, output } = useMemo(() => parseActivityData(activity), [activity])

  const command = input.command || ""
  const description = input.description || ""
  const stdout = output.stdout || output.output || ""
  const stderr = output.stderr || ""
  const exitCode = output.exitCode ?? output.exit_code

  const isSuccess = exitCode === 0
  const isError = exitCode !== undefined && exitCode !== 0
  const isRunning = activity.state === "running"

  // Detect command type for header display
  const detected = useMemo(() => detectCommand(command), [command])

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Description if provided */}
      {description && (
        <div className="text-sm text-muted-foreground">
          {description}
        </div>
      )}

      {/* Status badge */}
      <div className="flex items-center gap-2">
        {isRunning ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
            Running
          </span>
        ) : isSuccess ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" />
            Success
          </span>
        ) : isError ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium flex items-center gap-1">
            <X className="w-3 h-3" />
            Failed (exit code {exitCode})
          </span>
        ) : null}
      </div>

      {/* Terminal-style command display */}
      <div className="rounded-lg border border-border bg-zinc-950 dark:bg-zinc-900 overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            {/* Show detected command type */}
            {detected.type !== "unknown" && (
              <div className="flex items-center gap-1.5 text-zinc-400">
                <CommandIcon type={detected.type} size={14} />
                <span className="text-xs font-medium capitalize">
                  {detected.type}
                </span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
            onClick={handleCopyCommand}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Command and output */}
        <div className="p-3 max-h-[400px] overflow-y-auto">
          {/* Command */}
          <div className="font-mono text-sm">
            <span className="text-amber-500">$ </span>
            <span className="text-zinc-100 whitespace-pre-wrap break-all">
              {command}
            </span>
          </div>

          {/* Stdout */}
          {stdout && (
            <div className="mt-3 font-mono text-sm text-zinc-400 whitespace-pre-wrap break-all">
              {stdout}
            </div>
          )}

          {/* Stderr */}
          {stderr && (
            <div
              className={cn(
                "mt-3 font-mono text-sm whitespace-pre-wrap break-all",
                exitCode === 0 || exitCode === undefined
                  ? "text-amber-500"
                  : "text-rose-400",
              )}
            >
              {stderr}
            </div>
          )}

          {/* Running indicator */}
          {isRunning && !stdout && !stderr && (
            <div className="mt-3 text-sm text-zinc-500 italic">
              Command is still running...
            </div>
          )}
        </div>
      </div>

      {/* Error text if present */}
      {activity.errorText && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive whitespace-pre-wrap">
          {activity.errorText}
        </div>
      )}
    </div>
  )
}
