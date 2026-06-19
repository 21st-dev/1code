import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { query } from "@anthropic-ai/claude-agent-sdk"
import {
  type ClaudeAgentSdkNativePluginConfig,
  type ClaudePluginStagingEntry,
  clearClaudeAgentSdkIsolatedConfigDirCache,
  ensureClaudeAgentSdkIsolatedConfigDir,
} from "../src/main/lib/claude/agent-sdk-config-dir"
import {
  assessClaudeAgentSdkPluginProof,
  type ClaudeAgentSdkPluginInitObservation,
  type ClaudeAgentSdkPluginProofExpectation,
  emptyClaudeAgentSdkPluginInitObservation,
  summarizeClaudeAgentSdkPluginInitMessage,
} from "../src/main/lib/claude/agent-sdk-plugin-proof"
import {
  clearClaudeNativePluginStagingFailures,
  getClaudeNativePluginStagingFailures,
} from "../src/main/lib/claude/plugin-staging-state"
import {
  buildRuntimeNativeActivationIdentity,
  buildRuntimeNativeActivationState,
} from "../src/main/lib/plugins/runtime-native-activation"
import { hashPluginManifestReviewDocument } from "../src/main/lib/plugins/update-review-state"
import {
  buildPluginManifestReviewDocument,
  type PluginManifestReviewDocument,
} from "../src/shared/plugin-update-review"

interface ProbeOptions {
  claudePath: string
  timeoutMs: number
  keepTemp: boolean
}

interface ProofWorkspace {
  rootDir: string
  homeDir: string
  projectDir: string
  reviewedPluginDir: string
  reviewedEntry: ClaudePluginStagingEntry
  missingEntry: ClaudePluginStagingEntry
  expectedReviewed: ClaudeAgentSdkPluginProofExpectation
}

interface SdkInitProof {
  init: ClaudeAgentSdkPluginInitObservation
  hookOutputs: string[]
  reachedModelTurn: boolean
  messageTypes: string[]
  stderr: string[]
  errorMessage?: string
}

function readOptionalArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function readBooleanArg(name: string, fallback = false): boolean {
  const value = readOptionalArg(name)
  if (value === undefined) return fallback
  return value === "1" || value === "true" || value === "yes"
}

function defaultClaudePath(): string {
  const binaryName = process.platform === "win32" ? "claude.exe" : "claude"
  return path.join(
    process.cwd(),
    "resources",
    "bin",
    `${process.platform}-${process.arch}`,
    binaryName,
  )
}

function loadOptions(): ProbeOptions {
  return {
    claudePath: path.resolve(readOptionalArg("claude") ?? defaultClaudePath()),
    timeoutMs: Number(readOptionalArg("timeout-ms") ?? 15_000),
    keepTemp: readBooleanArg("keep-temp", false),
  }
}

function createProofWorkspace(): ProofWorkspace {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "locus-runtime-native-proof-"),
  )
  const homeDir = path.join(rootDir, "home")
  const projectDir = path.join(rootDir, "project")
  const claudeDir = path.join(homeDir, ".claude")
  const reviewedPluginDir = path.join(rootDir, "reviewed-plugin")
  const reviewedPluginSource = "locus-proof:reviewed@0.0.0"
  const missingPluginSource = "locus-proof:missing@0.0.0"

  mkdirSync(projectDir, { recursive: true })
  mkdirSync(claudeDir, { recursive: true })
  writeFileSync(
    path.join(projectDir, "AGENTS.md"),
    "This project exists only for a Locus managed runtime-native plugin proof.\n",
    "utf-8",
  )
  writeJson(path.join(claudeDir, "settings.json"), {
    enabledPlugins: [reviewedPluginSource, missingPluginSource],
    permissions: { defaultMode: "plan" },
  })

  createRegularSkill(claudeDir)
  createUnreviewedSkillsDirPlugin(claudeDir)
  createReviewedPlugin(reviewedPluginDir)

  return {
    rootDir,
    homeDir,
    projectDir,
    reviewedPluginDir,
    reviewedEntry: {
      pluginSource: reviewedPluginSource,
      marketplace: "locus-managed-proof",
      name: "locus-managed-reviewed",
      version: "0.0.0",
      path: reviewedPluginDir,
      description: "Temporary Locus managed-run proof plugin.",
      category: "proof",
    },
    missingEntry: {
      pluginSource: missingPluginSource,
      marketplace: "locus-managed-proof",
      name: "locus-managed-missing",
      version: "0.0.0",
      path: path.join(rootDir, "missing-plugin"),
      description: "Missing plugin used to prove fail-closed staging.",
      category: "proof",
    },
    expectedReviewed: {
      pluginName: "locus-managed-reviewed",
      pluginPath: reviewedPluginDir,
      skillName: "locus-managed-skill",
      agentName: "locus-managed-agent",
      commandName: "locus-managed-command",
      mcpServerName: "locus-managed-mcp",
      hookMarker: "LOCUS_MANAGED_PLUGIN_HOOK_PROOF",
    },
  }
}

