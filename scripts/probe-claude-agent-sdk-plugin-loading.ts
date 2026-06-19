import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { query } from "@anthropic-ai/claude-agent-sdk"
import {
  assessClaudeAgentSdkPluginProof,
  type ClaudeAgentSdkPluginInitObservation,
  type ClaudeAgentSdkPluginProofExpectation,
  emptyClaudeAgentSdkPluginInitObservation,
  summarizeClaudeAgentSdkPluginInitMessage,
} from "../src/main/lib/claude/agent-sdk-plugin-proof"

interface ProbeOptions {
  claudePath: string
  timeoutMs: number
  runSdk: boolean
  sendProbePrompt: boolean
  skipMcpDiscovery: boolean
  keepTemp: boolean
  validatePlugin: boolean
  outPath?: string
}

interface ProofWorkspace {
  rootDir: string
  configDir: string
  projectDir: string
  pluginDir: string
  expected: ClaudeAgentSdkPluginProofExpectation
}

interface ValidationResult {
  ran: boolean
  ok: boolean
  status: number | null
  stdout: string
  stderr: string
  error?: string
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
    timeoutMs: Number(readOptionalArg("timeout-ms") ?? 8_000),
    runSdk: readBooleanArg("run-sdk", false),
    sendProbePrompt: readBooleanArg("send-probe-prompt", false),
    skipMcpDiscovery: readBooleanArg("skip-mcp-discovery", true),
    keepTemp: readBooleanArg("keep-temp", false),
    validatePlugin: readBooleanArg("validate-plugin", true),
    outPath: readOptionalArg("out"),
  }
}

