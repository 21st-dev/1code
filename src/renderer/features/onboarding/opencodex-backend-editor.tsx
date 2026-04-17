"use client"

import { Check, KeyRound, RotateCw, ServerCog } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Logo } from "../../components/ui/logo"
import type { OpenCodexBackendConfig } from "../../lib/atoms"
import { normalizeOpenCodexBackendConfig } from "../../lib/atoms"
import { cn } from "../../lib/utils"
import {
  getOpenCodexBackendRouteTitle,
  openCodexBackendRouteRequiresHost,
  type OpenCodexBackendProviderFamily,
  type OpenCodexBackendRouteKind,
} from "../../../shared/opencodex-backend-route"
import { getOpenCodexBackendTemplate } from "./opencodex-backend-config"

const ROUTE_OPTIONS = [
  {
    id: "codex-subscription",
    title: "Codex Subscription",
    description: "Reuse the machine's local Codex-authenticated session bridge.",
  },
  {
    id: "claude-subscription",
    title: "Claude Subscription",
    description: "Reuse the machine's local Claude-authenticated session bridge.",
  },
  {
    id: "openai-compatible-api",
    title: "OpenAI-Compatible API",
    description: "Route OpenCodex through an OpenAI-compatible API target.",
  },
  {
    id: "anthropic-compatible-api",
    title: "Anthropic-Compatible API",
    description: "Route OpenCodex through an Anthropic-compatible API target.",
  },
  {
    id: "custom-endpoint",
    title: "Custom Endpoint",
    description: "Use a custom local or remote endpoint with an explicit provider family.",
  },
] as const satisfies ReadonlyArray<{
  id: OpenCodexBackendRouteKind
  title: string
  description: string
}>

const CUSTOM_PROVIDER_OPTIONS = [
  {
    id: "openai-compatible",
    title: "OpenAI-Compatible",
    description: "Custom endpoint with OpenAI-style request semantics.",
  },
  {
    id: "anthropic-compatible",
    title: "Anthropic-Compatible",
    description: "Custom endpoint with Anthropic-style request semantics.",
  },
] as const satisfies ReadonlyArray<{
  id: OpenCodexBackendProviderFamily
  title: string
  description: string
}>

type OpenCodexBackendEditorVariant = "onboarding" | "settings"

type OpenCodexBackendHostState = Awaited<
  ReturnType<Window["desktopApi"]["getBackendHostState"]>
>

type OpenCodexBackendEditorProps = {
  variant: OpenCodexBackendEditorVariant
  initialConfig: OpenCodexBackendConfig
  onConfigured?: (config: OpenCodexBackendConfig) => Promise<void> | void
}

function getBackendStatusLabel(
  hostState: OpenCodexBackendHostState | null,
): string {
  switch (hostState?.status) {
    case "ready":
      return "Running"
    case "starting":
      return "Starting"
    case "error":
      return "Error"
    default:
      return "Stopped"
  }
}

function getBackendStatusVariant(
  hostState: OpenCodexBackendHostState | null,
): "secondary" | "outline" | "destructive" {
  switch (hostState?.status) {
    case "ready":
      return "secondary"
    case "error":
      return "destructive"
    default:
      return "outline"
  }
}

