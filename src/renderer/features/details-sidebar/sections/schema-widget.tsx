"use client"

import { memo, useState, useCallback } from "react"
import {
  ChevronRight,
  Database,
  Table2,
  Columns3,
  RefreshCw,
  Settings,
  Eye,
  Code2,
  SquareFunction,
  Hash,
  HardDrive,
  Folder,
  Clock,
  Zap,
  FileText,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useSetAtom } from "jotai"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { DatabaseFilledIcon } from "@/components/ui/icons"
import { agentsSettingsDialogOpenAtom, agentsSettingsDialogActiveTabAtom } from "@/lib/atoms"

interface SchemaWidgetProps {
  chatId?: string
}

// Node types for the tree
type NodeType =
  | "database"
  | "schema"
  | "folder" // Category folders (Tables, Views, etc.)
  | "table"
  | "view"
  | "procedure"
  | "function"
  | "sequence"
  | "stage"
  | "task"
  | "dynamicTable"
  | "fileFormat"
  | "column"

// Category types within a schema
type CategoryType = "tables" | "views" | "procedures" | "functions" | "sequences" | "stages" | "tasks" | "dynamicTables" | "fileFormats"

interface TreeNode {
  type: NodeType
  name: string
  // For category folders
  category?: CategoryType
  // For columns
  dataType?: string
  // For procedures/functions
  signature?: string
  // Parent info for loading children
  database?: string
  schema?: string
  // State
  children?: TreeNode[]
  isExpanded?: boolean
  isLoaded?: boolean
}

// Category configuration
const CATEGORIES: { type: CategoryType; label: string; icon: typeof Table2 }[] = [
  { type: "tables", label: "Tables", icon: Table2 },
  { type: "dynamicTables", label: "Dynamic Tables", icon: Zap },
  { type: "views", label: "Views", icon: Eye },
  { type: "procedures", label: "Procedures", icon: Code2 },
  { type: "functions", label: "Functions", icon: SquareFunction },
  { type: "tasks", label: "Tasks", icon: Clock },
  { type: "sequences", label: "Sequences", icon: Hash },
  { type: "stages", label: "Stages", icon: HardDrive },
  { type: "fileFormats", label: "File Formats", icon: FileText },
]

// Helper to update a node in the tree immutably
function updateNodeInTree(
  nodes: TreeNode[],
  targetNode: TreeNode,
  updates: Partial<TreeNode>
): TreeNode[] {
  return nodes.map(node => {
    if (node === targetNode) {
      return { ...node, ...updates }
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeInTree(node.children, targetNode, updates)
      }
    }
    return node
  })
}

// Connection status indicator
function ConnectionStatus({ isConnected, hasCredentials }: { isConnected: boolean; hasCredentials: boolean }) {
  if (!hasCredentials) {
    return (
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        <span className="text-[10px] text-muted-foreground">Not configured</span>
      </div>
    )
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Connected</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <span className="text-[10px] text-amber-600 dark:text-amber-400">Disconnected</span>
    </div>
  )
}

// Get icon for node type
function getNodeIcon(node: TreeNode) {
  switch (node.type) {
    case "database":
      return Database
    case "schema":
      return Database
    case "folder":
      return Folder
    case "table":
      return Table2
    case "dynamicTable":
      return Zap
    case "view":
      return Eye
    case "procedure":
      return Code2
    case "function":
      return SquareFunction
    case "task":
      return Clock
    case "sequence":
      return Hash
    case "stage":
      return HardDrive
    case "fileFormat":
      return FileText
    case "column":
      return Columns3
    default:
      return Database
  }
}

