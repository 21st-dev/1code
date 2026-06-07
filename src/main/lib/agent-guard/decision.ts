import path from "node:path"
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk"
import type {
  AgentGuardDecision,
  AgentGuardEvent,
  AgentScopePath,
} from "../../../shared/agent-scope-contracts"
import {
  containsShellControl,
  isHighRiskCommand,
  isSensitiveScopePath,
  normalizeContractRelativePath,
  normalizeToolPathInsideCwd,
  type ValidatedAgentScopeContract,
} from "./contract"

export type ClaudeToolCategory =
  | "read"
  | "write"
  | "shell"
  | "approval"
  | "unknown"

export type ObservedToolRiskLevel = "low" | "medium" | "high" | "catastrophic"

export type ObservedToolRiskCategory =
  | "read"
  | "write"
  | "shell"
  | "approval"
  | "mcp"
  | "unknown"
  | "high-risk-shell"
  | "sensitive-path"
  | "network-egress"

export type ObservedToolDecision = "allow" | "deny"

export type DecideClaudeToolUseInput = {
  contract: ValidatedAgentScopeContract
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId: string
}

export type ClassifyObservedToolRiskInput = {
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId?: string | null
}

export type ObservedToolRisk = {
  toolName: string
  toolUseId?: string | null
  category: ClaudeToolCategory | "mcp"
  riskLevel: ObservedToolRiskLevel
  riskCategories: ObservedToolRiskCategory[]
  catastrophic: boolean
  recommendedDecision: ObservedToolDecision
  reason: string
  command?: string
  paths?: string[]
}

const READ_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "TodoRead",
  "WebFetch",
  "WebSearch",
])

const WRITE_TOOLS = new Set([
  "Edit",
  "MultiEdit",
  "Write",
  "NotebookEdit",
])

const APPROVAL_TOOLS = new Set([
  "AskUserQuestion",
  "ExitPlanMode",
  "TodoWrite",
  "PlanWrite",
])

const READ_ONLY_COMMAND_PATTERNS = [
  /^pwd$/,
  /^ls(?:\s+-[A-Za-z0-9]+)*(?:\s+\S+)?$/,
  /^git\s+status(?:\s+--short|\s+--porcelain(?:=\S+)?)?$/,
  /^git\s+diff(?:\s+--stat|\s+--name-only|\s+--name-status)?(?:\s+--\s+\S+)?$/,
  /^git\s+log(?:\s+--oneline)?(?:\s+-n\s+\d+|\s+-\d+)?$/,
  /^git\s+rev-parse\s+(?:--show-toplevel|--abbrev-ref\s+HEAD|HEAD)$/,
  /^rg(?:\s+-[A-Za-z0-9-]+)*(?:\s+\S+){0,4}$/,
  /^find\s+\S+(?:\s+-maxdepth\s+\d+)?(?:\s+-type\s+[fd])?(?:\s+-name\s+\S+)?$/,
]

export function classifyClaudeTool(toolName: string): ClaudeToolCategory {
  if (READ_TOOLS.has(toolName)) return "read"
  if (WRITE_TOOLS.has(toolName)) return "write"
  if (toolName === "Bash") return "shell"
  if (APPROVAL_TOOLS.has(toolName)) return "approval"
  if (toolName.startsWith("mcp__")) return "unknown"
  return "unknown"
}

function pushUnique<T>(items: T[], item: T): void {
  if (!items.includes(item)) items.push(item)
}

