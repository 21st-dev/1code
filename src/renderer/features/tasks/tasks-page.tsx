import { useState, useCallback } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { Copy, Trash2, Plus, X } from "lucide-react"
import { tasksAtom, type Task } from "./atoms"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface TasksPageProps {
  chatId: string
}

export function TasksPage({ chatId }: TasksPageProps) {
  const allTasks = useAtomValue(tasksAtom)
  const setAllTasks = useSetAtom(tasksAtom)
  const tasks = allTasks[chatId] || []
  const setTasks = (value: Task[] | ((prev: Task[]) => Task[])) => {
    setAllTasks((prev) => {
      const currentTasks = prev[chatId] || []
      const newTasks = typeof value === "function" ? (value as (p: Task[]) => Task[])(currentTasks) : value
      return { ...prev, [chatId]: newTasks }
    })
  }
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskDescription, setNewTaskDescription] = useState("")

  const addTask = useCallback(() => {
    if (!newTaskName.trim()) return

    const newTask: Task = {
      id: crypto.randomUUID(),
      name: newTaskName.trim(),
      description: newTaskDescription.trim(),
      createdAt: Date.now(),
    }

    setTasks((prev) => [...prev, newTask])
    setNewTaskName("")
    setNewTaskDescription("")
  }, [newTaskName, newTaskDescription, setTasks])

  const deleteTask = useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    },
    [setTasks]
  )

  const copyTask = useCallback((task: Task) => {
    const text = `Task: ${task.name}\n\nDescription: ${task.description}`
    navigator.clipboard.writeText(text)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      addTask()
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/50">
        <h2 className="text-sm font-medium text-foreground">Tasks</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </p>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-sm text-muted-foreground">No tasks yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a task below to get started
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {task.name}
                  </div>
                  {task.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {task.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyTask(task)}
                    title="Copy task details"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteTask(task.id)}
                    title="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add task form */}
      <div className="flex-shrink-0 border-t border-border/50 p-4 space-y-3">
        <Input
          placeholder="Task name"
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm"
        />
        <Textarea
          placeholder="Description (optional)"
          value={newTaskDescription}
          onChange={(e) => setNewTaskDescription(e.target.value)}
          className="min-h-[60px] text-sm resize-none"
        />
        <Button
          onClick={addTask}
          disabled={!newTaskName.trim()}
          className="w-full h-8 text-sm"
          size="sm"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Task
        </Button>
      </div>
    </div>
  )
}