function createRegularSkill(claudeDir: string): void {
  const skillDir = path.join(claudeDir, "skills", "regular-skill")
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: regular-skill",
      "description: Non-plugin skill preserved by managed config staging.",
      "---",
      "",
      "This skill proves ordinary skills still stage into isolated config.",
      "",
    ].join("\n"),
    "utf-8",
  )
}

function createUnreviewedSkillsDirPlugin(claudeDir: string): void {
  const pluginDir = path.join(claudeDir, "skills", "unreviewed-skills-plugin")
  const manifestDir = path.join(pluginDir, ".claude-plugin")
  const skillDir = path.join(pluginDir, "skills", "unreviewed-proof-skill")
  const commandDir = path.join(pluginDir, "commands")
  mkdirSync(manifestDir, { recursive: true })
  mkdirSync(skillDir, { recursive: true })
  mkdirSync(commandDir, { recursive: true })
  writeJson(path.join(manifestDir, "plugin.json"), {
    name: "unreviewed-skills-plugin",
    version: "0.0.0",
    description: "Plugin hidden in the global skills directory.",
    author: { name: "Locus" },
    skills: "./skills",
    commands: "./commands",
  })
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: unreviewed-proof-skill",
      "description: This unreviewed skill must not appear.",
      "---",
      "",
      "If this skill appears, managed config filtering failed.",
      "",
    ].join("\n"),
    "utf-8",
  )
  writeFileSync(
    path.join(commandDir, "unreviewed-proof-command.md"),
    [
      "---",
      "description: This unreviewed command must not appear.",
      "---",
      "",
      "If this command appears, managed config filtering failed.",
      "",
    ].join("\n"),
    "utf-8",
  )
}

function createReviewedPlugin(pluginDir: string): void {
  const manifestDir = path.join(pluginDir, ".claude-plugin")
  const commandDir = path.join(pluginDir, "commands")
  const skillDir = path.join(pluginDir, "skills", "locus-managed-skill")
  const agentDir = path.join(pluginDir, "agents")
  const scriptDir = path.join(pluginDir, "scripts")
  for (const dir of [manifestDir, commandDir, skillDir, agentDir, scriptDir]) {
    mkdirSync(dir, { recursive: true })
  }

  writeJson(path.join(manifestDir, "plugin.json"), {
    name: "locus-managed-reviewed",
    version: "0.0.0",
    description: "Temporary Locus proof plugin for managed config loading.",
    author: { name: "Locus" },
    commands: "./commands",
    skills: "./skills",
    agents: ["./agents/locus-managed-agent.md"],
    hooks: "./hooks.json",
    mcpServers: "./.mcp.json",
  })
  writeFileSync(
    path.join(commandDir, "locus-managed-command.md"),
    [
      "---",
      "description: Temporary managed-run proof command.",
      "---",
      "",
      "Reply with LOCUS_MANAGED_PLUGIN_COMMAND_PROOF.",
      "",
    ].join("\n"),
    "utf-8",
  )
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: locus-managed-skill",
      "description: Temporary managed-run proof skill.",
      "---",
      "",
      "This skill exists only for a Locus managed-run plugin proof.",
      "",
    ].join("\n"),
    "utf-8",
  )
  writeFileSync(
    path.join(agentDir, "locus-managed-agent.md"),
    [
      "---",
      "name: locus-managed-agent",
      "description: Temporary managed-run proof agent.",
      "---",
      "",
      "You are a temporary proof agent for managed plugin loading.",
      "",
    ].join("\n"),
    "utf-8",
  )
  writeJson(path.join(pluginDir, "hooks.json"), {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: "printf LOCUS_MANAGED_PLUGIN_HOOK_PROOF",
            },
          ],
        },
      ],
    },
  })
  writeJson(path.join(pluginDir, ".mcp.json"), {
    mcpServers: {
      "locus-managed-mcp": {
        type: "stdio",
        command: process.execPath,
        args: [path.join(scriptDir, "mcp-server.mjs")],
      },
    },
  })
  writeFileSync(
    path.join(scriptDir, "mcp-server.mjs"),
    [
      'import { Server } from "@modelcontextprotocol/sdk/server/index.js"',
      'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"',
      'import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"',
      "",
      "const server = new Server(",
      '  { name: "locus-managed-mcp", version: "0.0.0" },',
      "  { capabilities: { tools: {} } },",
      ")",
      "",
      "server.setRequestHandler(ListToolsRequestSchema, async () => ({",
      '  tools: [{ name: "managed_probe", inputSchema: { type: "object", properties: {} } }],',
      "}))",
      "",
      "await server.connect(new StdioServerTransport())",
      "",
    ].join("\n"),
    "utf-8",
  )
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