function getObservedPathValues(
  toolName: string,
  toolInput: Record<string, unknown>,
): string[] {
  const rawPaths: unknown[] = []
  if (
    toolName === "Read" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "Write" ||
    toolName === "NotebookEdit"
  ) {
    rawPaths.push(toolInput.file_path, toolInput.path, toolInput.notebook_path)
  } else if (toolName === "Glob" || toolName === "Grep" || toolName === "LS") {
    rawPaths.push(toolInput.path)
  }

  const paths = new Set<string>()
  for (const rawPath of rawPaths) {
    if (typeof rawPath !== "string" || rawPath.trim().length === 0) continue
    paths.add(rawPath.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
  }
  return [...paths]
}

function isObservedSensitivePath(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, "/").replace(/^\.\//, "")
  const relativeCandidate = normalized.replace(/^\/+/, "")
  try {
    if (isSensitiveScopePath(relativeCandidate)) return true
  } catch {
    // Absolute provider paths can still be classified by basename.
  }

  const basename = normalized.split("/").pop()?.toLowerCase() ?? normalized
  return (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename === "id_rsa" ||
    basename === "id_ed25519" ||
    basename.endsWith(".pem") ||
    basename.endsWith(".key")
  )
}

function shellCommandMentionsSensitivePath(command: string): boolean {
  return /(?:^|\s|\/)(?:\.env(?:\.|\b)|id_rsa\b|id_ed25519\b|[^/\s]+\.pem\b|[^/\s]+\.key\b)/i.test(
    command,
  )
}

function isNetworkEgressTool(toolName: string): boolean {
  return (
    toolName === "WebFetch" ||
    toolName === "WebSearch" ||
    toolName.startsWith("mcp__")
  )
}

function isNetworkEgressCommand(command: string): boolean {
  return /\b(?:curl|wget|scp|rsync|ssh|sftp|ftp|nc|netcat|python(?:3)?\s+-m\s+requests|node\s+-e)\b|https?:\/\//i.test(
    command,
  )
}

function isCatastrophicNetworkEgressCommand(command: string): boolean {
  return (
    isNetworkEgressCommand(command) &&
    (shellCommandMentionsSensitivePath(command) ||
      /(?:^|\s)(?:--data(?:-binary)?|-d|-F|--form|-T|--upload-file)(?:\s|=|$)/i.test(
        command,
      ))
  )
}

function maxRiskLevel(
  current: ObservedToolRiskLevel,
  candidate: ObservedToolRiskLevel,
): ObservedToolRiskLevel {
  const order: Record<ObservedToolRiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    catastrophic: 3,
  }
  return order[candidate] > order[current] ? candidate : current
}

function getShellCommand(toolInput: Record<string, unknown>): string {
  const raw = toolInput.command ?? toolInput.cmd
  return typeof raw === "string" ? raw.trim() : ""
}

export function classifyObservedToolRisk({
  toolName,
  toolInput,
  toolUseId = null,
}: ClassifyObservedToolRiskInput): ObservedToolRisk {
  const baseCategory = classifyClaudeTool(toolName)
  const category: ObservedToolRisk["category"] = toolName.startsWith("mcp__")
    ? "mcp"
    : baseCategory
  const riskCategories: ObservedToolRiskCategory[] = []
  let riskLevel: ObservedToolRiskLevel = "low"
  let catastrophic = false
  let reason = `${toolName} observed.`
  const paths = getObservedPathValues(toolName, toolInput)

  if (category === "read") {
    pushUnique(riskCategories, "read")
  } else if (category === "write") {
    pushUnique(riskCategories, "write")
    riskLevel = maxRiskLevel(riskLevel, "medium")
    reason = `${toolName} may modify project files.`
  } else if (category === "shell") {
    pushUnique(riskCategories, "shell")
    riskLevel = maxRiskLevel(riskLevel, "medium")
    reason = "Shell command observed."
  } else if (category === "approval") {
    pushUnique(riskCategories, "approval")
  } else if (category === "mcp") {
    pushUnique(riskCategories, "mcp")
    riskLevel = maxRiskLevel(riskLevel, "high")
    reason = "MCP tool may access external or privileged resources."
  } else {
    pushUnique(riskCategories, "unknown")
    riskLevel = maxRiskLevel(riskLevel, "high")
    reason = "Unclassified tool observed."
  }

  const sensitivePaths = paths.filter(isObservedSensitivePath)
  if (sensitivePaths.length > 0 && category === "write") {
    pushUnique(riskCategories, "sensitive-path")
    riskLevel = "catastrophic"
    catastrophic = true
    reason = `${toolName} targets a sensitive path.`
  }

  const command = category === "shell" ? getShellCommand(toolInput) : ""
  if (command) {
    if (containsShellControl(command)) {
      riskLevel = maxRiskLevel(riskLevel, "high")
      reason = "Shell command contains shell control operators."
    }
    if (isHighRiskCommand(command)) {
      pushUnique(riskCategories, "high-risk-shell")
      riskLevel = "catastrophic"
      catastrophic = true
      reason = "Shell command is high risk or immediately irreversible."
    }
    if (isNetworkEgressCommand(command)) {
      pushUnique(riskCategories, "network-egress")
      riskLevel = maxRiskLevel(riskLevel, "high")
      reason = "Shell command may send data to a network destination."
      if (isCatastrophicNetworkEgressCommand(command)) {
        riskLevel = "catastrophic"
        catastrophic = true
        reason = "Shell command may exfiltrate local data."
      }
    }
  }

  if (isNetworkEgressTool(toolName)) {
    pushUnique(riskCategories, "network-egress")
    riskLevel = maxRiskLevel(riskLevel, "high")
    if (!catastrophic) {
      reason =
        category === "mcp"
          ? "MCP tool may send data outside the local project."
          : `${toolName} may contact a network destination.`
    }
  }

  return {
    toolName,
    toolUseId,
    category,
    riskLevel,
    riskCategories,
    catastrophic,
    recommendedDecision: catastrophic ? "deny" : "allow",
    reason,
    ...(command ? { command } : {}),
    ...(paths.length > 0 ? { paths } : {}),
  }
}

