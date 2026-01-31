import { useState, useCallback, useMemo } from "react"
import { Button } from "../../../ui/button"
import { Input } from "../../../ui/input"
import { Label } from "../../../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select"
import { cn } from "../../../../lib/utils"
import { trpc } from "../../../../lib/trpc"
import type {
  McpServerFormData,
  TransportType,
  AuthType,
  ScopeType,
} from "./types"
import { Eye, EyeOff } from "lucide-react"

interface McpServerFormProps {
  initialData?: Partial<McpServerFormData>
  onSubmit: (data: McpServerFormData) => void
  onCancel: () => void
  isSubmitting?: boolean
  submitLabel?: string
  isEditing?: boolean
}

export function McpServerForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = "Add",
  isEditing = false,
}: McpServerFormProps) {
  const [name, setName] = useState(initialData?.name ?? "")
  const [scope, setScope] = useState<ScopeType>(initialData?.scope ?? "global")
  const [projectPath, setProjectPath] = useState(initialData?.projectPath ?? "")
  const [transport, setTransport] = useState<TransportType>(
    initialData?.transport ?? "stdio",
  )
  const [command, setCommand] = useState(initialData?.command ?? "")
  const [argsText, setArgsText] = useState(
    initialData?.args?.join("\n") ?? "",
  )
  const [envText, setEnvText] = useState(
    initialData?.env
      ? Object.entries(initialData.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : "",
  )
  const [url, setUrl] = useState(initialData?.url ?? "")
  const [authType, setAuthType] = useState<AuthType>(
    initialData?.authType ?? "none",
  )
  const [bearerToken, setBearerToken] = useState(
    initialData?.bearerToken ?? "",
  )
  const [showToken, setShowToken] = useState(false)

  const { data: projectsList } = trpc.projects.list.useQuery()

  const parseArgs = useCallback((text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  }, [])

  const parseEnv = useCallback(
    (text: string): Record<string, string> => {
      const result: Record<string, string> = {}
      for (const line of text.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const eqIndex = trimmed.indexOf("=")
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim()
          const value = trimmed.slice(eqIndex + 1).trim()
          if (key) result[key] = value
        }
      }
      return result
    },
    [],
  )

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (scope === "project" && !projectPath) return false
    if (transport === "stdio" && !command.trim()) return false
    if (transport === "http" && !url.trim()) return false
    if (authType === "bearer" && !bearerToken.trim()) return false
    return true
  }, [name, scope, projectPath, transport, command, url, authType, bearerToken])

  const handleSubmit = () => {
    if (!canSubmit) return

    const data: McpServerFormData = {
      name: name.trim(),
      scope,
      projectPath: scope === "project" ? projectPath : undefined,
      transport,
    }

    if (transport === "stdio") {
      data.command = command.trim()
      const args = parseArgs(argsText)
      if (args.length > 0) data.args = args
      const env = parseEnv(envText)
      if (Object.keys(env).length > 0) data.env = env
    } else {
      data.url = url.trim()
      data.authType = authType
      if (authType === "bearer") {
        data.bearerToken = bearerToken.trim()
      }
    }

    onSubmit(data)
  }

  return (
    <div className="space-y-4">
      {/* Server Name */}
      <div className="space-y-1.5">
        <Label>Server Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          disabled={isEditing}
          autoFocus={!isEditing}
          className="font-mono"
        />
        {!isEditing && (
          <p className="text-[11px] text-muted-foreground">
            Alphanumeric, dashes, and underscores only
          </p>
        )}
      </div>

      {/* Scope */}
      <div className="space-y-1.5">
        <Label>Scope</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScope("global")}
            className={cn(
              "flex-1 text-sm px-3 py-2 rounded-md border transition-colors",
              scope === "global"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
          >
            Global
          </button>
          <button
            type="button"
            onClick={() => setScope("project")}
            className={cn(
              "flex-1 text-sm px-3 py-2 rounded-md border transition-colors",
              scope === "project"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
          >
            Project
          </button>
        </div>
      </div>

      {/* Project Selector */}
      {scope === "project" && (
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={projectPath} onValueChange={setProjectPath}>
            <SelectTrigger>
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {projectsList?.map((project) => (
                <SelectItem key={project.id} value={project.path}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Transport */}
      <div className="space-y-1.5">
        <Label>Transport</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTransport("stdio")}
            className={cn(
              "flex-1 text-sm px-3 py-2 rounded-md border transition-colors",
              transport === "stdio"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
          >
            Stdio
          </button>
          <button
            type="button"
            onClick={() => setTransport("http")}
            className={cn(
              "flex-1 text-sm px-3 py-2 rounded-md border transition-colors",
              transport === "http"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
          >
            HTTP
          </button>
        </div>
      </div>

      {/* Stdio fields */}
      {transport === "stdio" && (
        <>
          <div className="space-y-1.5">
            <Label>Command</Label>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx, python, node..."
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Arguments</Label>
            <textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder={"One argument per line\n-m\nmcp_server\n--port\n3000"}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              One argument per line
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Environment Variables</Label>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={"KEY=value\nAPI_KEY=sk-..."}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              KEY=value format, one per line
            </p>
          </div>
        </>
      )}

      {/* HTTP fields */}
      {transport === "http" && (
        <>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000/sse"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Authentication</Label>
            <div className="flex gap-2">
              {(["none", "oauth", "bearer"] as AuthType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAuthType(type)}
                  className={cn(
                    "flex-1 text-sm px-3 py-2 rounded-md border transition-colors capitalize",
                    authType === type
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
                  )}
                >
                  {type === "none" ? "None" : type === "oauth" ? "OAuth" : "Bearer Token"}
                </button>
              ))}
            </div>
          </div>

          {authType === "bearer" && (
            <div className="space-y-1.5">
              <Label>Bearer Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="Enter bearer token..."
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  )
}