async function prepareManagedConfig(input: {
  workspace: ProofWorkspace
  isolatedConfigDir: string
  safeModeEnabled: boolean
  entries: ClaudePluginStagingEntry[]
}): Promise<ClaudeAgentSdkNativePluginConfig[]> {
  clearClaudeAgentSdkIsolatedConfigDirCache()
  const result = await ensureClaudeAgentSdkIsolatedConfigDir({
    isolatedConfigDir: input.isolatedConfigDir,
    cacheKey: path.basename(input.isolatedConfigDir),
    dependencies: {
      fs,
      homeDir: () => input.workspace.homeDir,
      platform: process.platform,
      getPluginSafeModeState: async () => ({ enabled: input.safeModeEnabled }),
      getClaudePluginStagingEntries: async () => input.entries,
      logger: console,
    },
  })
  return result.nativePluginConfigs
}

async function runSdkInit(input: {
  options: ProbeOptions
  workspace: ProofWorkspace
  isolatedConfigDir: string
  plugins: ClaudeAgentSdkNativePluginConfig[]
}): Promise<SdkInitProof> {
  const abortController = new AbortController()
  const stderr: string[] = []
  const hookOutputs: string[] = []
  const messageTypes: string[] = []
  let init = emptyClaudeAgentSdkPluginInitObservation()
  let reachedModelTurn = false
  let closedAfterInit = false
  let errorMessage: string | undefined
  const timeout = setTimeout(() => {
    errorMessage = `Timed out waiting for Claude SDK init after ${input.options.timeoutMs}ms`
    abortController.abort()
  }, input.options.timeoutMs)

  const sdkQuery = query({
    prompt: "Reply exactly LOCUS_MANAGED_PLUGIN_PROBE_OK.",
    options: {
      cwd: input.workspace.projectDir,
      pathToClaudeCodeExecutable: input.options.claudePath,
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: input.isolatedConfigDir,
        HOME: input.workspace.homeDir,
      },
      settingSources: ["project", "user"],
      permissionMode: "plan",
      includeHookEvents: true,
      maxTurns: 1,
      abortController,
      plugins: input.plugins,
      stderr: (data) => stderr.push(limitText(data)),
    },
  })

  try {
    for await (const message of sdkQuery) {
      const record =
        message && typeof message === "object"
          ? (message as Record<string, unknown>)
          : {}
      messageTypes.push(
        [
          typeof record.type === "string" ? record.type : "",
          typeof record.subtype === "string" ? record.subtype : "",
        ]
          .filter(Boolean)
          .join(":"),
      )
      collectHookOutput(message, hookOutputs)

      if (record.type === "assistant" || record.type === "result") {
        reachedModelTurn = true
      }

      const nextInit = summarizeClaudeAgentSdkPluginInitMessage(message)
      if (nextInit.sawInit) {
        init = nextInit
        closedAfterInit = true
        sdkQuery.close()
        abortController.abort()
        break
      }
    }
  } catch (error) {
    if (!(closedAfterInit && isExpectedCloseError(error))) {
      errorMessage ??= error instanceof Error ? error.message : String(error)
    }
  } finally {
    clearTimeout(timeout)
    sdkQuery.close()
    abortController.abort()
  }

  return {
    init,
    hookOutputs,
    reachedModelTurn,
    errorMessage,
    stderr: stderr.slice(0, 12),
    messageTypes: uniqueStrings(messageTypes).slice(0, 20),
  }
}