export function extractClaudeToolPaths(
  cwd: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): string[] {
  const rawPaths: unknown[] = []

  if (
    toolName === "Read" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "Write" ||
    toolName === "NotebookEdit"
  ) {
    rawPaths.push(toolInput.file_path, toolInput.path, toolInput.notebook_path)
  } else if (toolName === "Glob" || toolName === "Grep" || toolName === "LS") {
    rawPaths.push(toolInput.path)
  }

  const paths = new Set<string>()
  for (const rawPath of rawPaths) {
    const normalized = normalizeToolPathInsideCwd(cwd, rawPath)
    if (normalized) paths.add(normalized)
  }

  return [...paths]
}

function createGuardEvent(
  contract: ValidatedAgentScopeContract,
  type: AgentGuardEvent["type"],
  details: Omit<AgentGuardEvent, "id" | "runId" | "contractId" | "type" | "createdAt">,
): AgentGuardEvent {
  return {
    id: crypto.randomUUID(),
    runId: contract.runId ?? contract.id,
    contractId: contract.id,
    type,
    createdAt: new Date().toISOString(),
    ...details,
  }
}

function globToRegex(glob: string): RegExp {
  let output = "^"
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]
    const next = glob[index + 1]

    if (char === "*" && next === "*") {
      output += ".*"
      index++
    } else if (char === "*") {
      output += "[^/]*"
    } else if (char === "?") {
      output += "[^/]"
    } else {
      output += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    }
  }
  output += "$"
  return new RegExp(output)
}

export function isScopePathMatch(targetPath: string, scopePath: AgentScopePath): boolean {
  const normalizedTarget = normalizeContractRelativePath(targetPath, {
    allowGlobWildcards: false,
  })
  const normalizedScope = normalizeContractRelativePath(scopePath.path, {
    allowGlobWildcards: scopePath.kind === "glob",
  })

  if (scopePath.kind === "file") {
    return normalizedTarget === normalizedScope
  }

  if (scopePath.kind === "directory") {
    return (
      normalizedTarget === normalizedScope ||
      normalizedTarget.startsWith(`${normalizedScope.replace(/\/$/, "")}/`)
    )
  }

  return globToRegex(normalizedScope).test(normalizedTarget)
}

export function isPathBlockedByContract(
  contract: ValidatedAgentScopeContract,
  targetPath: string,
): boolean {
  return (
    isSensitiveScopePath(targetPath) ||
    contract.blockedPaths.some((scopePath) => isScopePathMatch(targetPath, scopePath))
  )
}

export function isPathInEditableScope(
  contract: ValidatedAgentScopeContract,
  targetPath: string,
): boolean {
  if (isPathBlockedByContract(contract, targetPath)) return false
  return contract.editableScope.some((scopePath) => isScopePathMatch(targetPath, scopePath))
}

function isApprovedSuccessCheck(
  contract: ValidatedAgentScopeContract,
  command: string,
): boolean {
  return contract.successChecks.some((check) => check.command.trim() === command)
}

