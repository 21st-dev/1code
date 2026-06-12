import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

type ProbeTier = "zero" | "light" | "explicit"

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
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

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function parseJson(value: string | null | undefined, fallback: any = null): any {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>")
    .replace(/locus-edit-probe-secret-[A-Za-z0-9_-]+/g, "<redacted>")
    .replace(
      /(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{10,})/g,
      "$1<redacted>",
    )
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|token)=\S+/gi, "$1=<redacted>")
}

function redact(value: unknown): string {
  return redactText(JSON.stringify(value, null, 2))
}

function readJsonl(filePath: string): unknown[] {
  if (!existsSync(filePath)) return []
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJson(line, { parseError: true, raw: line }))
}

function parseJsonlText(value: string): unknown[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJson(line, { parseError: true, raw: line }))
}

function resolveNodePath(): string {
  for (const candidate of [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    process.env.NODE_PATH,
  ]) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return "node"
}

function sourceCodexHome(): string {
  return path.resolve(readOptionalArg("source-codex-home") ?? process.env.CODEX_HOME ?? path.join(homedir(), ".codex"))
}

function copyCodexAuthFiles(targetCodexHome: string): string[] {
  const source = sourceCodexHome()
  const copied: string[] = []
  for (const fileName of ["auth.json", "installation_id"]) {
    const sourcePath = path.join(source, fileName)
    if (!existsSync(sourcePath)) continue
    copyFileSync(sourcePath, path.join(targetCodexHome, fileName))
    copied.push(fileName)
  }
  return copied
}

function setupLocusEditProbe(outDir: string): {
  codexHome: string
  toolCallLogPath: string
  copiedAuthFiles: string[]
  secret: string
} {
  const codexHome = path.join(outDir, "codex-home")
  const serverPath = path.join(outDir, "locus-edit-probe-mcp-server.mjs")
  const toolCallLogPath = path.join(outDir, "locus-edit-probe-calls.jsonl")
  const secret = `locus-edit-probe-secret-${Date.now()}`
  rmSync(codexHome, { recursive: true, force: true })
  rmSync(toolCallLogPath, { force: true })
  ensureDir(codexHome)
  ensureDir(outDir)
  writeFileSync(
    serverPath,
    [
      "import fs from 'node:fs'",
      "import readline from 'node:readline'",
      "const logPath = process.env.LOCUS_EDIT_PROBE_LOG",
      "const rl = readline.createInterface({ input: process.stdin })",
      "function log(message) {",
      "  if (!logPath) return",
      "  fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), message }) + '\\n')",
      "}",
      "function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n') }",
      "rl.on('line', (line) => {",
      "  if (!line.trim()) return",
      "  const msg = JSON.parse(line)",
      "  log(msg)",
      "  if (msg.method === 'initialize') {",
      "    send(msg.id, {",
      "      protocolVersion: msg.params?.protocolVersion || '2024-11-05',",
      "      capabilities: { tools: {} },",
      "      serverInfo: { name: 'locus-edit-probe', version: '1.0.0' },",
      "    })",
      "    return",
      "  }",
      "  if (msg.method === 'tools/list') {",
      "    send(msg.id, { tools: [{",
      "      name: 'propose_file_edit',",
      "      description: 'Propose a Locus-controlled file edit. This records structured edit intent only; Locus validates scope, shows a diff, asks for approval, and applies the edit later. Use this for guarded file edits instead of shell file writes.',",
      "      inputSchema: {",
      "        type: 'object',",
      "        properties: {",
      "          path: { type: 'string', description: 'Relative file path inside the current workspace.' },",
      "          operation: { type: 'string', enum: ['create', 'replace', 'patch'] },",
      "          content: { type: 'string', description: 'Full content for create or replace operations.' },",
      "          unified_diff: { type: 'string', description: 'Unified diff for patch operations.' },",
      "        },",
      "        required: ['path', 'operation'],",
      "      },",
      "    }] })",
      "    return",
      "  }",
      "  if (msg.method === 'tools/call') {",
      "    send(msg.id, {",
      "      content: [{ type: 'text', text: 'Locus edit proposal recorded. No filesystem write was performed by this probe.' }],",
      "      isError: false,",
      "    })",
      "    return",
      "  }",
      "  if (msg.id !== undefined) send(msg.id, {})",
      "})",
    ].join("\n"),
  )
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      "[mcp_servers.locus_edit]",
      `command = ${JSON.stringify(resolveNodePath())}`,
      `args = [${JSON.stringify(serverPath)}]`,
      "",
      "[mcp_servers.locus_edit.env]",
      `LOCUS_EDIT_PROBE_LOG = ${JSON.stringify(toolCallLogPath)}`,
      `LOCUS_EDIT_PROBE_SECRET = ${JSON.stringify(secret)}`,
      "",
    ].join("\n"),
  )
  const copiedAuthFiles = readBooleanArg("inherit-codex-auth", false)
    ? copyCodexAuthFiles(codexHome)
    : []
  return { codexHome, toolCallLogPath, copiedAuthFiles, secret }
}

