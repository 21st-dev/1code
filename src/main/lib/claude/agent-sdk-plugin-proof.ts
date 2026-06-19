import path from "node:path"

export interface ClaudeAgentSdkPluginInitObservation {
  sawInit: boolean
  claudeCodeVersion?: string
  cwd?: string
  permissionMode?: string
  sessionId?: string
  uuid?: string
  plugins: Array<{ name: string; path: string }>
  pluginNames: string[]
  pluginPaths: string[]
  skills: string[]
  agents: string[]
  slashCommands: string[]
  tools: string[]
  mcpServerNames: string[]
}

export interface ClaudeAgentSdkPluginProofExpectation {
  pluginName: string
  pluginPath: string
  skillName: string
  agentName: string
  commandName: string
  mcpServerName: string
  hookMarker?: string
}

export interface ClaudeAgentSdkPluginProofAssessment {
  sawInit: boolean
  pluginListed: boolean
  skillListed: boolean
  agentListed: boolean
  commandListed: boolean
  hookMarkerSeen: boolean
  mcpServerListed: boolean
  mcpDiscoverySkipped: boolean
  nonMcpComponentsAdvertised: boolean
  reachedModelTurn: boolean
  errorMessage?: string
  reasons: string[]
}

export function emptyClaudeAgentSdkPluginInitObservation(): ClaudeAgentSdkPluginInitObservation {
  return {
    sawInit: false,
    plugins: [],
    pluginNames: [],
    pluginPaths: [],
    skills: [],
    agents: [],
    slashCommands: [],
    tools: [],
    mcpServerNames: [],
  }
}

export function summarizeClaudeAgentSdkPluginInitMessage(
  message: unknown,
): ClaudeAgentSdkPluginInitObservation {
  if (!isRecord(message)) {
    return emptyClaudeAgentSdkPluginInitObservation()
  }
  if (message.type !== "system" || message.subtype !== "init") {
    return emptyClaudeAgentSdkPluginInitObservation()
  }

  const plugins = getArray(message.plugins)
    .filter(isRecord)
    .map((plugin) => ({
      name: stringValue(plugin.name),
      path: stringValue(plugin.path),
    }))
    .filter((plugin) => plugin.name || plugin.path)
  const mcpServerNames = getArray(message.mcp_servers)
    .filter(isRecord)
    .map((server) => stringValue(server.name))
    .filter(isNonEmptyString)

  return {
    sawInit: true,
    claudeCodeVersion: stringValue(message.claude_code_version) || undefined,
    cwd: stringValue(message.cwd) || undefined,
    permissionMode: stringValue(message.permissionMode) || undefined,
    sessionId: stringValue(message.session_id) || undefined,
    uuid: stringValue(message.uuid) || undefined,
    plugins,
    pluginNames: plugins.map((plugin) => plugin.name).filter(isNonEmptyString),
    pluginPaths: plugins.map((plugin) => plugin.path).filter(isNonEmptyString),
    skills: getStringArray(message.skills),
    agents: getStringArray(message.agents),
    slashCommands: getStringArray(message.slash_commands),
    tools: getStringArray(message.tools),
    mcpServerNames,
  }
}

export function assessClaudeAgentSdkPluginProof(input: {
  init: ClaudeAgentSdkPluginInitObservation
  expected: ClaudeAgentSdkPluginProofExpectation
  expectMcpDiscoverySkipped?: boolean
  hookOutputs?: string[]
  reachedModelTurn?: boolean
  errorMessage?: string
}): ClaudeAgentSdkPluginProofAssessment {
  const expectMcpDiscoverySkipped = input.expectMcpDiscoverySkipped ?? true
  const pluginListed = input.init.plugins.some(
    (plugin) =>
      matchesLabel(plugin.name, input.expected.pluginName) ||
      sameResolvedPath(plugin.path, input.expected.pluginPath),
  )
  const skillListed = input.init.skills.some((skill) =>
    matchesLabel(skill, input.expected.skillName),
  )
  const agentListed = input.init.agents.some((agent) =>
    matchesLabel(agent, input.expected.agentName),
  )
  const commandListed = input.init.slashCommands.some((command) =>
    matchesLabel(command, input.expected.commandName),
  )
  const hookMarkerSeen = Boolean(
    input.expected.hookMarker &&
      (input.hookOutputs ?? []).some((output) =>
        output.includes(input.expected.hookMarker as string),
      ),
  )
  const mcpServerListed = [
    ...input.init.mcpServerNames,
    ...input.init.tools,
  ].some((name) => matchesLabel(name, input.expected.mcpServerName))
  const mcpDiscoverySkipped = input.init.sawInit && !mcpServerListed
  const nonMcpComponentsAdvertised =
    pluginListed && (skillListed || agentListed || commandListed)
  const reachedModelTurn = input.reachedModelTurn === true
  const reasons: string[] = []

  if (!input.init.sawInit) {
    reasons.push("Claude SDK did not emit a system init message")
  }
  if (!pluginListed) {
    reasons.push("expected local plugin was not listed in SDK init plugins")
  }
  if (!skillListed) {
    reasons.push("expected plugin skill was not listed in SDK init skills")
  }
  if (!agentListed) {
    reasons.push("expected plugin agent was not listed in SDK init agents")
  }
  if (!commandListed) {
    reasons.push(
      "expected plugin command was not listed in SDK init slash_commands",
    )
  }
  if (!input.init.sawInit) {
    reasons.push("MCP discovery skip cannot be assessed without SDK init")
  } else if (expectMcpDiscoverySkipped && !mcpDiscoverySkipped) {
    reasons.push(
      "expected plugin MCP server appeared despite skipMcpDiscovery=true",
    )
  } else if (!expectMcpDiscoverySkipped && !mcpServerListed) {
    reasons.push("expected plugin MCP server was not listed in SDK init")
  }
  if (reachedModelTurn) {
    reasons.push("probe reached a model turn before SDK init proof completed")
  }
  if (input.errorMessage) {
    reasons.push(input.errorMessage)
  }

  return {
    sawInit: input.init.sawInit,
    pluginListed,
    skillListed,
    agentListed,
    commandListed,
    hookMarkerSeen,
    mcpServerListed,
    mcpDiscoverySkipped,
    nonMcpComponentsAdvertised,
    reachedModelTurn,
    errorMessage: input.errorMessage,
    reasons,
  }
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getStringArray(value: unknown): string[] {
  return getArray(value).filter(isNonEmptyString)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function matchesLabel(value: string, expected: string): boolean {
  const normalizedValue = normalizeLabel(value)
  const normalizedExpected = normalizeLabel(expected)
  return (
    normalizedValue === normalizedExpected ||
    normalizedValue.includes(normalizedExpected)
  )
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .replace(/^\/+/, "")
    .replace(/^plugin:/i, "")
    .toLowerCase()
}

function sameResolvedPath(value: string, expected: string): boolean {
  if (!value || !expected) return false
  const resolvedValue = path.resolve(value)
  const resolvedExpected = path.resolve(expected)
  if (process.platform === "win32") {
    return resolvedValue.toLowerCase() === resolvedExpected.toLowerCase()
  }
  return resolvedValue === resolvedExpected
}
