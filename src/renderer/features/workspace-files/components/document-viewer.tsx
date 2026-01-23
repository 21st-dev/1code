import { useCallback, useMemo } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { X, FileText, ListTodo, FileCode, Check, Circle } from "lucide-react"
import {
  activeDocumentAtomFamily,
  documentsPanelOpenAtomFamily,
} from "../../../lib/atoms"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { CodeViewer } from "./code-viewer"
import { trpc } from "../../../lib/trpc"
import { selectedAgentChatIdAtom, currentTodosAtomFamily } from "../../agents/atoms"
import { useAgentSubChatStore } from "../../../lib/stores/sub-chat-store"
import { IconArrowRight } from "../../../components/ui/icons"
import { cn } from "../../../lib/utils"
import type { TodoItem } from "../../agents/ui/agent-todo-tool"

// Todo status icon component
const TodoStatusIcon = ({ status }: { status: TodoItem["status"] }) => {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-4 h-4 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--border))" }}
        >
          <Check className="w-2.5 h-2.5 text-muted-foreground" />
        </div>
      )
    case "in_progress":
      return (
        <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconArrowRight className="w-2.5 h-2.5 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
}

// Full-height todo list viewer
const TodoListViewer = ({ todos }: { todos: TodoItem[] }) => {
  const completedCount = todos.filter((t) => t.status === "completed").length
  const totalCount = todos.length

  return (
    <div className="flex flex-col h-full">
      {/* Header stats */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Progress:</span>
            <span className="text-sm text-muted-foreground">
              {completedCount} / {totalCount} completed
            </span>
          </div>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto">
        {todos.map((todo, index) => (
          <div
            key={index}
            className={cn(
              "flex items-start gap-3 px-6 py-4 border-b border-border/30 transition-colors hover:bg-muted/20",
              todo.status === "completed" && "opacity-60"
            )}
          >
            <TodoStatusIcon status={todo.status} />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-sm",
                  todo.status === "completed"
                    ? "line-through text-muted-foreground"
                    : todo.status === "in_progress"
                      ? "text-foreground font-medium"
                      : "text-foreground"
                )}
              >
                {todo.content}
              </div>
              {todo.status === "in_progress" && todo.activeForm && (
                <div className="text-xs text-muted-foreground mt-1">
                  {todo.activeForm}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface WorkspaceDocumentViewerProps {
  chatId: string
  subChatId?: string
}

export function WorkspaceDocumentViewer({ chatId, subChatId: propSubChatId }: WorkspaceDocumentViewerProps) {
  const activeDoc = useAtomValue(activeDocumentAtomFamily(chatId))
  const setDocumentsOpen = useSetAtom(documentsPanelOpenAtomFamily(chatId))
  const setActiveDoc = useSetAtom(activeDocumentAtomFamily(chatId))

  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const storeSubChatId = useAgentSubChatStore((state) => state.subChatId)

  // Use prop subChatId if provided, otherwise fall back to store
  const subChatId = propSubChatId || storeSubChatId

  const utils = trpc.useUtils()

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setDocumentsOpen(false)
      setActiveDoc(null)
    },
    [setDocumentsOpen, setActiveDoc]
  )

  const handleOpenPlan = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!subChatId || !selectedChatId) {
      setActiveDoc({
        path: "Plan",
        content: "No plan found for current chat.\n\nChat session information is not available.",
        type: "markdown",
      })
      return
    }

    try {
      // Read the plan file for this chat session
      const result = await utils.claude.readPlanFile.fetch({
        chatId: selectedChatId,
        subChatId: subChatId,
      })

      // Open the plan in the document viewer
      setActiveDoc({
        path: result.fileName,
        content: result.content,
        type: "markdown",
      })
    } catch (error) {
      console.error("[DocumentViewer] Failed to open plan:", error)
      // Show error message in the document viewer
      setActiveDoc({
        path: "Plan",
        content: "No plan found for current chat.\n\nThe agent may not have created a plan yet, or the plan file cannot be accessed.",
        type: "markdown",
      })
    }
  }, [subChatId, selectedChatId, utils, setActiveDoc])

  // Get todos from atom for current subChatId
  const todosAtom = useMemo(
    () => currentTodosAtomFamily(subChatId || "default"),
    [subChatId],
  )
  const todoState = useAtomValue(todosAtom)

  const handleOpenTodo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()

    if (!subChatId) {
      setActiveDoc({
        path: "Todo List",
        content: "No todo list available.\n\nChat session information is not available.",
        type: "markdown",
      })
      return
    }

    // Check if there are any todos
    if (!todoState.todos || todoState.todos.length === 0) {
      setActiveDoc({
        path: "Todo List",
        content: "No todo list found for current chat.\n\nThe agent hasn't created a todo list yet.",
        type: "markdown",
      })
      return
    }

    // Set activeDoc to show todos (using a special type)
    setActiveDoc({
      path: "Todo List",
      content: "", // Not used for todos
      type: "todos" as any, // Special type to render todos
    })
  }, [subChatId, todoState, setActiveDoc])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: File info or title */}
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span
              className="text-sm font-medium truncate text-foreground"
              title={activeDoc?.path}
            >
              {activeDoc?.path || "Documents"}
            </span>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Plan button */}
            <button
              type="button"
              onClick={handleOpenPlan}
              className="relative z-20 flex-shrink-0 rounded p-1 hover:bg-accent hover:text-foreground transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
              aria-label="Open plan"
              title="Open plan"
            >
              <FileCode className="h-4 w-4" />
            </button>

            {/* Todo button */}
            <button
              type="button"
              onClick={handleOpenTodo}
              className="relative z-20 flex-shrink-0 rounded p-1 hover:bg-accent hover:text-foreground transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
              aria-label="Open todos"
              title="Open todos"
            >
              <ListTodo className="h-4 w-4" />
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className="relative z-20 flex-shrink-0 rounded p-1 hover:bg-accent hover:text-foreground transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!activeDoc ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <div className="text-sm font-medium text-muted-foreground">Select a file to view</div>
            <div className="text-xs text-muted-foreground">
              Click a file in the tree to open it here
            </div>
          </div>
        ) : (
          <>
            {activeDoc.type === "markdown" && (
              <div className="p-4">
                <ChatMarkdownRenderer content={activeDoc.content} size="md" />
              </div>
            )}
            {activeDoc.type === "code" && (
              <CodeViewer content={activeDoc.content} filename={activeDoc.path} />
            )}
            {activeDoc.type === "text" && (
              <pre className="p-4 font-mono text-sm">{activeDoc.content}</pre>
            )}
            {activeDoc.type === "todos" && todoState.todos.length > 0 && (
              <TodoListViewer todos={todoState.todos} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
