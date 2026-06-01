import { realpath } from "node:fs/promises"
import path, { isAbsolute, relative, resolve, sep, win32 } from "node:path"
import { z } from "zod"
import type {
  AgentScopeContract,
  AgentScopePath,
  AgentSuccessCheck,
} from "../../../shared/agent-scope-contracts"
import {
  assertRegisteredWorktree,
  PathValidationError,
  secureFs,
  validateRelativePath,
} from "../git/security"

export type AgentScopeValidationIssue = {
  code:
    | "INVALID_CONTRACT"
    | "INVALID_STATUS"
    | "MISMATCHED_CONTEXT"
    | "EMPTY_EDITABLE_SCOPE"
    | "INVALID_PATH"
    | "BLOCKED_PATH"
    | "SENSITIVE_PATH"
    | "SYMLINK_ESCAPE"
    | "INVALID_SUCCESS_CHECK"
    | "UNREGISTERED_WORKTREE"
  message: string
  path?: string
  command?: string
}

export class AgentScopeContractValidationError extends Error {
  constructor(public readonly issues: AgentScopeValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid guarded run scope contract")
    this.name = "AgentScopeContractValidationError"
  }
}

const scopePathSchema = z.object({
  path: z.string(),
  kind: z.enum(["file", "directory", "glob"]),
  reason: z.string().max(500).optional(),
  source: z.string().max(80).optional(),
})

const successCheckSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  reason: z.string().max(500).optional(),
  allowShellControl: z.literal(false).optional(),
})

const expansionSchema = z.object({
  id: z.string().min(1),
  requestedAt: z.string().min(1),
  approvedAt: z.string().optional(),
  rejectedAt: z.string().optional(),
  requestedByToolUseId: z.string().optional(),
  paths: z.array(scopePathSchema).optional(),
  successChecks: z.array(successCheckSchema).optional(),
  reason: z.string().min(1),
  toolName: z.string().optional(),
})

export const agentScopeContractInputSchema = z.object({
  id: z.string().min(1),
  version: z.literal(1),
  status: z.enum(["draft", "approved", "expanded", "completed", "rejected"]),
  createdAt: z.string().min(1),
  approvedAt: z.string().optional(),
  source: z.enum(["manual", "plan", "selection", "git", "github", "resume"]),
  chatId: z.string().min(1),
  subChatId: z.string().min(1),
  runId: z.string().optional(),
  cwd: z.string().min(1),
  projectPath: z.string().optional(),
  editableScope: z.array(scopePathSchema),
  readOnlyEvidence: z.array(scopePathSchema),
  successChecks: z.array(successCheckSchema),
  blockedPaths: z.array(scopePathSchema).optional(),
  expansions: z.array(expansionSchema).default([]),
}) satisfies z.ZodType<AgentScopeContract>

export type ValidatedAgentScopeContract = AgentScopeContract & {
  editableScope: AgentScopePath[]
  readOnlyEvidence: AgentScopePath[]
  successChecks: AgentSuccessCheck[]
  blockedPaths: AgentScopePath[]
}

export type ValidateAgentScopeContractOptions = {
  cwd: string
  projectPath?: string
  chatId?: string
  subChatId?: string
  runId?: string
  requireRegisteredWorktree?: boolean
  assertWorktreeRegistered?: (cwd: string) => void
  isSymlinkEscaping?: (cwd: string, relativePath: string) => Promise<boolean>
}

const SENSITIVE_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  ".netrc",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "known_hosts",
])

const SENSITIVE_SEGMENTS = new Set([
  ".ssh",
  ".aws",
  ".azure",
  ".gcloud",
  ".gnupg",
  ".kube",
  ".codex",
  ".1code",
  ".locus",
])

const SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx"]

function issue(
  code: AgentScopeValidationIssue["code"],
  message: string,
  details: Pick<AgentScopeValidationIssue, "path" | "command"> = {},
): AgentScopeValidationIssue {
  return { code, message, ...details }
}

export function isSensitiveScopePath(relativePath: string): boolean {
  const normalized = normalizeContractRelativePath(relativePath, {
    allowGlobWildcards: true,
  })
  const parts = normalized.split("/")
  const basename = parts[parts.length - 1] ?? normalized
  const lowerBasename = basename.toLowerCase()

  if (SENSITIVE_BASENAMES.has(lowerBasename)) return true
  if (lowerBasename.startsWith(".env.")) return true
  if (SENSITIVE_EXTENSIONS.some((ext) => lowerBasename.endsWith(ext))) return true
  return parts.some((part) => SENSITIVE_SEGMENTS.has(part.toLowerCase()))
}