function collectHookOutput(message: unknown, outputs: string[]): void {
  if (!message || typeof message !== "object") return
  const record = message as Record<string, unknown>
  if (record.type !== "system") return
  if (
    record.subtype !== "hook_progress" &&
    record.subtype !== "hook_response"
  ) {
    return
  }

  for (const key of ["output", "stdout", "stderr"]) {
    const value = record[key]
    if (typeof value === "string" && value) {
      outputs.push(limitText(value))
    }
  }
}

function isExpectedCloseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /aborted|closed|terminated/i.test(message)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function limitText(value: string): string {
  return value.length > 2_000 ? `${value.slice(0, 2_000)}...` : value
}

function containsLabel(values: string[], label: string): boolean {
  const normalizedLabel = label.toLowerCase()
  return values.some((value) => value.toLowerCase().includes(normalizedLabel))
}

function noUnreviewedPluginSurface(init: ClaudeAgentSdkPluginInitObservation) {
  const joined = [
    ...init.pluginNames,
    ...init.skills,
    ...init.agents,
    ...init.slashCommands,
  ]
    .join("\n")
    .toLowerCase()
  return (
    !joined.includes("unreviewed-skills-plugin") &&
    !joined.includes("unreviewed-proof-skill") &&
    !joined.includes("unreviewed-proof-command")
  )
}

function buildReviewDocument(
  overrides: Partial<PluginManifestReviewDocument> = {},
): PluginManifestReviewDocument {
  return buildPluginManifestReviewDocument({
    runtime: overrides.runtime ?? "claude",
    source: overrides.source ?? "locus-proof:reviewed@0.0.0",
    marketplace: overrides.marketplace ?? "locus-managed-proof",
    name: overrides.name ?? "locus-managed-reviewed",
    version: overrides.version ?? "0.0.0",
    targetMode: overrides.targetMode ?? "manifest-only",
    executionStatus: overrides.executionStatus ?? "not-run-by-locus",
    updatePosture: overrides.updatePosture ?? "review-before-enable",
    componentPaths: overrides.componentPaths ?? {
      commands: "/plugin/commands",
      skills: "/plugin/skills",
      agents: "/plugin/agents",
      mcpServers: "/plugin/.mcp.json",
    },
    components: overrides.components ?? {
      commands: 1,
      skills: 1,
      agents: 1,
      hooks: 1,
      mcpServers: ["locus-managed-mcp"],
    },
    sourcePins: overrides.sourcePins ?? [
      {
        kind: "store-package-sha256",
        value: "sha256:managed-proof-package-a",
      },
    ],
  })
}