function promptForTier(tier: ProbeTier, canaryPath: string): string {
  const naturalTask = [
    `Create or update ${canaryPath}.`,
    "The file content should be exactly:",
    "LOCUS_EDIT_ADOPTION_OK_20260612",
    "",
    "Do not make any other changes.",
  ].join("\n")
  if (tier === "light") {
    return [
      naturalTask,
      "",
      "If a structured file-editing tool is available, use it instead of shell commands for the file edit.",
    ].join("\n")
  }
  if (tier === "explicit") {
    return [
      naturalTask,
      "",
      "Diagnostic instruction: use the locus_edit MCP server's propose_file_edit tool to propose this edit.",
    ].join("\n")
  }
  return naturalTask
}

function runCommand(params: {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  timeoutMs: number
}): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(params.command, params.args, {
      env: params.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref()
    }, params.timeoutMs)
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer)
      resolve({ exitCode, signal, stdout, stderr, timedOut })
    })
  })
}

function scrubCodexHome(codexHome: string): void {
  const configPath = path.join(codexHome, "config.toml")
  if (existsSync(configPath)) {
    writeFileSync(configPath, redactText(readFileSync(configPath, "utf8")))
  }
  rmSync(path.join(codexHome, "auth.json"), { force: true })
  rmSync(path.join(codexHome, "installation_id"), { force: true })
  rmSync(path.join(codexHome, "sessions"), { recursive: true, force: true })
  rmSync(path.join(codexHome, "shell_snapshots"), { recursive: true, force: true })
  rmSync(path.join(codexHome, "plugins"), { recursive: true, force: true })
  rmSync(path.join(codexHome, ".tmp"), { recursive: true, force: true })
}

async function main() {
  const outDir = path.resolve(readArg("out", path.join(process.cwd(), ".tmp-app-server-smoke", "evidence", "codex-cli-locus-edit-explicit")))
  const project = path.resolve(readArg("project", process.cwd()))
  const tier = readArg("tier", "explicit") as ProbeTier
  if (!["zero", "light", "explicit"].includes(tier)) {
    throw new Error(`Unsupported --tier=${tier}`)
  }
  const model = readArg("model", "gpt-5.5")
  const codexBinary = path.resolve(readArg("codex", path.join(project, "resources", "bin", "darwin-arm64", "codex")))
  const canaryPath = path.relative(project, path.join(outDir, "canary-cli-locus-edit.txt"))
  ensureDir(outDir)
  const setup = setupLocusEditProbe(outDir)
  const outputLastMessagePath = path.join(outDir, "last-message.txt")
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "-m",
    model,
    "-C",
    project,
    "-s",
    "read-only",
    "-o",
    outputLastMessagePath,
    promptForTier(tier, canaryPath),
  ]
  const result = await runCommand({
    command: codexBinary,
    args,
    env: {
      ...process.env,
      CODEX_HOME: setup.codexHome,
    },
    timeoutMs: Number(readArg("timeout-ms", "180000")),
  })
  const mcpLogEntries = readJsonl(setup.toolCallLogPath)
  const codexJsonEvents = parseJsonlText(result.stdout)
  const toolCalls = mcpLogEntries.filter((entry: any) => {
    const message = entry?.message
    return message?.method === "tools/call" && message?.params?.name === "propose_file_edit"
  })
  const codexMcpToolCallEvents = codexJsonEvents.filter((entry: any) => {
    const item = entry?.item
    return item?.type === "mcp_tool_call" &&
      item?.server === "locus_edit" &&
      item?.tool === "propose_file_edit"
  })
  const evidence = {
    scenario: "codex-cli-locus-edit",
    tier,
    model,
    codexBinary,
    copiedAuthFiles: setup.copiedAuthFiles,
    authInherited: setup.copiedAuthFiles.includes("auth.json"),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    codexJsonEvents,
    lastMessage: existsSync(outputLastMessagePath)
      ? readFileSync(outputLastMessagePath, "utf8")
      : null,
    mcpLogEntries,
    locusEditToolCallCount: toolCalls.length,
    locusEditToolCallArguments: toolCalls.map(
      (entry: any) => entry?.message?.params?.arguments ?? null,
    ),
    codexMcpToolCallEventCount: codexMcpToolCallEvents.length,
    codexMcpToolCallEvents,
    canaryPath,
    canaryExists: existsSync(path.join(project, canaryPath)),
  }
  writeFileSync(path.join(outDir, "codex-cli-locus-edit.json"), redact(evidence))
  console.log(redact({
    scenario: evidence.scenario,
    tier: evidence.tier,
    model: evidence.model,
    authInherited: evidence.authInherited,
    exitCode: evidence.exitCode,
    signal: evidence.signal,
    timedOut: evidence.timedOut,
    locusEditToolCallCount: evidence.locusEditToolCallCount,
    locusEditToolCallArguments: evidence.locusEditToolCallArguments,
    codexMcpToolCallEventCount: evidence.codexMcpToolCallEventCount,
    canaryExists: evidence.canaryExists,
  }))
  scrubCodexHome(setup.codexHome)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