export function OpenCodexBackendEditor({
  variant,
  initialConfig,
  onConfigured,
}: OpenCodexBackendEditorProps) {
  const [draft, setDraft] = useState(initialConfig)
  const [error, setError] = useState<string | null>(null)
  const [hostState, setHostState] = useState<OpenCodexBackendHostState | null>(
    null,
  )
  const [isRefreshingHostState, setIsRefreshingHostState] = useState(false)
  const [isApplyingConfig, setIsApplyingConfig] = useState(false)
  const [isRestartingHost, setIsRestartingHost] = useState(false)

  useEffect(() => {
    setDraft(initialConfig)
  }, [initialConfig])

  const normalizedConfig = useMemo(
    () => normalizeOpenCodexBackendConfig(draft),
    [draft],
  )

  const routeNeedsEndpointFields =
    draft.kind === "openai-compatible-api" ||
    draft.kind === "anthropic-compatible-api" ||
    draft.kind === "custom-endpoint"

  const routeRequiresHost = openCodexBackendRouteRequiresHost(draft)

  const refreshHostState = async () => {
    setIsRefreshingHostState(true)
    try {
      const nextHostState = await window.desktopApi.getBackendHostState()
      setHostState(nextHostState)
      return nextHostState
    } catch (hostError) {
      setError(
        hostError instanceof Error
          ? hostError.message
          : "Failed to read local backend host state.",
      )
      return null
    } finally {
      setIsRefreshingHostState(false)
    }
  }

  useEffect(() => {
    void refreshHostState()
  }, [])

  const updateField = (
    field: "baseUrl" | "model" | "apiKey",
    value: string,
  ) => {
    setError(null)
    setDraft((current: OpenCodexBackendConfig) => {
      if (!(field in current)) {
        return current
      }
      return {
        ...current,
        [field]: value,
      } as OpenCodexBackendConfig
    })
  }

  const updateRouteKind = (kind: OpenCodexBackendRouteKind) => {
    setError(null)
    setDraft((current: OpenCodexBackendConfig) => {
      const next = getOpenCodexBackendTemplate(kind)
      if ("apiKey" in next && "apiKey" in current && current.kind === kind) {
        return {
          ...next,
          apiKey: current.apiKey,
        }
      }
      if (kind === "custom-endpoint" && current.kind === "custom-endpoint") {
        return {
          ...next,
          providerFamily: current.providerFamily,
          apiKey: current.apiKey,
        }
      }
      return next
    })
  }

  const updateCustomProviderFamily = (
    providerFamily: OpenCodexBackendProviderFamily,
  ) => {
    setError(null)
    setDraft((current: OpenCodexBackendConfig) => {
      if (current.kind !== "custom-endpoint") {
        return current
      }
      return {
        ...current,
        providerFamily,
      }
    })
  }

  const applyBackendConfig = async () => {
    if (!normalizedConfig) {
      setError(
        routeNeedsEndpointFields
          ? "Complete the route details and credential before applying this backend route."
          : "Select a valid backend route before applying it.",
      )
      return
    }

    setIsApplyingConfig(true)
    setError(null)

    try {
      await window.desktopApi.saveOpenCodexBackendConfig(normalizedConfig)
      const nextHostState = await window.desktopApi.restartBackendHost()
      setHostState(nextHostState)

      if (
        openCodexBackendRouteRequiresHost(normalizedConfig) &&
        nextHostState.status !== "ready"
      ) {
        setError(
          nextHostState.lastError ||
            "OpenCodex could not start the local backend host.",
        )
        return
      }

      await onConfigured?.(normalizedConfig)
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "OpenCodex failed to save or restart the local backend host.",
      )
    } finally {
      setIsApplyingConfig(false)
    }
  }

  const restartBackendHost = async () => {
    setIsRestartingHost(true)
    setError(null)

    try {
      const nextHostState = await window.desktopApi.restartBackendHost()
      setHostState(nextHostState)

      if (routeRequiresHost && nextHostState.status !== "ready") {
        setError(
          nextHostState.lastError ||
            "OpenCodex could not restart the local backend host.",
        )
        return
      }
    } catch (restartError) {
      setError(
        restartError instanceof Error
          ? restartError.message
          : "Failed to restart the local backend host.",
      )
    } finally {
      setIsRestartingHost(false)
    }
  }

  const statusLabel = getBackendStatusLabel(hostState)
  const statusVariant = getBackendStatusVariant(hostState)
  const primaryLabel =
    variant === "onboarding" ? "Continue to Workspace" : "Save Backend"

  const cardClassName =
    variant === "onboarding"
      ? "space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
      : "space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm"

  const credentialPlaceholder =
    draft.kind === "anthropic-compatible-api" ||
    (draft.kind === "custom-endpoint" && draft.providerFamily === "anthropic-compatible")
      ? "sk-ant-..."
      : "sk-..."

  const routeSummary = getOpenCodexBackendRouteTitle(draft)

  return (
    <div className={cardClassName}>
      {variant === "onboarding" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex w-max items-center gap-2 rounded-full border border-border px-3 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Logo className="h-5 w-5" fill="white" />
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background">
              <ServerCog className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Configure OpenCodex Backend
            </h1>
            <p className="mx-auto max-w-[500px] text-sm leading-6 text-muted-foreground">
              Choose one native backend route, keep the APP-Server hidden behind
              the desktop shell, and enter the workspace without any browser
              login flow.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ROUTE_OPTIONS.map((option) => {
          const selected = draft.kind === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => updateRouteKind(option.id)}
              className={cn(
                "relative rounded-2xl border p-4 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-foreground/20",
              )}
            >
              {selected && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <p className="text-sm font-medium">{option.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {option.description}
              </p>
            </button>
          )
        })}
      </div>

      {draft.kind === "custom-endpoint" && (
        <div className="space-y-3 rounded-xl border border-border bg-background/70 p-4">
          <div>
            <div className="text-sm font-medium">Custom Provider Family</div>
            <div className="text-xs text-muted-foreground">
              Pick the request semantics the custom endpoint expects.
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {CUSTOM_PROVIDER_OPTIONS.map((option) => {
              const selected = draft.providerFamily === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateCustomProviderFamily(option.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-foreground/20",
                  )}
                >
                  <p className="text-sm font-medium">{option.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {routeNeedsEndpointFields ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`${variant}-backend-base-url`}>Base URL</Label>
            <Input
              id={`${variant}-backend-base-url`}
              value={"baseUrl" in draft ? draft.baseUrl : ""}
              onChange={(event) => updateField("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${variant}-backend-model`}>Model</Label>
            <Input
              id={`${variant}-backend-model`}
              value={"model" in draft ? draft.model : ""}
              onChange={(event) => updateField("model", event.target.value)}
              placeholder="gpt-5.2"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${variant}-backend-api-key`}>Credential</Label>
            <div className="relative">
              <Input
                id={`${variant}-backend-api-key`}
                type="password"
                value={"apiKey" in draft ? draft.apiKey : ""}
                onChange={(event) => updateField("apiKey", event.target.value)}
                placeholder={credentialPlaceholder}
                className="pr-10 font-mono"
              />
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              OpenCodex stores API-backed route credentials locally and never
              requires the user to open OpenHarness terminals.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{routeSummary}</div>
          <p className="mt-1 leading-6">
            This route uses a local authenticated bridge instead of an inline API
            key. OpenCodex saves the selected route now and keeps host launch
            materialization behind the desktop-controlled runtime seam.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-background/70 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Backend Host</div>
            <div className="text-xs text-muted-foreground">
              APP-Server lifecycle stays inside the desktop shell.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant} className="text-xs">
              {statusLabel}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshHostState()}
              disabled={isRefreshingHostState}
            >
              {isRefreshingHostState ? "Refreshing..." : "Refresh Status"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void restartBackendHost()}
              disabled={isRestartingHost}
            >
              <RotateCw className="mr-1 h-3 w-3" />
              {isRestartingHost ? "Restarting..." : "Restart Host"}
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <span>PID</span>
            <span className="font-mono text-foreground/80">
              {hostState?.pid ?? "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Last event</span>
            <span className="max-w-[220px] truncate font-mono text-foreground/80">
              {hostState?.lastEventType || "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <span>Started</span>
            <span className="max-w-[320px] truncate font-mono text-foreground/80">
              {hostState?.startedAt || "N/A"}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs leading-5 text-muted-foreground">
          {variant === "onboarding"
            ? "OpenCodex opens the workspace only after a valid backend route has been saved."
            : routeRequiresHost
              ? "Saving this route applies it immediately and restarts the hidden APP-Server."
              : "Saving this route updates the local runtime bridge choice without exposing provider login UI."}
        </p>
        <Button
          type="button"
          onClick={() => void applyBackendConfig()}
          disabled={!normalizedConfig || isApplyingConfig}
        >
          {isApplyingConfig
            ? variant === "onboarding"
              ? "Saving Backend Route..."
              : "Saving Backend..."
            : primaryLabel}
        </Button>
      </div>
    </div>
  )
}