function buildPolicyProofs() {
  const reviewDocument = buildReviewDocument()
  const reviewFingerprint = hashPluginManifestReviewDocument(reviewDocument)
  const reviewedIdentity = buildRuntimeNativeActivationIdentity({
    reviewDocument,
    reviewFingerprint,
    packageIdentity: "locus-proof:reviewed@0.0.0",
    packageVersion: "0.0.0",
    packageHash: "sha256:managed-proof-package-a",
  })
  const driftedIdentity = buildRuntimeNativeActivationIdentity({
    reviewDocument,
    reviewFingerprint,
    packageIdentity: "locus-proof:reviewed@0.0.0",
    packageVersion: "0.0.1",
    packageHash: "sha256:managed-proof-package-b",
  })
  const incompleteIdentity = buildRuntimeNativeActivationIdentity({
    reviewDocument: buildReviewDocument({ sourcePins: [] }),
    reviewFingerprint,
    packageIdentity: "locus-proof:reviewed@0.0.0",
    packageVersion: "0.0.0",
    sourcePins: [],
  })

  const allowed = buildRuntimeNativeActivationState({
    runtime: "claude",
    sourceKind: "local-marketplace",
    pluginEnabled: true,
    safeModeEnabled: false,
    manifestReviewStatus: "reviewed",
    identity: reviewedIdentity,
    reviewedIdentityFingerprint: reviewedIdentity.identityFingerprint,
    hasMcpServers: true,
    mcpServerNames: ["locus-managed-mcp"],
    mcpApprovalIdentifiers: {
      "locus-managed-mcp":
        "locus-proof:reviewed@0.0.0:locus-managed-mcp#mcp-sha256:approved",
    },
    approvedPluginMcpServers: [
      "locus-proof:reviewed@0.0.0:locus-managed-mcp#mcp-sha256:approved",
    ],
  }).current

  const driftBlocked = buildRuntimeNativeActivationState({
    runtime: "claude",
    sourceKind: "local-marketplace",
    pluginEnabled: true,
    safeModeEnabled: false,
    manifestReviewStatus: "reviewed",
    identity: driftedIdentity,
    reviewedIdentityFingerprint: reviewedIdentity.identityFingerprint,
    hasMcpServers: false,
    mcpServerNames: [],
    mcpApprovalIdentifiers: {},
    approvedPluginMcpServers: [],
  }).current

  const incompleteBlocked = buildRuntimeNativeActivationState({
    runtime: "claude",
    sourceKind: "local-marketplace",
    pluginEnabled: true,
    safeModeEnabled: false,
    manifestReviewStatus: "reviewed",
    identity: incompleteIdentity,
    reviewedIdentityFingerprint: incompleteIdentity.identityFingerprint,
    hasMcpServers: false,
    mcpServerNames: [],
    mcpApprovalIdentifiers: {},
    approvedPluginMcpServers: [],
  }).current

  const codexBlocked = buildRuntimeNativeActivationState({
    runtime: "codex",
    sourceKind: "cache",
    pluginEnabled: true,
    safeModeEnabled: false,
    manifestReviewStatus: "reviewed",
    identity: {
      ...reviewedIdentity,
      runtime: "codex",
    },
    reviewedIdentityFingerprint: reviewedIdentity.identityFingerprint,
    hasMcpServers: true,
    mcpServerNames: ["locus-managed-mcp"],
    mcpApprovalIdentifiers: {},
    approvedPluginMcpServers: [],
  }).current

  return {
    allowed,
    driftBlocked,
    incompleteBlocked,
    codexBlocked,
    pass:
      allowed.canActivateNative &&
      driftBlocked.reasons.includes("activation-identity-drifted") &&
      incompleteBlocked.reasons.includes("activation-identity-incomplete") &&
      codexBlocked.reasons.includes("runtime-native-unsupported") &&
      codexBlocked.reasons.includes("per-run-plugin-control-missing"),
  }
}

