"use client"

import {
  Database,
  Eye,
  FileCode2,
  FolderSearch,
  GitBranch,
  List,
  ListTodo,
  LogOut,
  Minimize2,
  Plus,
  RefreshCw,
  Server,
  Terminal,
  XCircle,
} from "lucide-react"
import {
  CustomTerminalIcon,
  EyeIcon,
  GlobeIcon,
  IconEditFile,
  PlanningIcon,
  SearchIcon,
  SparklesIcon,
  WriteFileIcon,
} from "../../../components/ui/icons"

export type ToolVariant = "simple" | "collapsible"

export interface ToolMeta {
  icon: React.ComponentType<{ className?: string }>
  title: (part: any) => string
  subtitle?: (part: any) => string
  tooltipContent?: (part: any, projectPath?: string) => string
  variant: ToolVariant
}

export function getToolStatus(part: any, chatStatus?: string) {
  const basePending =
    part.state !== "output-available" && part.state !== "output-error" && part.state !== "result"
  const isError =
    part.state === "output-error" ||
    (part.state === "output-available" && part.output?.success === false)
  const isSuccess = part.state === "output-available" && !isError
  // Critical: if chat stopped streaming, pending tools should show as complete
  // Include "submitted" status - this is when request was sent but streaming hasn't started yet
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isPending = basePending && isActivelyStreaming
  // Tool was in progress but chat stopped streaming (user interrupted)
  const isInterrupted = basePending && !isActivelyStreaming && chatStatus !== undefined

  return { isPending, isError, isSuccess, isInterrupted }
}

// Utility to get clean display path (remove sandbox/worktree/absolute prefixes)
// projectPath: optional absolute path to the project root, used to compute relative paths
export function getDisplayPath(filePath: string, projectPath?: string): string {
  if (!filePath) return ""

  // If projectPath is provided, strip it to get a project-relative path
  if (projectPath && filePath.startsWith(projectPath)) {
    const relative = filePath.slice(projectPath.length).replace(/^\//, "")
    return relative || filePath.split("/").pop() || filePath
  }

  const prefixes = [
    "/project/sandbox/repo/",
    "/project/sandbox/",
    "/project/",
    "/workspace/",
  ]
  for (const prefix of prefixes) {
    if (filePath.startsWith(prefix)) {
      return filePath.slice(prefix.length)
    }
  }
  // Handle worktree paths: /.21st/worktrees/{chatId}/{subChatId}/relativePath
  const worktreeMatch = filePath.match(/\.21st\/worktrees\/[^/]+\/[^/]+\/(.+)$/)
  if (worktreeMatch) {
    return worktreeMatch[1]
  }
  // Handle claude-sessions paths: .../claude-sessions/{sessionId}/{folder}/{file}
  const sessionMatch = filePath.match(/claude-sessions\/[^/]+\/(.+)$/)
  if (sessionMatch) {
    return sessionMatch[1]
  }
  if (filePath.startsWith("/")) {
    const parts = filePath.split("/")
    const rootIndicators = ["apps", "packages", "src", "lib", "components"]
    const rootIndex = parts.findIndex((p: string) =>
      rootIndicators.includes(p),
    )
    if (rootIndex > 0) {
      return parts.slice(rootIndex).join("/")
    }
    // For other absolute paths, show last 3 segments to keep it short
    if (parts.length > 3) {
      return parts.slice(-3).join("/")
    }
  }
  return filePath
}

// Utility to calculate diff stats
function calculateDiffStats(oldString: string, newString: string) {
  const oldLines = oldString.split("\n")
  const newLines = newString.split("\n")
  const maxLines = Math.max(oldLines.length, newLines.length)
  let addedLines = 0
  let removedLines = 0

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine !== undefined && newLine !== undefined) {
      if (oldLine !== newLine) {
        removedLines++
        addedLines++
      }
    } else if (oldLine !== undefined) {
      removedLines++
    } else if (newLine !== undefined) {
      addedLines++
    }
  }
  return { addedLines, removedLines }
}