// Tree item component
function TreeItem({
  node,
  level = 0,
  onLoadChildren,
  onUpdateNode,
}: {
  node: TreeNode
  level?: number
  onLoadChildren: (node: TreeNode) => Promise<TreeNode[] | null>
  onUpdateNode: (node: TreeNode, updates: Partial<TreeNode>) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const hasChildren = node.type !== "column"
  const Icon = getNodeIcon(node)

  // For category folders, use the specific icon
  const CategoryIcon = node.type === "folder" && node.category
    ? CATEGORIES.find(c => c.type === node.category)?.icon || Folder
    : Icon

  const handleClick = async () => {
    if (node.type === "column") return

    if (!node.isLoaded && hasChildren) {
      setIsLoading(true)
      try {
        const children = await onLoadChildren(node)
        if (children) {
          onUpdateNode(node, { children, isLoaded: true, isExpanded: true })
        } else {
          onUpdateNode(node, { isExpanded: true })
        }
      } catch {
        // Error handled silently
      } finally {
        setIsLoading(false)
      }
    } else {
      onUpdateNode(node, { isExpanded: !node.isExpanded })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleClick()
    }
  }

  // Determine display name
  let displayName = node.name
  if (node.type === "procedure" || node.type === "function") {
    displayName = node.signature ? `${node.name}(${node.signature})` : node.name
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 px-1 rounded text-xs cursor-pointer hover:bg-muted/50 transition-colors",
        )}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        onClick={handleClick}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onKeyDown={hasChildren ? handleKeyDown : undefined}
      >
        {/* Chevron for expandable items */}
        {hasChildren ? (
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform flex-shrink-0",
              node.isExpanded && "rotate-90",
              isLoading && "animate-spin",
            )}
          />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        <CategoryIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="truncate text-foreground">{displayName}</span>
        {node.dataType && (
          <span className="text-muted-foreground ml-auto text-[10px] flex-shrink-0 font-mono">
            {node.dataType}
          </span>
        )}
      </div>

      {/* Children */}
      <AnimatePresence>
        {node.isExpanded && node.children && node.children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {node.children.map((child, idx) => (
              <TreeItem
                key={`${child.type}-${child.name}-${idx}`}
                node={child}
                level={level + 1}
                onLoadChildren={onLoadChildren}
                onUpdateNode={onUpdateNode}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state for loaded folders */}
      {node.isExpanded && node.isLoaded && node.children?.length === 0 && (
        <div
          className="text-[10px] text-muted-foreground italic py-0.5"
          style={{ paddingLeft: `${(level + 1) * 12 + 16}px` }}
        >
          (empty)
        </div>
      )}
    </div>
  )
}

/**
 * Schema Browser Widget for Details Sidebar
 * Shows Snowflake database schema tree when connected
 */
export const SchemaWidget = memo(function SchemaWidget({ chatId }: SchemaWidgetProps) {
  const [databases, setDatabases] = useState<TreeNode[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Settings dialog atoms
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  // Get connection status
  const { data: status } = trpc.snowflake.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  })

  // tRPC utils for on-demand queries
  const utils = trpc.useUtils()
  const getDatabasesQuery = trpc.snowflake.getDatabases.useQuery(undefined, { enabled: false })

  // Load databases
  const handleRefresh = useCallback(async () => {
    if (!status?.isConnected) return

    setIsRefreshing(true)
    try {
      const result = await getDatabasesQuery.refetch()
      if (result.data) {
        setDatabases(
          result.data.map((name) => ({
            type: "database" as const,
            name,
            isExpanded: false,
            isLoaded: false,
          }))
        )
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [status?.isConnected, getDatabasesQuery])

  // Load children for a node
  const loadChildren = useCallback(async (node: TreeNode): Promise<TreeNode[] | null> => {
    // Database -> Schemas
    if (node.type === "database") {
      const schemas = await utils.snowflake.getSchemas.fetch({ database: node.name })
      return schemas.map((name) => ({
        type: "schema" as const,
        name,
        database: node.name,
        isExpanded: false,
        isLoaded: false,
      }))
    }

    // Schema -> Category folders (only show non-empty categories)
    if (node.type === "schema") {
      const db = node.database!
      const schema = node.name

      // Fetch counts for all categories in parallel
      const [tables, dynamicTables, views, procedures, functions, tasks, sequences, stages, fileFormats] = await Promise.all([
        utils.snowflake.getTables.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getDynamicTables.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getViews.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getProcedures.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getFunctions.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getTasks.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getSequences.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getStages.fetch({ database: db, schema }).catch(() => []),
        utils.snowflake.getFileFormats.fetch({ database: db, schema }).catch(() => []),
      ])

      const categoryCounts: Record<CategoryType, number> = {
        tables: tables.length,
        dynamicTables: dynamicTables.length,
        views: views.length,
        procedures: procedures.length,
        functions: functions.length,
        tasks: tasks.length,
        sequences: sequences.length,
        stages: stages.length,
        fileFormats: fileFormats.length,
      }

      // Only return folders for categories that have items
      return CATEGORIES
        .filter(cat => categoryCounts[cat.type] > 0)
        .map((cat) => ({
          type: "folder" as const,
          name: cat.label,
          category: cat.type,
          database: db,
          schema,
          isExpanded: false,
          isLoaded: false,
        }))
    }

    // Category folder -> Objects
    if (node.type === "folder" && node.category && node.database && node.schema) {
      const db = node.database
      const schema = node.schema

      switch (node.category) {
        case "tables": {
          const tables = await utils.snowflake.getTables.fetch({ database: db, schema })
          return tables.map((t) => ({
            type: "table" as const,
            name: t.name,
            database: db,
            schema,
            isExpanded: false,
            isLoaded: false,
          }))
        }
        case "views": {
          const views = await utils.snowflake.getViews.fetch({ database: db, schema })
          return views.map((v) => ({
            type: "view" as const,
            name: v.name,
            database: db,
            schema,
            isExpanded: false,
            isLoaded: false,
          }))
        }
        case "procedures": {
          const procs = await utils.snowflake.getProcedures.fetch({ database: db, schema })
          return procs.map((p) => ({
            type: "procedure" as const,
            name: p.name,
            signature: p.arguments,
            database: db,
            schema,
            isExpanded: false,
            isLoaded: true, // Procedures don't have children
          }))
        }
        case "functions": {
          const funcs = await utils.snowflake.getFunctions.fetch({ database: db, schema })
          return funcs.map((f) => ({
            type: "function" as const,
            name: f.name,
            signature: f.arguments,
            database: db,
            schema,
            isExpanded: false,
            isLoaded: true, // Functions don't have children
          }))
        }
        case "sequences": {
          const seqs = await utils.snowflake.getSequences.fetch({ database: db, schema })
          return seqs.map((s) => ({
            type: "sequence" as const,
            name: s.name,
            isExpanded: false,
            isLoaded: true, // Sequences don't have children
          }))
        }
        case "stages": {
          const stages = await utils.snowflake.getStages.fetch({ database: db, schema })
          return stages.map((s) => ({
            type: "stage" as const,
            name: s.name,
            dataType: s.type,
            isExpanded: false,
            isLoaded: true, // Stages don't have children
          }))
        }
        case "tasks": {
          const tasks = await utils.snowflake.getTasks.fetch({ database: db, schema })
          return tasks.map((t) => ({
            type: "task" as const,
            name: t.name,
            dataType: t.state, // Show state (started/suspended)
            isExpanded: false,
            isLoaded: true, // Tasks don't have children in this view
          }))
        }
        case "dynamicTables": {
          const dynamicTables = await utils.snowflake.getDynamicTables.fetch({ database: db, schema })
          return dynamicTables.map((dt) => ({
            type: "dynamicTable" as const,
            name: dt.name,
            database: db,
            schema,
            isExpanded: false,
            isLoaded: false, // Dynamic tables can have columns
          }))
        }
        case "fileFormats": {
          const fileFormats = await utils.snowflake.getFileFormats.fetch({ database: db, schema })
          return fileFormats.map((ff) => ({
            type: "fileFormat" as const,
            name: ff.name,
            dataType: ff.type, // Show format type (CSV, JSON, etc.)
            isExpanded: false,
            isLoaded: true, // File formats don't have children
          }))
        }
      }
    }

    // Table/View/Dynamic Table -> Columns
    if ((node.type === "table" || node.type === "view" || node.type === "dynamicTable") && node.database && node.schema) {
      const columns = await utils.snowflake.getColumns.fetch({
        database: node.database,
        schema: node.schema,
        table: node.name,
      })
      return columns.map((c) => ({
        type: "column" as const,
        name: c.name,
        dataType: c.type,
        isLoaded: true,
      }))
    }

    return null
  }, [utils])

  // Handler to update a node in the tree immutably
  const handleUpdateNode = useCallback((targetNode: TreeNode, updates: Partial<TreeNode>) => {
    setDatabases(prev => updateNodeInTree(prev, targetNode, updates))
  }, [])

  // Open settings
  const handleOpenSettings = useCallback(() => {
    setActiveTab("data")
    setSettingsOpen(true)
  }, [setActiveTab, setSettingsOpen])

  // Not configured state
  if (!status?.hasCredentials) {
    return (
      <div className="mx-2 mb-2">
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <DatabaseFilledIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Snowflake</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Connect to Snowflake to browse your database schema.
          </p>
          <button
            onClick={handleOpenSettings}
            className="flex items-center gap-1.5 text-xs text-foreground hover:underline"
          >
            <Settings className="h-3 w-3" />
            Configure connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-2 mb-2">
      {/* Header */}
      <div className="rounded-t-lg border border-b-0 border-border/50 bg-muted/30 px-2 h-8 flex items-center">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <DatabaseFilledIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">Snowflake</span>
          <ConnectionStatus
            isConnected={status?.isConnected || false}
            hasCredentials={status?.hasCredentials || false}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={!status?.isConnected || isRefreshing}
            className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors rounded hover:bg-muted/50"
            title="Refresh databases"
          >
            <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
          </button>
          <button
            onClick={handleOpenSettings}
            className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted/50"
            title="Connection settings"
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-b-lg border border-border/50 border-t-0 max-h-[400px] overflow-y-auto">
        {!status?.isConnected ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            <p className="mb-2">Not connected</p>
            <button
              onClick={handleOpenSettings}
              className="text-foreground hover:underline"
            >
              Connect to Snowflake
            </button>
          </div>
        ) : databases.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            <p className="mb-2">No databases loaded</p>
            <button
              onClick={handleRefresh}
              className="text-foreground hover:underline"
            >
              Load databases
            </button>
          </div>
        ) : (
          <div className="py-1">
            {databases.map((db, idx) => (
              <TreeItem
                key={`${db.name}-${idx}`}
                node={db}
                onLoadChildren={loadChildren}
                onUpdateNode={handleUpdateNode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
