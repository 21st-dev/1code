import { homedir } from "node:os"
import path from "node:path"
import { resolveCodexNativeCommand } from "./codex-native-session"
import {
  resolveCodexAppServerPolicies,
  type CodexAppServerApprovalPolicy,
  type CodexAppServerRuntimeMode,
  type CodexAppServerSandboxMode,
} from "./codex-app-server-policy"
import {
  resolveAgentRuntimeProviderInstanceId,
  type AgentRuntimeProviderInstanceId,
} from "./provider-instances"
import type { AgentPermissionMode, AgentRuntimeSessionRef } from "./types"

export type CodexAppServerSandboxPolicy =
  | { type: "readOnly" }
  | { type: "workspaceWrite"; writableRoots?: string[] }
  | { type: "dangerFullAccess" }

export type CodexAppServerInteractionMode = "default" | "plan"

export interface CodexAppServerImageInput {
  type: "image"
  url: string
}

export type CodexAppServerUserInput =
  | {
      type: "text"
      text: string
    }
  | CodexAppServerImageInput

export interface CodexAppServerCollaborationMode {
  mode: CodexAppServerInteractionMode
  settings: {
    model: string
    reasoning_effort: string
    developer_instructions?: string
  }
}

export interface CodexAppServerThreadStartParams {
  cwd: string
  approvalPolicy?: CodexAppServerApprovalPolicy
  sandbox?: CodexAppServerSandboxMode
  model?: string
  serviceTier?: string
}

export interface CodexAppServerThreadResumeParams
  extends CodexAppServerThreadStartParams {
  threadId: string
}

export interface CodexAppServerThreadForkParams
  extends CodexAppServerThreadStartParams {
  threadId: string
}

export interface CodexAppServerTurnStartParams {
  threadId: string
  input: CodexAppServerUserInput[]
  approvalPolicy?: CodexAppServerApprovalPolicy
  sandboxPolicy?: CodexAppServerSandboxPolicy
  model?: string
  serviceTier?: string
  effort?: string
  collaborationMode?: CodexAppServerCollaborationMode
}

export interface CodexAppServerLaunchPlan {
  engine: "codex"
  bridge: "codex-app-server"
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  extendEnv: boolean
  providerInstanceId: AgentRuntimeProviderInstanceId
  modelId?: string
  permissionMode: AgentPermissionMode
  runtimeMode: CodexAppServerRuntimeMode
  approvalPolicy?: CodexAppServerApprovalPolicy
  sandboxMode?: CodexAppServerSandboxMode
  usesCodexConfigDefaults: boolean
  bypassApprovalsAndSandbox: boolean
  notes: string[]
}

export interface BuildCodexAppServerLaunchPlanInput {
  session: AgentRuntimeSessionRef
  command?: string | null
  appServerArgs?: readonly string[] | null
  env?: NodeJS.ProcessEnv | Record<string, string | undefined> | null
  codeHome?: string | null
  homeDir?: string | null
  providerInstanceId?: string | null
}

export interface BuildCodexAppServerThreadParamsInput {
  plan: Pick<
    CodexAppServerLaunchPlan,
    "cwd" | "modelId" | "approvalPolicy" | "sandboxMode" | "usesCodexConfigDefaults"
  >
  serviceTier?: string | null
}

export interface BuildCodexAppServerTurnParamsInput {
  plan: Pick<
    CodexAppServerLaunchPlan,
    "modelId" | "approvalPolicy" | "runtimeMode" | "usesCodexConfigDefaults"
  >
  threadId: string
  prompt?: string | null
  images?: readonly CodexAppServerImageInput[] | null
  serviceTier?: string | null
  effort?: string | null
  interactionMode?: CodexAppServerInteractionMode | null
  developerInstructions?: string | null
}

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readMetadataModelSelection(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const modelSelection = metadata?.modelSelection
  return isRecord(modelSelection) ? modelSelection : null
}

function requireCleanString(
  value: string | null | undefined,
  label: string,
): string {
  const cleaned = cleanString(value)
  if (!cleaned) {
    throw new Error(`Codex app-server ${label} is required.`)
  }
  return cleaned
}

function cleanAppServerArgs(args: readonly string[] | null | undefined): string[] {
  return (args ?? [])
    .map((argument) => cleanString(argument))
    .filter((argument): argument is string => Boolean(argument))
}

function cleanEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | null | undefined,
): Record<string, string> {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value !== undefined) cleaned[key] = value
  }
  return cleaned
}

function expandHomePath(value: string, homeDir: string): string {
  if (value === "~") return homeDir
  if (value.startsWith("~/")) return path.join(homeDir, value.slice(2))
  return value
}

function resolveCodeHome(input: BuildCodexAppServerLaunchPlanInput): string | undefined {
  const configured = cleanString(input.codeHome) ?? cleanString(input.env?.CODEX_HOME)
  if (!configured) return undefined
  return expandHomePath(configured, cleanString(input.homeDir) ?? homedir())
}

export function codexAppServerRuntimeModeToSandboxPolicy(
  runtimeMode: CodexAppServerRuntimeMode,
): CodexAppServerSandboxPolicy {
  if (runtimeMode === "approval-required") return { type: "readOnly" }
  if (runtimeMode === "auto-accept-edits") return { type: "workspaceWrite" }
  return { type: "dangerFullAccess" }
}

export function hasConfiguredCodexAppServerMcpServer(
  appServerArgs: readonly string[] | null | undefined,
): boolean {
  return appServerArgs?.some((argument) => argument.includes("mcp_servers.")) === true
}

