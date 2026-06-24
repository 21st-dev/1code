import type {
  CodexBlockStatus,
  CodexConversationBlock,
} from "../../../shared/codex-tool-normalizer"

export const AGENT_ENGINE_IDS = [
  "claude-code",
  "codex",
  "hermes",
  "custom-acp",
] as const

export type AgentEngineId = (typeof AGENT_ENGINE_IDS)[number]
export const DEFAULT_AGENT_ENGINE_ID: AgentEngineId = "hermes"

export type AgentRuntimeAvailability =
  | "available"
  | "needs-auth"
  | "not-installed"
  | "unsupported"
  | "error"

export type AgentRuntimeFeature =
  | "chat"
  | "resume"
  | "fork"
  | "rollback"
  | "mcp"
  | "agents"
  | "skills"
  | "commands"
  | "plugins"
  | "memory"
  | "images"
  | "usage"
  | "permissions"
  | "projects"
  | "library"
  | "pull-requests"
  | "follow-ups"
  | "rate-limits"
  | "realtime-voice"
  | "dictation"
  | "diagnostics"

export type AgentPermissionMode =
  | "plan"
  | "agent"
  | "bypass"
  | "read-only"
  | "ask-approval"
  | "full-access"
  | "custom"

export type AgentRuntimeAuthMethod =
  | "oauth"
  | "api-key"
  | "shell-config"
  | "not-authenticated"
  | "unsupported"
  | "unknown"

export interface AgentRuntimeModel {
  id: string
  label: string
}

export interface AgentRuntimeModelHealth extends AgentRuntimeModel {
  availability: AgentRuntimeAvailability
  reason?: string
}

export interface AgentRuntimeHealth {
  availability: AgentRuntimeAvailability
  statusReason?: string
  authMethod?: AgentRuntimeAuthMethod
  models?: AgentRuntimeModelHealth[]
}

export interface AgentRuntimeManifest {
  id: AgentEngineId
  label: string
  vendor: string
  availability: AgentRuntimeAvailability
  features: AgentRuntimeFeature[]
  defaultModelId?: string
  models?: AgentRuntimeModel[]
  configRoots: {
    user?: string
    project?: string
    sessions?: string
  }
  notes?: string[]
}

export interface AgentRuntimeSessionRef {
  subChatId: string
  chatId: string
  engineId: AgentEngineId
  nativeSessionId?: string | null
  modelId?: string | null
  permissionMode: AgentPermissionMode
  cwd: string
  projectPath?: string | null
  runtimeConfigDir?: string | null
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeStartRequest {
  session: AgentRuntimeSessionRef
  prompt: string
  images?: Array<{
    base64Data: string
    mediaType: string
    filename?: string
  }>
  forceNewSession?: boolean
}

export type AgentRuntimeBlockStatus = CodexBlockStatus | "blocked"

export type AgentRuntimeAutomationAction =
  | "created"
  | "updated"
  | "deleted"
  | "enabled"
  | "disabled"
  | "started"
  | "completed"
  | "failed"
  | "paused"
  | "resumed"

export interface AgentRuntimeBaseConversationBlock {
  id: string
  type: string
  turnId?: string
  status?: AgentRuntimeBlockStatus
  title?: string
  summary?: string
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeAutomationUpdateBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "automation-update"
  automationId?: string
  action?: AgentRuntimeAutomationAction | (string & {})
}

export interface AgentRuntimeMultiAgentActionBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "multi-agent-action"
  agentId?: string
  agentLabel?: string
  action?: "spawn" | "message" | "handoff" | "complete" | "failed" | (string & {})
}

export interface AgentRuntimeContextCompactionBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "context-compaction"
  previousInputTokens?: number
  nextInputTokens?: number
  droppedMessages?: number
}

export interface AgentRuntimeModelChangeBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "model-change" | "model-reroute"
  fromModelId?: string
  toModelId?: string
  reason?: string
}

export interface AgentRuntimeGoalStatusBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "goal-status"
  goalId?: string
}

export interface AgentRuntimeRealtimeStateBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "realtime-state" | "dictation-state"
  mode?: "dictation" | "voice-only" | "voice_and_screen" | (string & {})
  microphoneDeviceId?: string
}

export interface AgentRuntimeQueuedFollowUpBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "queued-follow-up"
  followUpId?: string
  queueState?: "queued" | "sending" | "sent" | "failed" | "cancelled" | (string & {})
}

export interface AgentRuntimeUsageStatusBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "rate-limit-status" | "usage-status"
  window?: "hourly" | "daily" | "weekly" | "monthly" | "annual" | (string & {})
  remaining?: number
  limit?: number
  resetAt?: string
}

export interface AgentRuntimeProjectEventBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "project-event"
  projectId?: string
  projectName?: string
  action?: "created" | "updated" | "pinned" | "unpinned" | "selected" | (string & {})
}

export interface AgentRuntimeLibraryArtifactBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "library-artifact"
  artifactId?: string
  artifactKind?: "file" | "image" | "site" | "document" | "spreadsheet" | (string & {})
  path?: string
  url?: string
}

export interface AgentRuntimePullRequestStatusBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "pull-request-status"
  pullRequestId?: string
  url?: string
  reviewState?: "queued" | "running" | "changes-requested" | "approved" | "failed" | (string & {})
  checksState?: "pending" | "running" | "passing" | "failing" | "unknown" | (string & {})
}

export interface AgentRuntimeDiagnosticSnapshotBlock
  extends AgentRuntimeBaseConversationBlock {
  type: "diagnostic-snapshot"
  snapshotKind?: "child-processes" | "renderer-memory" | "trace-recording" | (string & {})
  path?: string
}

export type AgentRuntimeConversationBlock =
  | CodexConversationBlock
  | AgentRuntimeAutomationUpdateBlock
  | AgentRuntimeMultiAgentActionBlock
  | AgentRuntimeContextCompactionBlock
  | AgentRuntimeModelChangeBlock
  | AgentRuntimeGoalStatusBlock
  | AgentRuntimeRealtimeStateBlock
  | AgentRuntimeQueuedFollowUpBlock
  | AgentRuntimeUsageStatusBlock
  | AgentRuntimeProjectEventBlock
  | AgentRuntimeLibraryArtifactBlock
  | AgentRuntimePullRequestStatusBlock
  | AgentRuntimeDiagnosticSnapshotBlock

export type AgentRuntimeStreamEvent =
  | {
      type: "text"
      text: string
    }
  | {
      type: "tool-call"
      id?: string
      name: string
      input?: unknown
    }
  | {
      type: "tool-result"
      id?: string
      name?: string
      result?: unknown
    }
  | {
      type: "usage"
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
      modelContextWindow?: number
    }
  | {
      type: "conversation-block"
      block: AgentRuntimeConversationBlock
    }
  | {
      type: "conversation-block-update"
      id: string
      patch: Partial<AgentRuntimeConversationBlock>
    }
  | {
      type: "auth-error" | "error"
      message: string
    }
  | {
      type: "finish"
      nativeSessionId?: string | null
      resultSubtype?: "success" | "error" | "cancelled"
    }

export interface AgentRuntimeAdapter {
  manifest: AgentRuntimeManifest
  inspect?(session: AgentRuntimeSessionRef): Promise<AgentRuntimeHealth>
  canStart(session: AgentRuntimeSessionRef): Promise<AgentRuntimeAvailability>
}
