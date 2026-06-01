export type CodexRuntimeComponentId =
  | "login-cli"
  | "acp-runtime"
  | "acp-spawn"
  | "login"
  | "provider-profile"
  | "mcp"
  | "local-only"

export type CodexRuntimeComponentStatus =
  | "ready"
  | "missing"
  | "unavailable"
  | "failed"
  | "needs-auth"
  | "blocked"
  | "unknown"

export type CodexRuntimeComponent = {
  id: CodexRuntimeComponentId
  label: string
  status: CodexRuntimeComponentStatus
  ok: boolean
  blocking: boolean
  error: string | null
  hint: string | null
  path?: string | null
}

export type CodexRuntimeBlocker = {
  component: CodexRuntimeComponentId
  status: CodexRuntimeComponentStatus
  message: string
  hint: string | null
}

export type CodexRuntimeAvailability = {
  ok: boolean
  components: CodexRuntimeComponent[]
  blockers: CodexRuntimeBlocker[]
}

export type RuntimeExecutableLike = {
  ok: boolean
  path: string | null
  exists: boolean
  isExecutable: boolean
  error: string | null
  hint: string
}

export type CodexAcpSpawnProbeLike = {
  ok: boolean
  exitCode: number | null
  signal: string | null
  error: string | null
  stdoutPreview: string
  stderrPreview: string
  durationMs: number
}

export type CodexAcpRuntimeLike = RuntimeExecutableLike & {
  spawnProbe: CodexAcpSpawnProbeLike
}

type BuildCodexRuntimeAvailabilityInput = {
  loginCli: RuntimeExecutableLike
  acp: CodexAcpRuntimeLike
}

type RuntimeComponentInput = {
  id: CodexRuntimeComponentId
  label: string
  status: CodexRuntimeComponentStatus
  ok: boolean
  blocking?: boolean
  error?: string | null
  hint?: string | null
  path?: string | null
}

export function createCodexRuntimeComponent(
  input: RuntimeComponentInput,
): CodexRuntimeComponent {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    ok: input.ok,
    blocking: input.blocking ?? !input.ok,
    error: input.error ?? null,
    hint: input.hint ?? null,
    ...(input.path !== undefined ? { path: input.path } : {}),
  }
}

export function buildCodexRuntimeAvailabilityFromComponents(
  components: CodexRuntimeComponent[],
): CodexRuntimeAvailability {
  const blockers = components
    .filter((component) => component.blocking && !component.ok)
    .map(buildBlocker)

  return {
    ok: blockers.length === 0,
    components,
    blockers,
  }
}

function executableComponentStatus(
  executable: RuntimeExecutableLike,
): CodexRuntimeComponentStatus {
  if (executable.ok) return "ready"
  if (!executable.exists) return "missing"
  if (!executable.isExecutable) return "unavailable"
  return "failed"
}

function buildBlocker(component: CodexRuntimeComponent): CodexRuntimeBlocker {
  const message =
    component.error ||
    `${component.label} is ${component.status.replace("-", " ")}.`

  return {
    component: component.id,
    status: component.status,
    message,
    hint: component.hint,
  }
}

export function buildCodexRuntimeAvailability(
  input: BuildCodexRuntimeAvailabilityInput,
): CodexRuntimeAvailability {
  const loginCli = createCodexRuntimeComponent({
    id: "login-cli",
    label: "Codex CLI",
    status: executableComponentStatus(input.loginCli),
    ok: input.loginCli.ok,
    error: input.loginCli.error,
    hint: input.loginCli.hint,
    path: input.loginCli.path,
  })

  const acpRuntime = createCodexRuntimeComponent({
    id: "acp-runtime",
    label: "Codex ACP runtime",
    status: executableComponentStatus(input.acp),
    ok: input.acp.ok,
    error: input.acp.error,
    hint: input.acp.hint,
    path: input.acp.path,
  })

  const acpSpawnBlockedByRuntime = !input.acp.ok
  const acpSpawn = createCodexRuntimeComponent({
    id: "acp-spawn",
    label: "Codex ACP spawn probe",
    status: acpSpawnBlockedByRuntime
      ? "blocked"
      : input.acp.spawnProbe.ok
        ? "ready"
        : "failed",
    ok: input.acp.ok && input.acp.spawnProbe.ok,
    blocking: true,
    error: acpSpawnBlockedByRuntime
      ? input.acp.error
      : input.acp.spawnProbe.error,
    hint: input.acp.hint,
    path: input.acp.path,
  })

  return buildCodexRuntimeAvailabilityFromComponents([
    loginCli,
    acpRuntime,
    acpSpawn,
  ])
}

export function createCodexRuntimeBlocker(
  input: RuntimeComponentInput & { message?: string },
): CodexRuntimeBlocker {
  const component = createCodexRuntimeComponent(input)
  const blocker = buildBlocker(component)
  return input.message ? { ...blocker, message: input.message } : blocker
}

export function buildCodexRuntimeStatusChunk(
  blocker: CodexRuntimeBlocker,
): {
  type: "runtime-status"
  runtime: "codex"
  ok: false
  blocker: CodexRuntimeBlocker
} {
  return {
    type: "runtime-status",
    runtime: "codex",
    ok: false,
    blocker,
  }
}

export function buildCodexCapabilityErrorChunk(
  blocker: CodexRuntimeBlocker,
): {
  type: "capability-error"
  runtime: "codex"
  capability: CodexRuntimeComponentId
  errorText: string
  blocker: CodexRuntimeBlocker
} {
  return {
    type: "capability-error",
    runtime: "codex",
    capability: blocker.component,
    errorText: blocker.message,
    blocker,
  }
}