export const AgentToolRegistry: Record<string, ToolMeta> = {
  "tool-Task": {
    icon: SparklesIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing subagent"
      return isPending ? "Running Subagent" : "Completed Subagent"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const description = part.input?.description || ""
      return description.length > 50
        ? description.slice(0, 47) + "..."
        : description
    },
    variant: "simple",
  },

  "tool-Grep": {
    icon: SearchIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing search"
      if (isPending) return "Grepping"

      // Handle different output modes:
      // - "files_with_matches" mode: numFiles > 0, filenames is populated
      // - "content" mode: numFiles = 0, but numLines > 0 and content has matches
      const mode = part.output?.mode
      const numFiles = part.output?.numFiles || 0
      const numLines = part.output?.numLines || 0

      if (mode === "content") {
        // In content mode, numFiles is always 0, use numLines instead
        return numLines > 0 ? `Found ${numLines} matches` : "No matches"
      }

      return numFiles > 0 ? `Grepped ${numFiles} files` : "No matches"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const pattern = part.input?.pattern || ""
      const path = part.input?.path || ""

      if (path) {
        // Show "pattern in path" with shortened path
        const displayPath = getDisplayPath(path)
        const combined = `${pattern} in ${displayPath}`
        return combined.length > 40 ? combined.slice(0, 37) + "..." : combined
      }

      return pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern
    },
    variant: "simple",
  },

  "tool-Glob": {
    icon: FolderSearch,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing search"
      if (isPending) return "Exploring files"

      const numFiles = part.output?.numFiles || 0
      return numFiles > 0 ? `Found ${numFiles} files` : "No files found"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const pattern = part.input?.pattern || ""
      const targetDir = part.input?.target_directory || ""

      if (targetDir) {
        // Show "pattern in targetDir" with shortened path
        const displayTargetDir = getDisplayPath(targetDir)
        const combined = `${pattern} in ${displayTargetDir}`
        return combined.length > 40 ? combined.slice(0, 37) + "..." : combined
      }

      return pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern
    },
    variant: "simple",
  },

  "tool-Read": {
    icon: EyeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing to read"
      return isPending ? "Reading" : "Read"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const filePath = part.input?.file_path || ""
      if (!filePath) return "" // Don't show "file" placeholder during streaming
      return filePath.split("/").pop() || ""
    },
    tooltipContent: (part, projectPath) => {
      if (part.state === "input-streaming") return ""
      const filePath = part.input?.file_path || ""
      return getDisplayPath(filePath, projectPath)
    },
    variant: "simple",
  },

  "tool-Edit": {
    icon: IconEditFile,
    title: (part) => {
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing edit"
      const filePath = part.input?.file_path || ""
      if (!filePath) return "Edit" // Show "Edit" if no file path yet during streaming
      return filePath.split("/").pop() || "Edit"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) return ""

      const oldString = part.input?.old_string || ""
      const newString = part.input?.new_string || ""

      if (!oldString && !newString) {
        return ""
      }

      // Always show actual line counts if there are any changes (copied from canvas)
      if (oldString !== newString) {
        const { addedLines, removedLines } = calculateDiffStats(
          oldString,
          newString,
        )
        return `<span style="font-size: 11px; color: light-dark(#587C0B, #A3BE8C)">+${addedLines}</span> <span style="font-size: 11px; color: light-dark(#AD0807, #AE5A62)">-${removedLines}</span>`
      }

      return ""
    },
    variant: "simple",
  },

  // Cloning indicator - shown while sandbox is being created
  "tool-cloning": {
    icon: GitBranch,
    title: () => "Cloning repo",
    variant: "simple",
  },

  // Planning indicator - shown when streaming starts but no content yet
  "tool-planning": {
    icon: PlanningIcon,
    title: () => {
      const messages = [
        "Crafting...",
        "Whirring...",
        "Imagining...",
        "Cooking...",
        "Sussing...",
        "Unravelling...",
        "Creating...",
        "Spinning...",
        "Computing...",
        "Synthesizing...",
        "Manifesting...",
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    },
    variant: "simple",
  },

  "tool-Write": {
    icon: WriteFileIcon,
    title: (part) => {
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing to create"
      return "Create"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const filePath = part.input?.file_path || ""
      if (!filePath) return "" // Don't show "file" placeholder during streaming
      return filePath.split("/").pop() || ""
    },
    variant: "simple",
  },

  "tool-Bash": {
    icon: CustomTerminalIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Generating command"
      return isPending ? "Running command" : "Ran command"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const command = part.input?.command || ""
      if (!command) return ""
      // Normalize line continuations, shorten absolute paths, and truncate
      let normalized = command.replace(/\\\s*\n\s*/g, " ").trim()
      // Replace absolute paths that look like project paths with relative versions
      normalized = normalized.replace(/\/(?:Users|home|root)\/[^\s"']+/g, (match) => {
        return getDisplayPath(match)
      })
      return normalized.length > 50 ? normalized.slice(0, 47) + "..." : normalized
    },
    variant: "simple",
  },

  "tool-WebFetch": {
    icon: GlobeIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing fetch"
      return isPending ? "Fetching" : "Fetched"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const url = part.input?.url || ""
      try {
        return new URL(url).hostname.replace("www.", "")
      } catch {
        return url.slice(0, 30)
      }
    },
    variant: "simple",
  },

  "tool-WebSearch": {
    icon: SearchIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return "Preparing search"
      return isPending ? "Searching web" : "Searched web"
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const query = part.input?.query || ""
      return query.length > 40 ? query.slice(0, 37) + "..." : query
    },
    variant: "collapsible",
  },

  // Planning tools
  "tool-TodoWrite": {
    icon: ListTodo,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const action = part.input?.action || "update"
      if (isPending) {
        return action === "add" ? "Adding todo" : "Updating todos"
      }
      return action === "add" ? "Added todo" : "Updated todos"
    },
    subtitle: (part) => {
      const todos = part.input?.todos || []
      if (todos.length === 0) return ""
      return `${todos.length} ${todos.length === 1 ? "item" : "items"}`
    },
    variant: "simple",
  },

  // Task management tools
  "tool-TaskCreate": {
    icon: Plus,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Creating task" : "Created task"
    },
    subtitle: (part) => {
      const subject = part.input?.subject || ""
      return subject.length > 40 ? subject.slice(0, 37) + "..." : subject
    },
    variant: "simple",
  },

  "tool-TaskUpdate": {
    icon: RefreshCw,
    title: (part) => {
      // Status comes from INPUT (output is just confirmation string)
      const status = part.input?.status
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) {
        if (status === "in_progress") return "Starting task"
        if (status === "completed") return "Completing task"
        if (status === "deleted") return "Deleting task"
        return "Updating task"
      }
      if (status === "in_progress") return "Started task"
      if (status === "completed") return "Completed task"
      if (status === "deleted") return "Deleted task"
      return "Updated task"
    },
    subtitle: (part) => {
      const subject = part.input?.subject
      const taskId = part.input?.taskId
      if (subject) {
        return subject.length > 40 ? subject.slice(0, 37) + "..." : subject
      }
      return taskId ? `#${taskId}` : ""
    },
    variant: "simple",
  },

  "tool-TaskGet": {
    icon: Eye,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Getting task" : "Got task"
    },
    subtitle: (part) => {
      const subject = part.output?.task?.subject
      const taskId = part.input?.taskId
      if (subject) {
        return subject.length > 40 ? subject.slice(0, 37) + "..." : subject
      }
      return taskId ? `#${taskId}` : ""
    },
    variant: "simple",
  },

  "tool-TaskList": {
    icon: List,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const count = part.output?.tasks?.length
      if (isPending) return "Listing tasks"
      return count !== undefined ? `Listed ${count} tasks` : "Listed tasks"
    },
    subtitle: () => "",
    variant: "simple",
  },

  "tool-PlanWrite": {
    icon: PlanningIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const action = part.input?.action || "create"
      const status = part.input?.plan?.status
      if (isPending) {
        if (action === "create") return "Creating plan"
        if (action === "approve") return "Approving plan"
        if (action === "complete") return "Completing plan"
        return "Updating plan"
      }
      if (status === "awaiting_approval") return "Plan ready for review"
      if (status === "approved") return "Plan approved"
      if (status === "completed") return "Plan completed"
      return action === "create" ? "Created plan" : "Updated plan"
    },
    subtitle: (part) => {
      const plan = part.input?.plan
      if (!plan) return ""
      const steps = plan.steps || []
      const completed = steps.filter((s: any) => s.status === "completed").length
      if (plan.title) {
        return steps.length > 0 
          ? `${plan.title} (${completed}/${steps.length})`
          : plan.title
      }
      return steps.length > 0 
        ? `${completed}/${steps.length} steps`
        : ""
    },
    variant: "simple",
  },

  "tool-ExitPlanMode": {
    icon: LogOut,
    title: (part) => {
      const {isPending} = getToolStatus(part)
      return isPending ? "Finishing plan" : "Plan complete"
    },
    subtitle: () => "",
    variant: "simple",
  },

  // Notebook tools
  "tool-NotebookEdit": {
    icon: FileCode2,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Editing notebook" : "Edited notebook"
    },
    subtitle: (part) => {
      const filePath = part.input?.file_path || ""
      if (!filePath) return ""
      return filePath.split("/").pop() || ""
    },
    variant: "simple",
  },

  // Shell management tools
  "tool-BashOutput": {
    icon: Terminal,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Getting output" : "Got output"
    },
    subtitle: (part) => {
      const pid = part.input?.pid
      return pid ? `PID: ${pid}` : ""
    },
    variant: "simple",
  },

  "tool-KillShell": {
    icon: XCircle,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Stopping shell" : "Stopped shell"
    },
    subtitle: (part) => {
      const pid = part.input?.pid
      return pid ? `PID: ${pid}` : ""
    },
    variant: "simple",
  },

  // MCP tools
  "tool-ListMcpResources": {
    icon: Server,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Listing resources" : "Listed resources"
    },
    subtitle: (part) => {
      const server = part.input?.server || ""
      return server
    },
    variant: "simple",
  },

  "tool-ReadMcpResource": {
    icon: Database,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Reading resource" : "Read resource"
    },
    subtitle: (part) => {
      const uri = part.input?.uri || ""
      return uri.length > 30 ? "..." + uri.slice(-27) : uri
    },
    variant: "simple",
  },

  // System tools
  "tool-Compact": {
    icon: Minimize2,
    title: (part) => {
      const isPending =
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "result"
      return isPending ? "Compacting..." : "Compacted"
    },
    variant: "simple",
  },

  // Extended Thinking
  "tool-Thinking": {
    icon: SparklesIcon,
    title: (part) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending ? "Thinking..." : "Thought"
    },
    subtitle: (part) => {
      const text = part.input?.text || ""
      // Show first 50 chars as preview
      return text.length > 50 ? text.slice(0, 47) + "..." : text
    },
    variant: "collapsible",
  },
}