function createProofWorkspace(): ProofWorkspace {
  const rootDir = mkdtempSync(path.join(tmpdir(), "locus-claude-plugin-proof-"))
  const configDir = path.join(rootDir, "claude-config")
  const projectDir = path.join(rootDir, "project")
  const pluginDir = path.join(rootDir, "locus-native-proof-plugin")
  const pluginManifestDir = path.join(pluginDir, ".claude-plugin")
  const commandDir = path.join(pluginDir, "commands")
  const skillDir = path.join(pluginDir, "skills", "locus-proof-skill")
  const agentDir = path.join(pluginDir, "agents")
  const scriptDir = path.join(pluginDir, "scripts")

  for (const dir of [
    configDir,
    projectDir,
    pluginManifestDir,
    commandDir,
    skillDir,
    agentDir,
    scriptDir,
  ]) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(
    path.join(projectDir, "AGENTS.md"),
    "This project exists only for a no-turn Claude SDK plugin loading proof.\n",
    "utf-8",
  )
  writeJson(path.join(configDir, "settings.json"), {
    permissions: {
      defaultMode: "plan",
    },
  })
  writeJson(path.join(pluginManifestDir, "plugin.json"), {
    name: "locus-native-proof",
    version: "0.0.0",
    description: "Temporary Locus proof plugin for Claude SDK loading.",
    author: { name: "Locus" },
    commands: "./commands",
    skills: "./skills",
    agents: ["./agents/locus-proof-agent.md"],
    hooks: "./hooks.json",
    mcpServers: "./.mcp.json",
  })
  writeFileSync(
    path.join(commandDir, "locus-proof-command.md"),
    [
      "---",
      "description: Temporary proof command for Locus SDK plugin loading.",
      "---",
      "",
      "Reply with LOCUS_CLAUDE_PLUGIN_COMMAND_PROOF.",
      "",
    ].join("\n"),
    "utf-8",
  )
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: locus-proof-skill",
      "description: Temporary proof skill for Locus SDK plugin loading.",
      "---",
      "",
      "This skill exists only for a Locus runtime-native plugin proof.",
      "",
    ].join("\n"),
    "utf-8",
  )
  writeFileSync(
    path.join(agentDir, "locus-proof-agent.md"),
    [
      "---",
      "name: locus-proof-agent",
      "description: Temporary proof agent for Locus SDK plugin loading.",
      "---",
      "",
      "You are a temporary proof agent for Locus SDK plugin loading.",
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
              command: "printf LOCUS_CLAUDE_PLUGIN_HOOK_PROOF",
            },
          ],
        },
      ],
    },
  })
  writeJson(path.join(pluginDir, ".mcp.json"), {
    mcpServers: {
      "locus-proof-mcp": {
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
      'import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"',
      "",
      "const server = new Server(",
      '  { name: "locus-proof-mcp", version: "0.0.0" },',
      "  { capabilities: { tools: {} } },",
      ")",
      "",
      "server.setRequestHandler(ListToolsRequestSchema, async () => ({",
      "  tools: [",
      "    {",
      '      name: "probe",',
      '      description: "Temporary Locus plugin MCP proof tool.",',
      '      inputSchema: { type: "object", properties: {} },',
      "    },",
      "  ],",
      "}))",
      "",
      "server.setRequestHandler(CallToolRequestSchema, async () => ({",
      '  content: [{ type: "text", text: "LOCUS_CLAUDE_PLUGIN_MCP_PROOF" }],',
      "}))",
      "",
      "await server.connect(new StdioServerTransport())",
      "",
    ].join("\n"),
    "utf-8",
  )

  return {
    rootDir,
    configDir,
    projectDir,
    pluginDir,
    expected: {
      pluginName: "locus-native-proof",
      pluginPath: pluginDir,
      skillName: "locus-proof-skill",
      agentName: "locus-proof-agent",
      commandName: "locus-proof-command",
      mcpServerName: "locus-proof-mcp",
      hookMarker: "LOCUS_CLAUDE_PLUGIN_HOOK_PROOF",
    },
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function validateProofPlugin(
  options: ProbeOptions,
  workspace: ProofWorkspace,
): ValidationResult {
  if (!options.validatePlugin) {
    return { ran: false, ok: false, status: null, stdout: "", stderr: "" }
  }

  try {
    const result = spawnSync(
      options.claudePath,
      ["plugin", "validate", workspace.pluginDir],
      {
        cwd: workspace.projectDir,
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: workspace.configDir,
        },
        encoding: "utf-8",
        timeout: options.timeoutMs,
      },
    )
    return {
      ran: true,
      ok: result.status === 0,
      status: result.status,
      stdout: limitText(result.stdout),
      stderr: limitText(result.stderr),
      ...(result.error ? { error: result.error.message } : {}),
    }
  } catch (error) {
    return {
      ran: true,
      ok: false,
      status: null,
      stdout: "",
      stderr: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runSdkProof(
  options: ProbeOptions,
  workspace: ProofWorkspace,
): Promise<{
  init: ClaudeAgentSdkPluginInitObservation
  hookOutputs: string[]
  reachedModelTurn: boolean
  errorMessage?: string
  stderr: string[]
  messageTypes: string[]
}> {
  const abortController = new AbortController()
  const stderr: string[] = []
  const hookOutputs: string[] = []
  const messageTypes: string[] = []
  let init = emptyClaudeAgentSdkPluginInitObservation()
  let reachedModelTurn = false
  let closedAfterInit = false
  let errorMessage: string | undefined
  const timeout = setTimeout(() => {
    errorMessage = `Timed out waiting for Claude SDK init after ${options.timeoutMs}ms`
    abortController.abort()
  }, options.timeoutMs)

  const sdkQuery = query({
    prompt: options.sendProbePrompt
      ? "Reply exactly LOCUS_CLAUDE_PLUGIN_PROBE_OK."
      : noInputPrompt(abortController.signal),
    options: {
      cwd: workspace.projectDir,
      pathToClaudeCodeExecutable: options.claudePath,
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: workspace.configDir,
      },
      settingSources: ["project", "user"],
      permissionMode: "plan",
      includeHookEvents: true,
      maxTurns: 1,
      abortController,
      plugins: [
        {
          type: "local",
          path: workspace.pluginDir,
          skipMcpDiscovery: options.skipMcpDiscovery,
        },
      ],
      stderr: (data) => {
        stderr.push(limitText(data))
      },
    },
  })

  try {
    for await (const message of sdkQuery) {
      const messageRecord =
        message && typeof message === "object"
          ? (message as Record<string, unknown>)
          : {}
      messageTypes.push(
        [
          typeof messageRecord.type === "string" ? messageRecord.type : "",
          typeof messageRecord.subtype === "string"
            ? messageRecord.subtype
            : "",
        ]
          .filter(Boolean)
          .join(":"),
      )
      collectHookOutput(message, hookOutputs)

      if (
        messageRecord.type === "assistant" ||
        messageRecord.type === "result"
      ) {
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

async function* noInputPrompt(signal: AbortSignal): AsyncIterable<never> {
  if (!signal.aborted) {
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true })
    })
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

async function main(): Promise<void> {
  const options = loadOptions()
  const workspace = createProofWorkspace()
  const validation = validateProofPlugin(options, workspace)
  let sdkProof: Awaited<ReturnType<typeof runSdkProof>> | null = null

  try {
    if (options.runSdk) {
      sdkProof = await runSdkProof(options, workspace)
    }

    const init = sdkProof?.init ?? emptyClaudeAgentSdkPluginInitObservation()
    const assessment = assessClaudeAgentSdkPluginProof({
      init,
      expected: workspace.expected,
      expectMcpDiscoverySkipped: options.skipMcpDiscovery,
      hookOutputs: sdkProof?.hookOutputs,
      reachedModelTurn: sdkProof?.reachedModelTurn,
      errorMessage: sdkProof?.errorMessage,
    })
    const report = {
      schemaVersion: 1,
      mode: options.runSdk ? "sdk-init" : "dry-run",
      sendProbePrompt: options.sendProbePrompt,
      claudePath: options.claudePath,
      timeoutMs: options.timeoutMs,
      tempRoot: workspace.rootDir,
      configDir: workspace.configDir,
      projectDir: workspace.projectDir,
      pluginDir: workspace.pluginDir,
      pluginConfig: {
        type: "local",
        path: workspace.pluginDir,
        skipMcpDiscovery: options.skipMcpDiscovery,
      },
      expected: workspace.expected,
      validation,
      sdkProof,
      assessment,
      note: options.runSdk
        ? options.sendProbePrompt
          ? "SDK was started with a minimal prompt and closed after the first system init message when available."
          : "SDK was started with an async no-input prompt and closed after the first system init message when available."
        : "Dry run only: the temporary plugin was created and optionally validated, but the Claude SDK was not started.",
    }
    const serialized = `${JSON.stringify(report, null, 2)}\n`
    if (options.outPath) {
      writeFileSync(options.outPath, serialized, "utf-8")
    }
    process.stdout.write(serialized)
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
