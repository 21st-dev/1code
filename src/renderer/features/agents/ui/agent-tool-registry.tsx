"use client"

import {
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
import type { TranslationKey } from "@/lib/i18n"

type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>
) => string

export type ToolVariant = "simple" | "collapsible"

export interface ToolMeta {
  icon: React.ComponentType<{ className?: string }>
  title: (part: any, t?: Translate) => string
  subtitle?: (part: any, t?: Translate) => string
  tooltipContent?: (part: any, projectPath?: string) => string
  variant: ToolVariant
}

function tr(
  t: Translate | undefined,
  key: TranslationKey,
  fallback: string,
  values?: Record<string, string | number>
) {
  if (t) return t(key, values)
  if (!values) return fallback
  return fallback.replace(/\{(\w+)\}/g, (match, name) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingAgent", "Preparing agent")
      const subagentType = part.input?.subagent_type || "Agent"
      return isPending
        ? tr(t, "agent.tool.runningAgent", "Running {agent}", { agent: subagentType })
        : tr(t, "agent.tool.agentCompleted", "{agent} completed", { agent: subagentType })
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingSearch", "Preparing search")
      if (isPending) return tr(t, "agent.tool.grepping", "Grepping")

      // Handle different output modes:
      // - "files_with_matches" mode: numFiles > 0, filenames is populated
      // - "content" mode: numFiles = 0, but numLines > 0 and content has matches
      const mode = part.output?.mode
      const numFiles = part.output?.numFiles || 0
      const numLines = part.output?.numLines || 0

      if (mode === "content") {
        // In content mode, numFiles is always 0, use numLines instead
        return numLines > 0
          ? tr(t, "agent.tool.foundMatches", "Found {count} matches", { count: numLines })
          : tr(t, "agent.tool.noMatches", "No matches")
      }

      return numFiles > 0
        ? tr(t, "agent.tool.greppedFiles", "Grepped {count} files", { count: numFiles })
        : tr(t, "agent.tool.noMatches", "No matches")
    },
    subtitle: (part, t) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const pattern = part.input?.pattern || ""
      const path = part.input?.path || ""

      if (path) {
        // Show "pattern in path" with shortened path
        const displayPath = getDisplayPath(path)
        const combined = tr(t, "agent.tool.in", "{item} in {target}", {
          item: pattern,
          target: displayPath,
        })
        return combined.length > 40 ? combined.slice(0, 37) + "..." : combined
      }

      return pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern
    },
    variant: "simple",
  },

  "tool-Glob": {
    icon: FolderSearch,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingSearch", "Preparing search")
      if (isPending) return tr(t, "agent.tool.exploringFiles", "Exploring files")

      const numFiles = part.output?.numFiles || 0
      return numFiles > 0
        ? tr(t, "agent.tool.foundFiles", "Found {count} files", { count: numFiles })
        : tr(t, "agent.tool.noFilesFound", "No files found")
    },
    subtitle: (part, t) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const pattern = part.input?.pattern || ""
      const targetDir = part.input?.target_directory || ""

      if (targetDir) {
        // Show "pattern in targetDir" with shortened path
        const displayTargetDir = getDisplayPath(targetDir)
        const combined = tr(t, "agent.tool.in", "{item} in {target}", {
          item: pattern,
          target: displayTargetDir,
        })
        return combined.length > 40 ? combined.slice(0, 37) + "..." : combined
      }

      return pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern
    },
    variant: "simple",
  },

  "tool-Read": {
    icon: EyeIcon,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingRead", "Preparing to read")
      return isPending
        ? tr(t, "agent.tool.reading", "Reading")
        : tr(t, "agent.tool.read", "Read")
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
    title: (part, t) => {
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingEdit", "Preparing edit")
      const filePath = part.input?.file_path || ""
      if (!filePath) return tr(t, "agent.tool.edit", "Edit") // Show "Edit" if no file path yet during streaming
      return filePath.split("/").pop() || tr(t, "agent.tool.edit", "Edit")
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
        return `+${addedLines} -${removedLines}`
      }

      return ""
    },
    variant: "simple",
  },

  // Cloning indicator - shown while sandbox is being created
  "tool-cloning": {
    icon: GitBranch,
    title: (_part, t) => tr(t, "agent.tool.cloningRepo", "Cloning repo"),
    variant: "simple",
  },

  // Planning indicator - shown when streaming starts but no content yet
  "tool-planning": {
    icon: PlanningIcon,
    title: (_part, t) => {
      const messages = [
        tr(t, "agent.tool.planning.crafting", "Crafting..."),
        tr(t, "agent.tool.planning.whirring", "Whirring..."),
        tr(t, "agent.tool.planning.imagining", "Imagining..."),
        tr(t, "agent.tool.planning.cooking", "Cooking..."),
        tr(t, "agent.tool.planning.sussing", "Sussing..."),
        tr(t, "agent.tool.planning.unravelling", "Unravelling..."),
        tr(t, "agent.tool.planning.creating", "Creating..."),
        tr(t, "agent.tool.planning.spinning", "Spinning..."),
        tr(t, "agent.tool.planning.computing", "Computing..."),
        tr(t, "agent.tool.planning.synthesizing", "Synthesizing..."),
        tr(t, "agent.tool.planning.manifesting", "Manifesting..."),
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    },
    variant: "simple",
  },

  "tool-Write": {
    icon: WriteFileIcon,
    title: (part, t) => {
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingCreate", "Preparing to create")
      return tr(t, "agent.tool.create", "Create")
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.generatingCommand", "Generating command")
      return isPending
        ? tr(t, "agent.tool.runningCommand", "Running command")
        : tr(t, "agent.tool.ranCommand", "Ran command")
    },
    subtitle: (part) => {
      // Don't show subtitle while input is still streaming
      if (part.state === "input-streaming") return ""
      const command = part.input?.command || ""
      if (!command) return ""
      // Normalize line continuations, shorten absolute paths, and truncate
      let normalized = command.replace(/\\\s*\n\s*/g, " ").trim()
      // Replace absolute paths that look like project paths with relative versions
      normalized = normalized.replace(/\/(?:Users|home|root)\/[^\s"']+/g, (match: string) => {
        return getDisplayPath(match)
      })
      return normalized.length > 50 ? normalized.slice(0, 47) + "..." : normalized
    },
    variant: "simple",
  },

  "tool-WebFetch": {
    icon: GlobeIcon,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingFetch", "Preparing fetch")
      return isPending
        ? tr(t, "agent.tool.fetching", "Fetching")
        : tr(t, "agent.tool.fetched", "Fetched")
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const isInputStreaming = part.state === "input-streaming"
      if (isInputStreaming) return tr(t, "agent.tool.preparingSearch", "Preparing search")
      return isPending
        ? tr(t, "agent.tool.searchingWeb", "Searching web")
        : tr(t, "agent.tool.searchedWeb", "Searched web")
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const action = part.input?.action || "update"
      if (isPending) {
        return action === "add"
          ? tr(t, "agent.tool.addingTodo", "Adding todo")
          : tr(t, "agent.tool.updatingTodos", "Updating todos")
      }
      return action === "add"
        ? tr(t, "agent.tool.addedTodo", "Added todo")
        : tr(t, "agent.tool.updatedTodos", "Updated todos")
    },
    subtitle: (part, t) => {
      const todos = part.input?.todos || []
      if (todos.length === 0) return ""
      return `${todos.length} ${todos.length === 1
        ? tr(t, "agent.tool.item", "item")
        : tr(t, "agent.tool.items", "items")}`
    },
    variant: "simple",
  },

  // Task management tools
  "tool-TaskCreate": {
    icon: Plus,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending
        ? tr(t, "agent.tool.creatingTask", "Creating task")
        : tr(t, "agent.tool.createdTask", "Created task")
    },
    subtitle: (part) => {
      const subject = part.input?.subject || ""
      return subject.length > 40 ? subject.slice(0, 37) + "..." : subject
    },
    variant: "simple",
  },

  "tool-TaskUpdate": {
    icon: RefreshCw,
    title: (part, t) => {
      // Status comes from INPUT (output is just confirmation string)
      const status = part.input?.status
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      if (isPending) {
        if (status === "in_progress") return tr(t, "agent.tool.startingTask", "Starting task")
        if (status === "completed") return tr(t, "agent.tool.completingTask", "Completing task")
        if (status === "deleted") return tr(t, "agent.tool.deletingTask", "Deleting task")
        return tr(t, "agent.tool.updatingTask", "Updating task")
      }
      if (status === "in_progress") return tr(t, "agent.tool.startedTask", "Started task")
      if (status === "completed") return tr(t, "agent.tool.completedTask", "Completed task")
      if (status === "deleted") return tr(t, "agent.tool.deletedTask", "Deleted task")
      return tr(t, "agent.tool.updatedTask", "Updated task")
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending
        ? tr(t, "agent.tool.gettingTask", "Getting task")
        : tr(t, "agent.tool.gotTask", "Got task")
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const count = part.output?.tasks?.length
      if (isPending) return tr(t, "agent.tool.listingTasks", "Listing tasks")
      return count !== undefined
        ? tr(t, "agent.tool.listedTaskCount", "Listed {count} tasks", { count })
        : tr(t, "agent.tool.listedTasks", "Listed tasks")
    },
    subtitle: () => "",
    variant: "simple",
  },

  "tool-PlanWrite": {
    icon: PlanningIcon,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      const action = part.input?.action || "create"
      const status = part.input?.plan?.status
      if (isPending) {
        if (action === "create") return tr(t, "agent.tool.creatingPlan", "Creating plan")
        if (action === "approve") return tr(t, "agent.tool.approvingPlan", "Approving plan")
        if (action === "complete") return tr(t, "agent.tool.completingPlan", "Completing plan")
        return tr(t, "agent.tool.updatingPlan", "Updating plan")
      }
      if (status === "awaiting_approval") return tr(t, "agent.tool.planReadyForReview", "Plan ready for review")
      if (status === "approved") return tr(t, "agent.tool.planApproved", "Plan approved")
      if (status === "completed") return tr(t, "agent.tool.planCompleted", "Plan completed")
      return action === "create"
        ? tr(t, "agent.tool.createdPlan", "Created plan")
        : tr(t, "agent.tool.updatedPlan", "Updated plan")
    },
    subtitle: (part, t) => {
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
        ? `${completed}/${steps.length} ${tr(t, "agent.tool.steps", "steps")}`
        : ""
    },
    variant: "simple",
  },

  "tool-ExitPlanMode": {
    icon: LogOut,
    title: (part, t) => {
      const {isPending} = getToolStatus(part)
      return isPending
        ? tr(t, "agent.tool.finishingPlan", "Finishing plan")
        : tr(t, "agent.tool.planComplete", "Plan complete")
    },
    subtitle: () => "",
    variant: "simple",
  },

  // Notebook tools
  "tool-NotebookEdit": {
    icon: FileCode2,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending
        ? tr(t, "agent.tool.editingNotebook", "Editing notebook")
        : tr(t, "agent.tool.editedNotebook", "Edited notebook")
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
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending
        ? tr(t, "agent.tool.gettingOutput", "Getting output")
        : tr(t, "agent.tool.gotOutput", "Got output")
    },
    subtitle: (part) => {
      const pid = part.input?.pid
      return pid ? `PID: ${pid}` : ""
    },
    variant: "simple",
  },

  "tool-KillShell": {
    icon: XCircle,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending
        ? tr(t, "agent.tool.stoppingShell", "Stopping shell")
        : tr(t, "agent.tool.stoppedShell", "Stopped shell")
    },
    subtitle: (part) => {
      const pid = part.input?.pid
      return pid ? `PID: ${pid}` : ""
    },
    variant: "simple",
  },

  // Note: ListMcpResources, ReadMcpResource and their "Tool"-suffixed variants
  // are handled by AgentMcpToolCall via parseMcpToolType() for richer output display

  // System tools
  "tool-Compact": {
    icon: Minimize2,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "result"
      return isPending
        ? tr(t, "agent.tool.compacting", "Compacting...")
        : tr(t, "agent.tool.compacted", "Compacted")
    },
    variant: "simple",
  },

  // Extended Thinking
  "tool-Thinking": {
    icon: SparklesIcon,
    title: (part, t) => {
      const isPending =
        part.state !== "output-available" && part.state !== "output-error"
      return isPending
        ? tr(t, "agent.tool.thinking", "Thinking...")
        : tr(t, "agent.tool.thought", "Thought")
    },
    subtitle: (part) => {
      const text = part.input?.text || ""
      // Show first 50 chars as preview
      return text.length > 50 ? text.slice(0, 47) + "..." : text
    },
    variant: "collapsible",
  },
}

