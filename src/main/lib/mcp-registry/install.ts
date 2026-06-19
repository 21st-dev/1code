import type { McpServerConfig } from "../claude-config"
import { writeClaudeMcpServerConfig } from "../runtime-mcp-config/claude"
import type { McpRegistryRuntimeId } from "./installability"
import { previewMcpRegistryRuntimeInstallability } from "./installability"
import type { McpRegistryEntry, McpRegistryInstallTarget } from "./normalize"
import { buildMcpRegistryInstallPreview } from "./preview"
import {
  classifyMcpRegistrySetup,
  type McpRegistrySetupResolutionInput,
} from "./setup"

type ClaudeMcpConfigWriter = typeof writeClaudeMcpServerConfig

export type McpRegistryInstallInput = {
  entry: McpRegistryEntry
  target: McpRegistryInstallTarget
  runtime: McpRegistryRuntimeId
  scope: "global" | "project"
  projectPath?: string
  installName?: string
  resolvedSetup?: McpRegistrySetupResolutionInput
  writeClaudeConfig?: ClaudeMcpConfigWriter
}

export type McpRegistryInstallResult = {
  success: true
  runtime: McpRegistryRuntimeId
  serverName: string
  status: "installed-unverified"
  entryFingerprint: string
  configFingerprint: string
}

function suggestMcpServerName(entry: McpRegistryEntry): string {
  const candidate = entry.name.split("/").at(-1) || entry.entryId
  const normalized = candidate
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "registry_server"
}

function assertSetupResolutionSupported(
  target: McpRegistryInstallTarget,
): void {
  if (
    target.envSchema.length > 0 ||
    target.headerSchema.length > 0 ||
    target.variableSchema.length > 0
  ) {
    throw new Error(
      "MCP registry setup resolution is required before installing this target.",
    )
  }
}

function materializeClaudeMcpConfig(
  target: McpRegistryInstallTarget,
): McpServerConfig {
  if (target.transport === "stdio") {
    if (!target.commandTemplate) {
      throw new Error("Registry target is missing a stdio command.")
    }
    return {
      command: target.commandTemplate,
      ...(target.args.length > 0 ? { args: target.args } : {}),
      ...(target.cwd ? { cwd: target.cwd } : {}),
      transportType: target.transport,
    }
  }

  if (
    target.transport === "http" ||
    target.transport === "sse" ||
    target.transport === "streamable_http"
  ) {
    if (!target.urlTemplate) {
      throw new Error("Registry target is missing a remote URL.")
    }
    return {
      url: target.urlTemplate,
      ...(target.authMetadata.kind === "oauth" ? { authType: "oauth" } : {}),
      transportType: target.transport,
    }
  }

  throw new Error(`Unsupported registry target transport: ${target.transport}`)
}

export async function installMcpRegistryTarget(
  input: McpRegistryInstallInput,
): Promise<McpRegistryInstallResult> {
  if (input.runtime === "codex") {
    throw new Error("Codex MCP registry install is deferred.")
  }

  const installability = previewMcpRegistryRuntimeInstallability({
    entry: input.entry,
    target: input.target,
    runtime: input.runtime,
  })
  if (!installability.installableConfig) {
    throw new Error("Registry target cannot be materialized for this runtime.")
  }

  const setup = classifyMcpRegistrySetup({
    runtime: input.runtime,
    target: input.target,
    resolved: input.resolvedSetup,
  })
  if (setup.missingSetupBehavior !== "none") {
    throw new Error(
      `MCP registry target requires setup: ${setup.missingKeys.join(", ")}`,
    )
  }
  assertSetupResolutionSupported(input.target)

  const preview = buildMcpRegistryInstallPreview({
    entry: input.entry,
    target: input.target,
  })
  const serverName =
    input.installName?.trim() || suggestMcpServerName(input.entry)
  const config: McpServerConfig = {
    ...materializeClaudeMcpConfig(input.target),
    _locusMcpRegistry: {
      providerId: input.entry.providerId,
      entryId: input.entry.entryId,
      targetId: input.target.id,
      runtime: input.runtime,
      status: "installed-unverified",
      entryFingerprint: preview.entryFingerprint,
      configFingerprint: preview.configFingerprint,
      installedAt: new Date().toISOString(),
    },
  }

  await (input.writeClaudeConfig ?? writeClaudeMcpServerConfig)({
    name: serverName,
    scope: input.scope,
    projectPath: input.projectPath,
    config,
  })

  return {
    success: true,
    runtime: input.runtime,
    serverName,
    status: "installed-unverified",
    entryFingerprint: preview.entryFingerprint,
    configFingerprint: preview.configFingerprint,
  }
}