async function main(): Promise<void> {
  const options = loadOptions()
  const workspace = createProofWorkspace()

  try {
    clearClaudeNativePluginStagingFailures()
    const controlledConfigDir = path.join(
      workspace.rootDir,
      "controlled-config",
    )
    const controlledPlugins = await prepareManagedConfig({
      workspace,
      isolatedConfigDir: controlledConfigDir,
      safeModeEnabled: false,
      entries: [workspace.reviewedEntry],
    })
    const controlledSdk = await runSdkInit({
      options,
      workspace,
      isolatedConfigDir: controlledConfigDir,
      plugins: controlledPlugins,
    })
    const controlledAssessment = assessClaudeAgentSdkPluginProof({
      init: controlledSdk.init,
      expected: {
        ...workspace.expectedReviewed,
        pluginPath: controlledPlugins[0]?.path ?? workspace.reviewedPluginDir,
      },
      expectMcpDiscoverySkipped: true,
      hookOutputs: controlledSdk.hookOutputs,
      reachedModelTurn: controlledSdk.reachedModelTurn,
      errorMessage: controlledSdk.errorMessage,
    })
    const controlledChecks = {
      nativePluginConfigCount: controlledPlugins.length,
      reviewedPluginComponentsActive:
        controlledAssessment.nonMcpComponentsAdvertised &&
        controlledAssessment.hookMarkerSeen,
      unreviewedSkillsDirPluginBlocked: noUnreviewedPluginSurface(
        controlledSdk.init,
      ),
      regularSkillPreserved: containsLabel(
        controlledSdk.init.skills,
        "regular-skill",
      ),
      pluginMcpNotActivated:
        controlledAssessment.mcpDiscoverySkipped &&
        !controlledAssessment.mcpServerListed,
    }

    clearClaudeNativePluginStagingFailures()
    const safeModeConfigDir = path.join(workspace.rootDir, "safe-mode-config")
    const safeModePlugins = await prepareManagedConfig({
      workspace,
      isolatedConfigDir: safeModeConfigDir,
      safeModeEnabled: true,
      entries: [workspace.reviewedEntry],
    })
    const safeModeSdk = await runSdkInit({
      options,
      workspace,
      isolatedConfigDir: safeModeConfigDir,
      plugins: safeModePlugins,
    })
    const safeModeChecks = {
      nativePluginConfigCount: safeModePlugins.length,
      reviewedPluginBlocked: !containsLabel(
        safeModeSdk.init.pluginNames,
        "locus-managed-reviewed",
      ),
      unreviewedSkillsDirPluginBlocked: noUnreviewedPluginSurface(
        safeModeSdk.init,
      ),
      regularSkillPreserved: containsLabel(
        safeModeSdk.init.skills,
        "regular-skill",
      ),
      hookNotRun: !safeModeSdk.hookOutputs.some((output) =>
        output.includes("LOCUS_MANAGED_PLUGIN_HOOK_PROOF"),
      ),
    }

    clearClaudeNativePluginStagingFailures()
    const failedConfigDir = path.join(workspace.rootDir, "failed-config")
    const failedPlugins = await prepareManagedConfig({
      workspace,
      isolatedConfigDir: failedConfigDir,
      safeModeEnabled: false,
      entries: [workspace.missingEntry],
    })
    const stagingFailures = getClaudeNativePluginStagingFailures()
    const failureSdk = await runSdkInit({
      options,
      workspace,
      isolatedConfigDir: failedConfigDir,
      plugins: failedPlugins,
    })
    const stagingFailureChecks = {
      nativePluginConfigCount: failedPlugins.length,
      failureRecorded: stagingFailures.some(
        (failure) =>
          failure.pluginSource === workspace.missingEntry.pluginSource &&
          failure.reason === "source-missing",
      ),
      missingPluginNotLoaded: !containsLabel(
        failureSdk.init.pluginNames,
        "locus-managed-missing",
      ),
      regularSkillPreserved: containsLabel(
        failureSdk.init.skills,
        "regular-skill",
      ),
    }

    const policyProofs = buildPolicyProofs()
    const pass =
      controlledChecks.nativePluginConfigCount === 1 &&
      controlledChecks.reviewedPluginComponentsActive &&
      controlledChecks.unreviewedSkillsDirPluginBlocked &&
      controlledChecks.regularSkillPreserved &&
      controlledChecks.pluginMcpNotActivated &&
      safeModeChecks.nativePluginConfigCount === 0 &&
      safeModeChecks.reviewedPluginBlocked &&
      safeModeChecks.unreviewedSkillsDirPluginBlocked &&
      safeModeChecks.regularSkillPreserved &&
      safeModeChecks.hookNotRun &&
      stagingFailureChecks.nativePluginConfigCount === 0 &&
      stagingFailureChecks.failureRecorded &&
      stagingFailureChecks.missingPluginNotLoaded &&
      stagingFailureChecks.regularSkillPreserved &&
      policyProofs.pass

    const report = {
      schemaVersion: 1,
      claudePath: options.claudePath,
      timeoutMs: options.timeoutMs,
      tempRoot: workspace.rootDir,
      controlled: {
        nativePluginConfigs: controlledPlugins,
        sdk: controlledSdk,
        assessment: controlledAssessment,
        checks: controlledChecks,
      },
      safeMode: {
        nativePluginConfigs: safeModePlugins,
        sdk: safeModeSdk,
        checks: safeModeChecks,
      },
      stagingFailure: {
        nativePluginConfigs: failedPlugins,
        stagingFailures,
        sdk: failureSdk,
        checks: stagingFailureChecks,
      },
      policyProofs,
      pass,
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!pass) process.exitCode = 1
  } finally {
    if (!options.keepTemp) {
      rmSync(workspace.rootDir, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