// ============================================================================
// MCP TOOL PARSING
// ============================================================================

const MCP_TOOL_PREFIX = "tool-mcp__"

export type McpToolCategory =
  | "search"
  | "list"
  | "get"
  | "create"
  | "update"
  | "delete"
  | "send"
  | "generate"
  | "other"

export interface McpToolInfo {
  serverName: string
  toolName: string
  displayName: string
  category: McpToolCategory
}

// Built-in MCP tools (not prefixed with mcp__<server>__)
const BUILTIN_MCP_TOOLS: Record<string, McpToolInfo> = {
  "tool-ListMcpResources": { serverName: "mcp", toolName: "list_resources", displayName: "List Resources", category: "list" },
  "tool-ListMcpResourcesTool": { serverName: "mcp", toolName: "list_resources", displayName: "List Resources", category: "list" },
  "tool-ReadMcpResource": { serverName: "mcp", toolName: "read_resource", displayName: "Read Resource", category: "get" },
  "tool-ReadMcpResourceTool": { serverName: "mcp", toolName: "read_resource", displayName: "Read Resource", category: "get" },
}

export function parseMcpToolType(partType: string): McpToolInfo | null {
  // Check built-in MCP tools first
  const builtin = BUILTIN_MCP_TOOLS[partType]
  if (builtin) return builtin

  if (!partType.startsWith(MCP_TOOL_PREFIX)) return null

  const withoutPrefix = partType.slice(MCP_TOOL_PREFIX.length)
  const separatorIndex = withoutPrefix.indexOf("__")
  if (separatorIndex === -1) return null

  const serverName = withoutPrefix.slice(0, separatorIndex)
  const toolName = withoutPrefix.slice(separatorIndex + 2)

  return {
    serverName,
    toolName,
    displayName: formatMcpToolName(toolName),
    category: categorizeMcpTool(toolName),
  }
}

export function formatMcpToolName(toolName: string): string {
  return toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim()
}

function categorizeMcpTool(toolName: string): McpToolCategory {
  const lower = toolName.toLowerCase()
  if (lower.startsWith("search_") || lower.startsWith("query_")) return "search"
  if (lower.startsWith("list_")) return "list"
  if (lower.startsWith("get_") || lower.startsWith("fetch_") || lower.startsWith("retrieve_")) return "get"
  if (lower.startsWith("create_") || lower.startsWith("add_") || lower.startsWith("draft_")) return "create"
  if (lower.startsWith("update_") || lower.startsWith("modify_") || lower.startsWith("manage_")) return "update"
  if (lower.startsWith("delete_") || lower.startsWith("remove_")) return "delete"
  if (lower.startsWith("send_")) return "send"
  if (lower.startsWith("generate_")) return "generate"
  return "other"
}
