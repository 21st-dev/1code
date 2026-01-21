"use client"

import React from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  Check,
  AlertTriangle,
  Minus,
  Loader2,
  Key,
  Terminal,
  Settings,
  Power,
  PowerOff,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  selectedMcpServerAtom,
  mcpAuthModalOpenAtom,
  mcpAuthModalServerIdAtom,
} from "../atoms"
import { Button } from "../../../components/ui/button"
import { Switch } from "../../../components/ui/switch"
import type { McpAuthStatus } from "../types"

function getStatusBadge(status: McpAuthStatus) {
  switch (status) {
    case "configured":
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-600 rounded-full text-xs font-medium">
          <Check className="h-3 w-3" />
          Configured
        </div>
      )
    case "missing_credentials":
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/10 text-yellow-600 rounded-full text-xs font-medium">
          <AlertTriangle className="h-3 w-3" />
          Missing credentials
        </div>
      )
    case "no_auth_needed":
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs font-medium">
          <Minus className="h-3 w-3" />
          No auth needed
        </div>
      )
  }
}

export function McpServerDetail() {
  const selectedServerId = useAtomValue(selectedMcpServerAtom)
  const setAuthModalOpen = useSetAtom(mcpAuthModalOpenAtom)
  const setAuthModalServerId = useSetAtom(mcpAuthModalServerIdAtom)

  const utils = trpc.useUtils()

  const { data: server, isLoading } = trpc.mcp.getServer.useQuery(
    { serverId: selectedServerId! },
    { enabled: !!selectedServerId }
  )

  const toggleMutation = trpc.mcp.toggleServer.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      utils.mcp.getServer.invalidate({ serverId: selectedServerId! })
    },
  })

  const handleConfigureAuth = () => {
    if (selectedServerId) {
      setAuthModalServerId(selectedServerId)
      setAuthModalOpen(true)
    }
  }

  const handleToggleEnabled = (enabled: boolean) => {
    if (selectedServerId) {
      toggleMutation.mutate({ serverId: selectedServerId, enabled })
    }
  }

  if (!selectedServerId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Settings className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a server to view details</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Server not found</p>
      </div>
    )
  }

  const envVars = server.config.env || {}
  const hasCredentialVars = server.credentialEnvVars.length > 0

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{server.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{server.id}</p>
          </div>
          {getStatusBadge(server.authStatus)}
        </div>

        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            {server.enabled ? (
              <Power className="h-4 w-4 text-green-500" />
            ) : (
              <PowerOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {server.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <Switch
            checked={server.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={toggleMutation.isPending}
          />
        </div>
      </div>

      {/* Command */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="h-4 w-4" />
          Command
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <code className="text-xs break-all">
            {server.config.command}
            {server.config.args?.map((arg, i) => (
              <span key={i}> {arg}</span>
            ))}
          </code>
        </div>
      </div>

      {/* Environment Variables */}
      {Object.keys(envVars).length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Key className="h-4 w-4" />
            Environment Variables
          </div>
          <div className="bg-muted/50 rounded-lg divide-y divide-border">
            {Object.entries(envVars).map(([key, value]) => {
              const isCredential = server.credentialEnvVars.includes(key)
              return (
                <div key={key} className="p-3">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-medium">{key}</code>
                    {isCredential && (
                      <span className="text-xs text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                        credential
                      </span>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground mt-1 block break-all">
                    {isCredential ? "••••••••" : value || "(empty)"}
                  </code>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Auth Actions */}
      {hasCredentialVars && (
        <div className="pt-2">
          <Button
            onClick={handleConfigureAuth}
            variant={server.authStatus === "missing_credentials" ? "default" : "outline"}
            className="w-full"
          >
            <Key className="h-4 w-4 mr-2" />
            {server.authStatus === "missing_credentials"
              ? "Configure Credentials"
              : "Update Credentials"}
          </Button>
        </div>
      )}
    </div>
  )
}
