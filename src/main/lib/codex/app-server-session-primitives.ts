export type CodexAppServerSessionPrimitive = "fork" | "rollback"

export type CodexAppServerSessionPrimitiveDecision =
  | {
      supported: false
      primitive: CodexAppServerSessionPrimitive
      reason: "unsupported-until-durable-local-file-policy"
      message: string
    }
  | {
      supported: true
      primitive: CodexAppServerSessionPrimitive
      threadId: string
      turnId?: string
    }

export class CodexAppServerSessionPrimitiveUnsupportedError extends Error {
  constructor(decision: Extract<CodexAppServerSessionPrimitiveDecision, { supported: false }>) {
    super(decision.message)
    this.name = "CodexAppServerSessionPrimitiveUnsupportedError"
  }
}

export function resolveCodexAppServerSessionPrimitive(
  primitive: CodexAppServerSessionPrimitive,
): CodexAppServerSessionPrimitiveDecision {
  return {
    supported: false,
    primitive,
    reason: "unsupported-until-durable-local-file-policy",
    message:
      `Codex app-server ${primitive} remains unsupported until Locus has ` +
      "durable thread references and a tested local file rollback policy.",
  }
}

export function assertCodexAppServerSessionPrimitiveSupported(
  primitive: CodexAppServerSessionPrimitive,
): Extract<CodexAppServerSessionPrimitiveDecision, { supported: true }> {
  const decision = resolveCodexAppServerSessionPrimitive(primitive)
  if (!decision.supported) {
    throw new CodexAppServerSessionPrimitiveUnsupportedError(decision)
  }
  return decision
}