export function isRecoverableCodexAppServerThreadResumeError(
  error: unknown,
): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (!message.includes("thread")) return false
  return [
    "not found",
    "missing thread",
    "no such thread",
    "unknown thread",
    "does not exist",
  ].some((snippet) => message.includes(snippet))
}

export function buildCodexAppServerLaunchPlan(
  input: BuildCodexAppServerLaunchPlanInput,
): CodexAppServerLaunchPlan {
  if (input.session.engineId !== "codex") {
    throw new Error("Codex app-server launch plans require a codex session.")
  }

  const cwd = requireCleanString(input.session.cwd, "working directory")
  const permissionMode = input.session.permissionMode ?? "agent"
  const policies = resolveCodexAppServerPolicies(permissionMode)
  const env = cleanEnv(input.env)
  const codeHome = resolveCodeHome(input)
  if (codeHome) env.CODEX_HOME = codeHome

  const explicitProviderInstanceId = cleanString(input.providerInstanceId)
  const providerInstanceId = explicitProviderInstanceId
    ? (explicitProviderInstanceId as AgentRuntimeProviderInstanceId)
    : resolveAgentRuntimeProviderInstanceId(input.session)
  const metadataModelSelection = readMetadataModelSelection(input.session.metadata)
  const modelId =
    cleanString(input.session.modelSelection?.modelId) ??
    cleanString(metadataModelSelection?.modelId as string | undefined) ??
    cleanString(metadataModelSelection?.model as string | undefined) ??
    cleanString(input.session.modelId)

  return {
    engine: "codex",
    bridge: "codex-app-server",
    command: resolveCodexNativeCommand({
      command: input.command,
      env: input.env,
      homeDir: input.homeDir,
    }),
    args: ["app-server", ...cleanAppServerArgs(input.appServerArgs)],
    cwd,
    env,
    extendEnv: input.env === undefined || input.env === null,
    providerInstanceId,
    ...(modelId ? { modelId } : {}),
    permissionMode,
    runtimeMode: policies.runtimeMode,
    ...(policies.approvalPolicy ? { approvalPolicy: policies.approvalPolicy } : {}),
    ...(policies.sandboxMode ? { sandboxMode: policies.sandboxMode } : {}),
    usesCodexConfigDefaults: policies.usesCodexConfigDefaults,
    bypassApprovalsAndSandbox: policies.bypassApprovalsAndSandbox,
    notes: [
      "Codex app-server is launched as a persistent stdio RPC process.",
      ...policies.notes,
      ...(hasConfiguredCodexAppServerMcpServer(input.appServerArgs)
        ? ["Codex app-server args include inline MCP configuration."]
        : []),
    ],
  }
}

export function buildCodexAppServerThreadStartParams(
  input: BuildCodexAppServerThreadParamsInput,
): CodexAppServerThreadStartParams {
  return {
    cwd: input.plan.cwd,
    ...(!input.plan.usesCodexConfigDefaults && input.plan.approvalPolicy
      ? { approvalPolicy: input.plan.approvalPolicy }
      : {}),
    ...(!input.plan.usesCodexConfigDefaults && input.plan.sandboxMode
      ? { sandbox: input.plan.sandboxMode }
      : {}),
    ...(input.plan.modelId ? { model: input.plan.modelId } : {}),
    ...(cleanString(input.serviceTier) ? { serviceTier: cleanString(input.serviceTier) } : {}),
  }
}

export function buildCodexAppServerThreadResumeParams(
  input: BuildCodexAppServerThreadParamsInput & { threadId: string },
): CodexAppServerThreadResumeParams {
  return {
    threadId: requireCleanString(input.threadId, "thread id"),
    ...buildCodexAppServerThreadStartParams(input),
  }
}

export function buildCodexAppServerThreadForkParams(
  input: BuildCodexAppServerThreadParamsInput & { threadId: string },
): CodexAppServerThreadForkParams {
  return {
    threadId: requireCleanString(input.threadId, "thread id"),
    ...buildCodexAppServerThreadStartParams(input),
  }
}

export function buildCodexAppServerTurnStartParams(
  input: BuildCodexAppServerTurnParamsInput,
): CodexAppServerTurnStartParams {
  const prompt = cleanString(input.prompt)
  const serviceTier = cleanString(input.serviceTier)
  const effort = cleanString(input.effort)
  const developerInstructions = cleanString(input.developerInstructions)
  const inputItems: CodexAppServerUserInput[] = []
  if (prompt) inputItems.push({ type: "text", text: prompt })
  for (const image of input.images ?? []) {
    if (image.type === "image" && cleanString(image.url)) {
      inputItems.push({ type: "image", url: image.url })
    }
  }

  const collaborationMode =
    input.interactionMode && input.plan.modelId
      ? {
          mode: input.interactionMode,
          settings: {
            model: input.plan.modelId,
            reasoning_effort: effort ?? "medium",
            ...(developerInstructions
              ? { developer_instructions: developerInstructions }
              : {}),
          },
        }
      : undefined

  return {
    threadId: requireCleanString(input.threadId, "thread id"),
    input: inputItems,
    ...(!input.plan.usesCodexConfigDefaults && input.plan.approvalPolicy
      ? { approvalPolicy: input.plan.approvalPolicy }
      : {}),
    ...(!input.plan.usesCodexConfigDefaults
      ? { sandboxPolicy: codexAppServerRuntimeModeToSandboxPolicy(input.plan.runtimeMode) }
      : {}),
    ...(input.plan.modelId ? { model: input.plan.modelId } : {}),
    ...(serviceTier ? { serviceTier } : {}),
    ...(effort ? { effort } : {}),
    ...(collaborationMode ? { collaborationMode } : {}),
  }
}
