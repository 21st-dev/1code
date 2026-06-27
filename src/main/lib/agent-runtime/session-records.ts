import { getAgentRuntimeManifest } from "./manifests";
import {
  buildMossForkSnapshot,
  buildMossRollbackSnapshot,
  mergeMossSessionControlMetadata,
  type MossForkSnapshot,
  type MossRollbackSnapshot,
} from "./session-actions";
import {
  AGENT_ENGINE_IDS,
  DEFAULT_AGENT_ENGINE_ID,
  type AgentEngineId,
} from "./types";

export interface MossSessionSubChatRecord {
  id: string;
  chatId: string;
  name: string | null;
  mode: string;
  messages: string;
  sessionId: string | null;
  engine: string | null;
  engineSessionId: string | null;
  engineConfigDir: string | null;
  modelId: string | null;
  runtimeMetadata: string | null;
}

export interface MossForkSubChatInsertValues {
  id: string;
  chatId: string;
  name: string;
  mode: string;
  messages: string;
  sessionId: string | null;
  engine: AgentEngineId;
  engineSessionId: string | null;
  engineConfigDir: string | null;
  modelId: string | null;
  runtimeMetadata: string;
}

export interface MossRollbackSubChatUpdateValues {
  messages: string;
  sessionId: string | null;
  engineSessionId: string | null;
  runtimeMetadata: string;
  updatedAt: Date;
}

export interface BuildMossForkSubChatRecordInput {
  sourceSubChat: MossSessionSubChatRecord;
  targetSubChatId: string;
  targetName: string;
  targetMessageId?: string;
  targetMessageIndex?: number;
  nativeBridgePlan?: unknown;
  forceTranscript?: boolean;
  fallbackReason?: string;
  metadata?: Record<string, unknown>;
}

export interface BuildMossForkSubChatRecordResult {
  engine: AgentEngineId;
  sourceNativeSessionId: string | null;
  snapshot: MossForkSnapshot;
  nativeSessionLinked: boolean;
  insertValues: MossForkSubChatInsertValues;
}

export interface BuildMossRollbackSubChatUpdateInput {
  subChat: MossSessionSubChatRecord;
  targetMessageId?: string;
  targetSdkMessageUuid?: string;
  strictTarget?: boolean;
  appliedGitCheckpoint?: boolean;
  nativeBridgePlan?: unknown;
  metadata?: Record<string, unknown>;
}

export interface BuildMossRollbackSubChatUpdateResult {
  engine: AgentEngineId;
  sourceNativeSessionId: string | null;
  snapshot: MossRollbackSnapshot;
  nativeSessionLinked: boolean;
  updateValues: MossRollbackSubChatUpdateValues;
}

export function normalizeMossSessionRecordEngine(
  value: string | null | undefined,
): AgentEngineId {
  return AGENT_ENGINE_IDS.includes(value as AgentEngineId)
    ? (value as AgentEngineId)
    : DEFAULT_AGENT_ENGINE_ID;
}

export function nativeSessionIdForMossSessionRecord(
  subChat: Pick<MossSessionSubChatRecord, "engineSessionId" | "sessionId">,
  engine: AgentEngineId,
): string | null {
  return (
    subChat.engineSessionId ??
    (engine === "claude-code" ? subChat.sessionId : null)
  );
}

export function buildMossForkSubChatRecord(
  input: BuildMossForkSubChatRecordInput,
): BuildMossForkSubChatRecordResult {
  const engine = normalizeMossSessionRecordEngine(input.sourceSubChat.engine);
  const manifest = getAgentRuntimeManifest(engine);
  const originalNativeSessionId = nativeSessionIdForMossSessionRecord(
    input.sourceSubChat,
    engine,
  );
  const sourceNativeSessionId = input.forceTranscript
    ? null
    : originalNativeSessionId;
  const snapshot = buildMossForkSnapshot({
    engine,
    nativeSessionId: sourceNativeSessionId,
    messages: input.sourceSubChat.messages,
    features: manifest.features,
    targetMessageId: input.targetMessageId,
    targetMessageIndex: input.targetMessageIndex,
  });
  const nativeSessionLinked = snapshot.nativeSessionLinked;
  const runtimeMetadata = mergeMossSessionControlMetadata(
    input.sourceSubChat.runtimeMetadata,
    {
      action: "fork",
      mode: snapshot.mode,
      sourceSubChatId: input.sourceSubChat.id,
      sourceEngineSessionId: originalNativeSessionId,
      nativeSessionLinked,
      targetMessageId: input.targetMessageId ?? null,
      targetMessageIndex: input.targetMessageIndex ?? null,
      forkAtSdkUuid: snapshot.forkAtSdkUuid,
      nativeBridgePlan: input.nativeBridgePlan,
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      ...(input.metadata ?? {}),
    },
  );

  return {
    engine,
    sourceNativeSessionId,
    snapshot,
    nativeSessionLinked,
    insertValues: {
      id: input.targetSubChatId,
      chatId: input.sourceSubChat.chatId,
      name: input.targetName,
      mode: input.sourceSubChat.mode,
      messages: JSON.stringify(snapshot.messages),
      sessionId:
        nativeSessionLinked && engine === "claude-code"
          ? input.sourceSubChat.sessionId
          : null,
      engine,
      engineSessionId: nativeSessionLinked ? originalNativeSessionId : null,
      engineConfigDir: input.sourceSubChat.engineConfigDir,
      modelId: input.sourceSubChat.modelId,
      runtimeMetadata,
    },
  };
}

export function buildMossRollbackSubChatUpdate(
  input: BuildMossRollbackSubChatUpdateInput,
): BuildMossRollbackSubChatUpdateResult {
  const engine = normalizeMossSessionRecordEngine(input.subChat.engine);
  const manifest = getAgentRuntimeManifest(engine);
  const sourceNativeSessionId = nativeSessionIdForMossSessionRecord(
    input.subChat,
    engine,
  );
  const snapshot = buildMossRollbackSnapshot({
    engine,
    nativeSessionId: sourceNativeSessionId,
    messages: input.subChat.messages,
    features: manifest.features,
    targetMessageId: input.targetMessageId,
    targetSdkMessageUuid: input.targetSdkMessageUuid,
    strictTarget: input.strictTarget,
  });
  const nativeSessionLinked = snapshot.nativeSessionLinked;

  return {
    engine,
    sourceNativeSessionId,
    snapshot,
    nativeSessionLinked,
    updateValues: {
      messages: JSON.stringify(snapshot.messages),
      sessionId:
        nativeSessionLinked && engine === "claude-code"
          ? input.subChat.sessionId
          : null,
      engineSessionId: nativeSessionLinked ? sourceNativeSessionId : null,
      runtimeMetadata: mergeMossSessionControlMetadata(
        input.subChat.runtimeMetadata,
        {
          action: "rollback",
          mode: snapshot.mode,
          nativeSessionLinked,
          targetMessageId: snapshot.targetMessageId,
          targetSdkMessageUuid: snapshot.targetSdkMessageUuid,
          nativeRollbackTurnCount: snapshot.nativeRollbackTurnCount,
          ...(input.strictTarget ? { strictTarget: true } : {}),
          appliedGitCheckpoint: Boolean(input.appliedGitCheckpoint),
          nativeBridgePlan: input.nativeBridgePlan,
          ...(input.metadata ?? {}),
        },
      ),
      updatedAt: new Date(),
    },
  };
}