export function containsShellControl(command: string): boolean {
  return /(?:&&|\|\||[;&|<>`$]\(|\n|\r)/.test(command)
}

export function isHighRiskCommand(command: string): boolean {
  const compact = command.toLowerCase().replace(/\s+/g, " ").trim()
  const highRiskPatterns = [
    /\brm\s+-[^&|;]*r[^&|;]*f\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\s+-[^\s]*f/,
    /\bgit\s+push\b.*\s--force(?:\b|=)/,
    /\b(?:npm|pnpm|yarn|bun)\s+publish\b/,
    /\b(?:vercel|netlify|firebase)\s+deploy\b/,
    /\bsudo\b/,
    /\bchmod\s+777\b/,
    /\bchown\b/,
    /\bcurl\b.*\|\s*(?:sh|bash|zsh)\b/,
    /\bwget\b.*\|\s*(?:sh|bash|zsh)\b/,
    /\b(?:cat|less|more|tail|head|grep|rg)\b.*(?:\.env|id_rsa|id_ed25519|\.pem|\.key)\b/,
  ]

  return highRiskPatterns.some((pattern) => pattern.test(compact))
}

export function normalizeContractRelativePath(
  rawPath: string,
  options: { allowGlobWildcards?: boolean } = {},
): string {
  if (typeof rawPath !== "string") {
    throw new PathValidationError("Path must be a string", "INVALID_TARGET")
  }
  if (rawPath.includes("\0")) {
    throw new PathValidationError("Path contains a null byte", "INVALID_TARGET")
  }

  const trimmed = rawPath.trim()
  if (!trimmed) {
    throw new PathValidationError("Path cannot be empty", "INVALID_TARGET")
  }
  if (isAbsolute(trimmed) || win32.isAbsolute(trimmed)) {
    throw new PathValidationError("Absolute paths are not allowed", "ABSOLUTE_PATH")
  }

  const slashPath = trimmed.replace(/\\/g, "/")
  const normalized = path.posix.normalize(slashPath)
  if (
    normalized === "." ||
    normalized === "/" ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    throw new PathValidationError("Path traversal not allowed", "PATH_TRAVERSAL")
  }

  validateRelativePath(normalized)

  if (!options.allowGlobWildcards && /[*?[\]{}]/.test(normalized)) {
    throw new PathValidationError("Glob wildcards are only allowed for glob scope entries", "INVALID_TARGET")
  }

  return normalized
}

export function normalizeToolPathInsideCwd(cwd: string, rawPath: unknown): string | null {
  if (typeof rawPath !== "string" || rawPath.trim() === "") return null
  if (rawPath.includes("\0")) return null

  const trimmed = rawPath.trim()
  const root = resolve(cwd)
  let relativePath = trimmed

  if (isAbsolute(trimmed) || win32.isAbsolute(trimmed)) {
    const resolvedTarget = resolve(trimmed)
    const fromRoot = relative(root, resolvedTarget)
    const escapesRoot =
      fromRoot === ".." ||
      fromRoot.startsWith(`..${sep}`) ||
      isAbsolute(fromRoot)

    if (escapesRoot) {
      return null
    }
    relativePath = fromRoot
  }

  try {
    return normalizeContractRelativePath(relativePath, { allowGlobWildcards: false })
  } catch {
    return null
  }
}

async function normalizeScopePath(
  cwd: string,
  item: AgentScopePath,
  opts: ValidateAgentScopeContractOptions,
): Promise<AgentScopePath | AgentScopeValidationIssue> {
  let normalizedPath: string
  try {
    normalizedPath = normalizeContractRelativePath(item.path, {
      allowGlobWildcards: item.kind === "glob",
    })
  } catch (error) {
    return issue(
      "INVALID_PATH",
      error instanceof Error ? error.message : "Invalid scope path",
      { path: item.path },
    )
  }

  if (isSensitiveScopePath(normalizedPath)) {
    return issue(
      "SENSITIVE_PATH",
      `Guarded runs cannot target sensitive path "${normalizedPath}".`,
      { path: normalizedPath },
    )
  }

  if (item.kind !== "glob") {
    const isEscaping =
      opts.isSymlinkEscaping
        ? await opts.isSymlinkEscaping(cwd, normalizedPath)
        : await secureFs.isSymlinkEscaping(cwd, normalizedPath)
    if (isEscaping) {
      return issue(
        "SYMLINK_ESCAPE",
        `Scope path "${normalizedPath}" resolves outside the worktree.`,
        { path: normalizedPath },
      )
    }
  }

  return {
    ...item,
    path: normalizedPath,
  }
}

function normalizeSuccessCheck(
  check: AgentSuccessCheck,
): AgentSuccessCheck | AgentScopeValidationIssue {
  const command = check.command.trim()
  if (!command) {
    return issue("INVALID_SUCCESS_CHECK", "Success check command cannot be empty")
  }
  if (command.length > 400 || command.includes("\0")) {
    return issue(
      "INVALID_SUCCESS_CHECK",
      "Success check command is too long or contains invalid characters.",
      { command },
    )
  }
  if (containsShellControl(command) || isHighRiskCommand(command)) {
    return issue(
      "INVALID_SUCCESS_CHECK",
      "Success checks must be bounded commands without shell control or high-risk operations.",
      { command },
    )
  }

  let cwd = check.cwd?.trim()
  if (cwd) {
    try {
      cwd = normalizeContractRelativePath(cwd)
    } catch (error) {
      return issue(
        "INVALID_SUCCESS_CHECK",
        error instanceof Error ? error.message : "Invalid success check cwd",
        { command },
      )
    }
  }

  return {
    ...check,
    command,
    ...(cwd ? { cwd } : {}),
  }
}

async function normalizePathArray(
  cwd: string,
  paths: AgentScopePath[],
  opts: ValidateAgentScopeContractOptions,
): Promise<{ paths: AgentScopePath[]; issues: AgentScopeValidationIssue[] }> {
  const normalized: AgentScopePath[] = []
  const issues: AgentScopeValidationIssue[] = []

  for (const item of paths) {
    const result = await normalizeScopePath(cwd, item, opts)
    if ("code" in result) {
      issues.push(result)
    } else {
      normalized.push(result)
    }
  }

  return { paths: normalized, issues }
}

export async function validateAgentScopeContract(
  rawContract: unknown,
  opts: ValidateAgentScopeContractOptions,
): Promise<ValidatedAgentScopeContract> {
  const parsed = agentScopeContractInputSchema.safeParse(rawContract)
  if (!parsed.success) {
    throw new AgentScopeContractValidationError([
      issue("INVALID_CONTRACT", z.prettifyError(parsed.error)),
    ])
  }

  const contract = parsed.data
  const issues: AgentScopeValidationIssue[] = []
  const normalizedCwd = resolve(opts.cwd)
  const contractCwd = resolve(contract.cwd)

  if (contract.status !== "approved" && contract.status !== "expanded") {
    issues.push(
      issue(
        "INVALID_STATUS",
        "Guarded run scope contracts must be approved before runtime dispatch.",
      ),
    )
  }
  if (contractCwd !== normalizedCwd) {
    issues.push(
      issue(
        "MISMATCHED_CONTEXT",
        "Scope contract cwd does not match the selected runtime cwd.",
      ),
    )
  }
  if (opts.projectPath && contract.projectPath && resolve(contract.projectPath) !== resolve(opts.projectPath)) {
    issues.push(
      issue(
        "MISMATCHED_CONTEXT",
        "Scope contract projectPath does not match the selected project.",
      ),
    )
  }
  if (opts.chatId && contract.chatId !== opts.chatId) {
    issues.push(issue("MISMATCHED_CONTEXT", "Scope contract chatId does not match the active chat."))
  }
  if (opts.subChatId && contract.subChatId !== opts.subChatId) {
    issues.push(issue("MISMATCHED_CONTEXT", "Scope contract subChatId does not match the active sub-chat."))
  }
  if (opts.runId && contract.runId && contract.runId !== opts.runId) {
    issues.push(issue("MISMATCHED_CONTEXT", "Scope contract runId does not match the active run."))
  }

  if (opts.requireRegisteredWorktree !== false) {
    try {
      ;(opts.assertWorktreeRegistered ?? assertRegisteredWorktree)(normalizedCwd)
    } catch (error) {
      issues.push(
        issue(
          "UNREGISTERED_WORKTREE",
          error instanceof Error ? error.message : "Workspace path is not registered.",
        ),
      )
    }
  }

  const [
    editableResult,
    evidenceResult,
    blockedResult,
  ] = await Promise.all([
    normalizePathArray(normalizedCwd, contract.editableScope, opts),
    normalizePathArray(normalizedCwd, contract.readOnlyEvidence, opts),
    normalizePathArray(normalizedCwd, contract.blockedPaths ?? [], opts),
  ])
  issues.push(
    ...editableResult.issues,
    ...evidenceResult.issues,
    ...blockedResult.issues,
  )

  if (editableResult.paths.length === 0) {
    issues.push(
      issue(
        "EMPTY_EDITABLE_SCOPE",
        "Guarded Agent runs require at least one editable file, directory, or glob.",
      ),
    )
  }

  const normalizedSuccessChecks: AgentSuccessCheck[] = []
  for (const check of contract.successChecks) {
    const result = normalizeSuccessCheck(check)
    if ("code" in result) {
      issues.push(result)
    } else {
      normalizedSuccessChecks.push(result)
    }
  }

  if (issues.length > 0) {
    throw new AgentScopeContractValidationError(issues)
  }

  return {
    ...contract,
    cwd: normalizedCwd,
    projectPath: contract.projectPath ? resolve(contract.projectPath) : opts.projectPath,
    editableScope: editableResult.paths,
    readOnlyEvidence: evidenceResult.paths,
    successChecks: normalizedSuccessChecks,
    blockedPaths: blockedResult.paths,
    expansions: contract.expansions,
  }
}

export function formatScopeValidationError(error: unknown): string {
  if (error instanceof AgentScopeContractValidationError) {
    return error.issues.map((item) => item.message).join(" ")
  }
  return error instanceof Error ? error.message : String(error)
}

export async function isRealpathOutsideWorktree(
  worktreePath: string,
  relativePath: string,
): Promise<boolean> {
  try {
    const worktreeReal = await realpath(worktreePath)
    const targetReal = await realpath(resolve(worktreePath, relativePath))
    const rel = relative(worktreeReal, targetReal)
    return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)
  } catch {
    return false
  }
}
