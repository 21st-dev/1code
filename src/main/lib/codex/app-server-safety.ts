export type CodexAppServerServerRequest = {
  method: string
  id?: string | number
  params?: unknown
}

export type CodexAppServerApprovalGateState = {
  approvalHookInstalled: boolean
}

export type CodexAppServerDispatchResult = {
  dispatched: true
}

export type DispatchCodexAppServerServerRequestInput = {
  request: CodexAppServerServerRequest
  gate: CodexAppServerApprovalGateState
  dispatch: (request: CodexAppServerServerRequest) => unknown | Promise<unknown>
}

export const CODEX_APP_SERVER_BUNDLED_SERVER_REQUEST_METHODS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
  "item/permissions/requestApproval",
  "item/tool/call",
  "account/chatgptAuthTokens/refresh",
  "attestation/generate",
  "applyPatchApproval",
  "execCommandApproval",
] as const

export const CODEX_APP_SERVER_BUNDLED_SIDE_EFFECT_SERVER_REQUEST_METHODS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/call",
  "applyPatchApproval",
  "execCommandApproval",
] as const

const KNOWN_SERVER_REQUEST_METHODS = new Set<string>(
  CODEX_APP_SERVER_BUNDLED_SERVER_REQUEST_METHODS,
)

const PRE_EXECUTION_APPROVAL_METHODS = new Set<string>(
  CODEX_APP_SERVER_BUNDLED_SIDE_EFFECT_SERVER_REQUEST_METHODS,
)

export function isCodexAppServerKnownServerRequest(method: string): boolean {
  return KNOWN_SERVER_REQUEST_METHODS.has(method)
}

export function isCodexAppServerPreExecutionApprovalRequest(
  method: string,
): boolean {
  return PRE_EXECUTION_APPROVAL_METHODS.has(method)
}

export function assertCodexAppServerKnownServerRequest(
  request: CodexAppServerServerRequest,
): void {
  if (isCodexAppServerKnownServerRequest(request.method)) {
    return
  }

  throw new Error(
    `Unknown Codex app-server server request method refused by default: ${request.method}.`,
  )
}

export function assertCodexAppServerApprovalHookReady(
  request: CodexAppServerServerRequest,
  gate: CodexAppServerApprovalGateState,
): void {
  assertCodexAppServerKnownServerRequest(request)

  if (!isCodexAppServerPreExecutionApprovalRequest(request.method)) {
    return
  }

  if (!gate.approvalHookInstalled) {
    throw new Error(
      `Codex app-server approval hook is not installed; refusing ${request.method} before side effects.`,
    )
  }
}

export async function dispatchCodexAppServerServerRequest({
  request,
  gate,
  dispatch,
}: DispatchCodexAppServerServerRequestInput): Promise<CodexAppServerDispatchResult> {
  assertCodexAppServerApprovalHookReady(request, gate)
  await dispatch(request)
  return { dispatched: true }
}
