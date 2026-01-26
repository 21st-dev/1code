"use client"

import { Eye, EyeOff, X } from "lucide-react"
import { useEffect, useState } from "react"
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
import type { AuthType, McpServerFormData, ScopeType, TransportType } from "./types"

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
  submitLabel = "Add Server",
  isEditing = false,
}: McpServerFormProps) {
  const { data: projects } = trpc.projects.list.useQuery()

  const [name, setName] = useState(initialData?.name || "")
  const [scope, setScope] = useState<ScopeType>(initialData?.scope || "global")
  const [projectPath, setProjectPath] = useState(initialData?.projectPath || "")
  const [transport, setTransport] = useState<TransportType>(initialData?.transport || "stdio")

  // Stdio fields
  const [command, setCommand] = useState(initialData?.command || "")
  const [argsText, setArgsText] = useState(initialData?.args?.join("\n") || "")
  const [envText, setEnvText] = useState(
    initialData?.env
      ? Object.entries(initialData.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : ""
  )

  // HTTP fields
  const [url, setUrl] = useState(initialData?.url || "")
  const [authType, setAuthType] = useState<AuthType>(initialData?.authType || "none")
  const [bearerToken, setBearerToken] = useState(initialData?.bearerToken || "")
  const [showToken, setShowToken] = useState(false)

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Update projectPath when scope changes and no project is selected
  useEffect(() => {
    if (scope === "project" && !projectPath && projects && projects.length > 0) {
      setProjectPath(projects[0].path)
    }
  }, [scope, projectPath, projects])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = "Name is required"
    } else if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      newErrors.name = "Only letters, numbers, underscores, and hyphens allowed"
    }

    if (scope === "project" && !projectPath) {
      newErrors.projectPath = "Please select a project"
    }

    if (transport === "stdio") {
      if (!command.trim()) {
        newErrors.command = "Command is required"
      }
    } else {
      if (!url.trim()) {
        newErrors.url = "URL is required"
      } else {
        try {
          new URL(url)
        } catch {
          newErrors.url = "Invalid URL format"
        }
      }

      if (authType === "bearer" && !bearerToken.trim()) {
        newErrors.bearerToken = "Token is required for Bearer auth"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const args = argsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)

    const env: Record<string, string> = {}
    envText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf("=")
        if (idx > 0) {
          env[line.slice(0, idx)] = line.slice(idx + 1)
        }
      })

    const data: McpServerFormData = {
      name,
      scope,
      projectPath: scope === "project" ? projectPath : undefined,
      transport,
      ...(transport === "stdio"
        ? {
            command,
            args: args.length > 0 ? args : undefined,
            env: Object.keys(env).length > 0 ? env : undefined,
          }
        : {
            url,
            authType,
            bearerToken: authType === "bearer" ? bearerToken : undefined,
          }),
    }

    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Server Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Server Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-mcp-server"
          disabled={isEditing}
          className={cn(errors.name && "border-destructive")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name}</p>
        )}
      </div>

      {/* Scope */}
      <div className="space-y-1.5">
        <Label>Scope</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              checked={scope === "global"}
              onChange={() => setScope("global")}
              className="h-4 w-4"
            />
            <span className="text-sm">Global</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              checked={scope === "project"}
              onChange={() => setScope("project")}
              className="h-4 w-4"
            />
            <span className="text-sm">Project</span>
          </label>
        </div>
        {scope === "project" && (
          <div className="mt-2">
            <Select value={projectPath} onValueChange={setProjectPath}>
              <SelectTrigger className={cn(errors.projectPath && "border-destructive")}>
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.path}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.projectPath && (
              <p className="text-xs text-destructive mt-1">{errors.projectPath}</p>
            )}
          </div>
        )}
      </div>

      {/* Transport Type */}
      <div className="space-y-1.5">
        <Label>Transport</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="transport"
              checked={transport === "stdio"}
              onChange={() => setTransport("stdio")}
              className="h-4 w-4"
            />
            <span className="text-sm">Stdio (local process)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="transport"
              checked={transport === "http"}
              onChange={() => setTransport("http")}
              className="h-4 w-4"
            />
            <span className="text-sm">HTTP (remote)</span>
          </label>
        </div>
      </div>

      {/* Stdio Fields */}
      {transport === "stdio" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="command">Command</Label>
            <Input
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              className={cn(errors.command && "border-destructive")}
            />
            {errors.command && (
              <p className="text-xs text-destructive">{errors.command}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="args">Arguments (one per line)</Label>
            <textarea
              id="args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder={"-y\n@mcp/server-name"}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env">Environment Variables (KEY=value, one per line)</Label>
            <textarea
              id="env"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="API_KEY=your-key"
              rows={2}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
            />
          </div>
        </>
      )}

      {/* HTTP Fields */}
      {transport === "http" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/api"
              className={cn(errors.url && "border-destructive")}
            />
            {errors.url && (
              <p className="text-xs text-destructive">{errors.url}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Authentication</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  checked={authType === "none"}
                  onChange={() => setAuthType("none")}
                  className="h-4 w-4"
                />
                <span className="text-sm">None</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  checked={authType === "oauth"}
                  onChange={() => setAuthType("oauth")}
                  className="h-4 w-4"
                />
                <span className="text-sm">OAuth (auto-discover)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  checked={authType === "bearer"}
                  onChange={() => setAuthType("bearer")}
                  className="h-4 w-4"
                />
                <span className="text-sm">Bearer Token / API Key</span>
              </label>
            </div>
          </div>

          {authType === "bearer" && (
            <div className="space-y-1.5">
              <Label htmlFor="bearerToken">Token</Label>
              <div className="relative">
                <Input
                  id="bearerToken"
                  type={showToken ? "text" : "password"}
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="sk-..."
                  className={cn("pr-16", errors.bearerToken && "border-destructive")}
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {bearerToken && (
                    <button
                      type="button"
                      onClick={() => setBearerToken("")}
                      className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {errors.bearerToken && (
                <p className="text-xs text-destructive">{errors.bearerToken}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