function isReadOnlyInspectionCommand(command: string): boolean {
  if (!command || command.length > 300) return false
  if (containsShellControl(command) || isHighRiskCommand(command)) return false
  if (/(?:^|\s)(?:\.env(?:\.|\b)|id_rsa\b|id_ed25519\b|[^/\s]+\.pem\b|[^/\s]+\.key\b)/i.test(command)) {
    return false
  }
  return READ_ONLY_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

export function decideClaudeToolUse({
  contract,
  toolName,
  toolInput,
  toolUseId,
}: DecideClaudeToolUseInput): AgentGuardDecision {
  const category = classifyClaudeTool(toolName)

  if (category === "approval" || category === "read") {
    return {
      decision: "allow",
      reason: `${toolName} is allowed in guarded runs.`,
      event: createGuardEvent(contract, "allowed", {
        toolName,
        toolUseId,
        reason: `${toolName} is allowed in guarded runs.`,
      }),
      updatedInput: toolInput,
    }
  }

  if (category === "write") {
    const paths = extractClaudeToolPaths(contract.cwd, toolName, toolInput)
    if (paths.length === 0) {
      return {
        decision: "deny",
        reason: `${toolName} did not provide a project-local target path.`,
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          reason: `${toolName} did not provide a project-local target path.`,
        }),
      }
    }

    const blockedPath = paths.find((targetPath) => isPathBlockedByContract(contract, targetPath))
    if (blockedPath) {
      return {
        decision: "deny",
        reason: `Guarded run blocked ${toolName} from touching protected path "${blockedPath}".`,
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          path: blockedPath,
          paths,
          reason: `Protected path "${blockedPath}" is outside guarded-run policy.`,
        }),
      }
    }

    const outOfScopePath = paths.find((targetPath) => !isPathInEditableScope(contract, targetPath))
    if (outOfScopePath) {
      return {
        decision: "request-expansion",
        requestedPath: outOfScopePath,
        reason: `Guarded run requires approval before ${toolName} can edit "${outOfScopePath}".`,
        event: createGuardEvent(contract, "scope-expansion-request", {
          toolName,
          toolUseId,
          path: outOfScopePath,
          paths,
          reason: `Requested editable scope expansion for "${outOfScopePath}".`,
        }),
      }
    }

    return {
      decision: "allow",
      reason: `${toolName} targets approved editable scope.`,
      event: createGuardEvent(contract, "allowed", {
        toolName,
        toolUseId,
        paths,
        reason: `${toolName} targets approved editable scope.`,
      }),
      updatedInput: toolInput,
    }
  }

  if (category === "shell") {
    const command = getShellCommand(toolInput)
    if (!command) {
      return {
        decision: "deny",
        reason: "Bash command is empty or missing.",
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          reason: "Bash command is empty or missing.",
        }),
      }
    }

    if (isApprovedSuccessCheck(contract, command)) {
      return {
        decision: "allow",
        reason: "Bash command matches an approved success check.",
        event: createGuardEvent(contract, "allowed", {
          toolName,
          toolUseId,
          command,
          reason: "Bash command matches an approved success check.",
        }),
        updatedInput: toolInput,
      }
    }

    if (containsShellControl(command) || isHighRiskCommand(command)) {
      return {
        decision: "deny",
        reason: `Guarded run blocked high-risk or ambiguous shell command: ${command}`,
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          command,
          reason: "High-risk or ambiguous shell command.",
        }),
      }
    }

    if (isReadOnlyInspectionCommand(command)) {
      return {
        decision: "allow",
        reason: "Bash command is a read-only inspection command.",
        event: createGuardEvent(contract, "allowed", {
          toolName,
          toolUseId,
          command,
          reason: "Read-only inspection command.",
        }),
        updatedInput: toolInput,
      }
    }

    return {
      decision: "deny",
      reason: `Guarded runs require explicit success-check approval for shell command: ${command}`,
      event: createGuardEvent(contract, "blocked", {
        toolName,
        toolUseId,
        command,
        reason: "Shell command is not an approved success check or read-only inspection command.",
      }),
    }
  }

  return {
    decision: "deny",
    reason: `Guarded run blocked unclassified tool "${toolName}" until it is classified.`,
    event: createGuardEvent(contract, "blocked", {
      toolName,
      toolUseId,
      reason: "Unclassified tool in guarded run.",
    }),
  }
}

export function toClaudePermissionResult(
  decision: AgentGuardDecision,
): PermissionResult {
  if (decision.decision === "allow") {
    return {
      behavior: "allow",
      updatedInput: decision.updatedInput,
    }
  }

  return {
    behavior: "deny",
    message:
      decision.decision === "request-expansion"
        ? `${decision.reason} Ask the user to approve a scope expansion, then retry after approval.`
        : decision.reason,
  }
}

export function relativeChangedFilePath(filePath: string): string {
  return filePath.split(path.sep).join("/")
}
