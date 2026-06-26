import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { app } from "electron"
import { z } from "zod"
import { getBundledClaudeBinaryPath } from "../../claude"
import { resolveDirentType } from "../../fs/dirent"
import {
  assertRelativePathBoundary,
  resolvePathWithinRoot,
} from "../../fs/path-boundary"
import { parseMarkdownFrontmatter } from "../../markdown/frontmatter"
import { getPluginComponentPaths } from "../../plugins"
import { discoverAllowedClaudePluginRuntimeComponents } from "../../plugins/runtime-gates"
import {
  getRuntimeExecutableStatus,
  type RuntimeExecutableStatus,
} from "../../runtime-executable"
import { publicProcedure, router } from "../index"
import { getEnabledPlugins } from "./claude-settings"

export interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project" | "plugin"
  pluginName?: string
  path: string
  content: string
}

export interface RuntimeGuideCommand {
  name: string
  description: string
}

export interface RuntimeCommandGuide {
  runtime: "claude-code" | "codex"
  label: string
  executable: RuntimeExecutableStatus
  version: string | null
  cliCommands: RuntimeGuideCommand[]
  sourceNote: string
  error: string | null
  updatedAt: string
}

export type OfficialCommandProviderId = "claude-code" | "codex"
export type OfficialCommandKind = "cli" | "slash" | "flag"

export interface OfficialCommandEntry {
  provider: OfficialCommandProviderId
  kind: OfficialCommandKind
  name: string
  description: string
  sourceTitle: string
  sourceUrl: string
  maturity?: string
  example?: string
}

export interface OfficialCommandSourceSnapshot {
  title: string
  url: string
  htmlUrl: string
  hash: string | null
  etag: string | null
  lastModified: string | null
  fetchedAt: string | null
  commandCount: number
  error: string | null
}

export interface OfficialProviderSnapshot {
  provider: OfficialCommandProviderId
  label: string
  docsUrl: string
  updatedAt: string | null
  entries: OfficialCommandEntry[]
  sources: OfficialCommandSourceSnapshot[]
  error: string | null
}

export interface OfficialCommandIndexSnapshot {
  schemaVersion: 1
  updatedAt: string | null
  providers: OfficialProviderSnapshot[]
}

const RUNTIME_COMMAND_TIMEOUT_MS = 3000
const OFFICIAL_COMMAND_TIMEOUT_MS = 15000
const OFFICIAL_COMMAND_INDEX_SCHEMA_VERSION = 1

type OfficialSourceParser = "markdown-tables" | "codex-reference" | "index-only"

type OfficialCommandSourceDefinition = {
  provider: OfficialCommandProviderId
  title: string
  url: string
  htmlUrl: string
  parser: OfficialSourceParser
  defaultKind?: OfficialCommandKind
}

type OfficialProviderDefinition = {
  provider: OfficialCommandProviderId
  label: string
  docsUrl: string
  sources: OfficialCommandSourceDefinition[]
}

const OFFICIAL_COMMAND_PROVIDERS: OfficialProviderDefinition[] = [
  {
    provider: "claude-code",
    label: "Claude Code",
    docsUrl: "https://code.claude.com/docs",
    sources: [
      {
        provider: "claude-code",
        title: "Claude Code docs index",
        url: "https://code.claude.com/docs/llms.txt",
        htmlUrl: "https://code.claude.com/docs/llms.txt",
        parser: "index-only",
      },
      {
        provider: "claude-code",
        title: "Claude Code CLI reference",
        url: "https://code.claude.com/docs/en/cli-reference.md",
        htmlUrl: "https://code.claude.com/docs/en/cli-reference",
        parser: "markdown-tables",
        defaultKind: "cli",
      },
      {
        provider: "claude-code",
        title: "Claude Code commands reference",
        url: "https://code.claude.com/docs/en/commands.md",
        htmlUrl: "https://code.claude.com/docs/en/commands",
        parser: "markdown-tables",
        defaultKind: "slash",
      },
    ],
  },
  {
    provider: "codex",
    label: "Codex",
    docsUrl: "https://developers.openai.com/codex",
    sources: [
      {
        provider: "codex",
        title: "Codex docs index",
        url: "https://developers.openai.com/codex/llms.txt",
        htmlUrl: "https://developers.openai.com/codex/llms.txt",
        parser: "index-only",
      },
      {
        provider: "codex",
        title: "Codex CLI reference",
        url: "https://developers.openai.com/codex/cli/reference.md",
        htmlUrl: "https://developers.openai.com/codex/cli/reference",
        parser: "codex-reference",
        defaultKind: "cli",
      },
      {
        provider: "codex",
        title: "Codex slash commands",
        url: "https://developers.openai.com/codex/cli/slash-commands.md",
        htmlUrl: "https://developers.openai.com/codex/cli/slash-commands",
        parser: "markdown-tables",
        defaultKind: "slash",
      },
    ],
  },
]

function getOfficialCommandIndexPath(): string {
  return path.join(
    app.getPath("userData"),
    "command-guide",
    "official-index.json",
  )
}

function emptyOfficialProviderSnapshot(
  provider: OfficialProviderDefinition,
): OfficialProviderSnapshot {
  return {
    provider: provider.provider,
    label: provider.label,
    docsUrl: provider.docsUrl,
    updatedAt: null,
    entries: [],
    sources: provider.sources.map((source) => ({
      title: source.title,
      url: source.url,
      htmlUrl: source.htmlUrl,
      hash: null,
      etag: null,
      lastModified: null,
      fetchedAt: null,
      commandCount: 0,
      error: null,
    })),
    error: null,
  }
}

function emptyOfficialCommandIndex(): OfficialCommandIndexSnapshot {
  return {
    schemaVersion: OFFICIAL_COMMAND_INDEX_SCHEMA_VERSION,
    updatedAt: null,
    providers: OFFICIAL_COMMAND_PROVIDERS.map(emptyOfficialProviderSnapshot),
  }
}

function sha256Short(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchOfficialText(
  source: OfficialCommandSourceDefinition,
): Promise<{
  text: string
  etag: string | null
  lastModified: string | null
}> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    OFFICIAL_COMMAND_TIMEOUT_MS,
  )

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        Accept: "text/markdown,text/plain,*/*",
        "User-Agent": "Locus Command Guide",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    return {
      text: await response.text(),
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function cleanMarkdownInline(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\\|/g, "|")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function splitMarkdownTableRow(row: string): string[] {
  const trimmed = row.trim()
  if (!trimmed.startsWith("|")) return []

  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "")
  const cells: string[] = []
  let current = ""
  let escaped = false

  for (const char of body) {
    if (escaped) {
      current += `\\${char}`
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === "|") {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  if (escaped) current += "\\"
  cells.push(current.trim())
  return cells
}

function isMarkdownSeparatorRow(cells: string[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, "")))
  )
}

function inferOfficialCommandKind(
  headers: string[],
  name: string,
  fallback: OfficialCommandKind,
): OfficialCommandKind {
  const primaryHeader = headers[0] ?? ""
  if (primaryHeader.includes("flag") || primaryHeader.includes("option")) {
    return "flag"
  }
  if (name.startsWith("--") || name.startsWith("-")) return "flag"
  if (name.startsWith("/")) return "slash"
  return fallback
}

function parseMarkdownCommandTables(
  markdown: string,
  source: OfficialCommandSourceDefinition,
): OfficialCommandEntry[] {
  const lines = markdown.split(/\r?\n/)
  const entries: OfficialCommandEntry[] = []

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerCells = splitMarkdownTableRow(lines[index])
    const separatorCells = splitMarkdownTableRow(lines[index + 1])

    if (!headerCells.length || !isMarkdownSeparatorRow(separatorCells)) {
      continue
    }

    const headers = headerCells.map((header) =>
      cleanMarkdownInline(header).toLowerCase(),
    )
    const nameIndex = headers.findIndex(
      (header) =>
        header.includes("command") ||
        header.includes("flag") ||
        header.includes("option"),
    )

    if (nameIndex === -1) continue

    const descriptionIndex = headers.findIndex(
      (header) => header.includes("description") || header.includes("purpose"),
    )
    const exampleIndex = headers.findIndex((header) =>
      header.includes("example"),
    )
    const maturityIndex = headers.findIndex(
      (header) => header.includes("type") || header.includes("status"),
    )

    let rowIndex = index + 2
    while (rowIndex < lines.length) {
      const rowCells = splitMarkdownTableRow(lines[rowIndex])
      if (rowCells.length === 0) break

      const name = cleanMarkdownInline(rowCells[nameIndex] ?? "")
      const description = cleanMarkdownInline(
        rowCells[descriptionIndex === -1 ? 1 : descriptionIndex] ?? "",
      )

      if (name) {
        entries.push({
          provider: source.provider,
          kind: inferOfficialCommandKind(
            headers,
            name,
            source.defaultKind ?? "cli",
          ),
          name,
          description,
          sourceTitle: source.title,
          sourceUrl: source.htmlUrl,
          maturity:
            maturityIndex === -1
              ? undefined
              : cleanMarkdownInline(rowCells[maturityIndex] ?? "") || undefined,
          example:
            exampleIndex === -1
              ? undefined
              : cleanMarkdownInline(rowCells[exampleIndex] ?? "") || undefined,
        })
      }

      rowIndex += 1
    }

    index = rowIndex
  }

  return entries
}

function extractExportedArray(
  markdown: string,
  arrayName: string,
): string | null {
  const declaration = `export const ${arrayName} = [`
  const declarationIndex = markdown.indexOf(declaration)
  if (declarationIndex === -1) return null

  const startIndex = markdown.indexOf("[", declarationIndex)
  if (startIndex === -1) return null

  let depth = 0
  let quote: string | null = null
  let escaped = false

  for (let index = startIndex; index < markdown.length; index += 1) {
    const char = markdown[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }

    if (char === "[") {
      depth += 1
    } else if (char === "]") {
      depth -= 1
      if (depth === 0) {
        return markdown.slice(startIndex + 1, index)
      }
    }
  }

  return null
}

function extractObjectLiterals(body: string): string[] {
  const objects: string[] = []
  let startIndex = -1
  let depth = 0
  let quote: string | null = null
  let escaped = false

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }

    if (char === "{") {
      if (depth === 0) startIndex = index
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0 && startIndex !== -1) {
        objects.push(body.slice(startIndex, index + 1))
        startIndex = -1
      }
    }
  }

  return objects
}

function readJsStringProperty(
  objectLiteral: string,
  property: string,
): string | null {
  const match = objectLiteral.match(
    new RegExp(
      `${property}\\s*:\\s*("((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)'|\`((?:\\\\.|[^\`\\\\])*)\`)`,
      "s",
    ),
  )
  const rawValue = match?.[2] ?? match?.[3] ?? match?.[4]
  if (!rawValue) return null

  return rawValue
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim()
}

function parseCodexReferenceCommands(
  markdown: string,
  source: OfficialCommandSourceDefinition,
): OfficialCommandEntry[] {
  const arrays: { name: string; kind: OfficialCommandKind }[] = [
    { name: "commandOverview", kind: "cli" },
    { name: "mcpCommands", kind: "cli" },
    { name: "marketplaceCommands", kind: "cli" },
    { name: "globalFlagOptions", kind: "flag" },
  ]
  const entries: OfficialCommandEntry[] = []

  for (const array of arrays) {
    const body = extractExportedArray(markdown, array.name)
    if (!body) continue

    for (const objectLiteral of extractObjectLiterals(body)) {
      const name = readJsStringProperty(objectLiteral, "key")
      if (!name) continue

      entries.push({
        provider: source.provider,
        kind: array.kind,
        name,
        description: readJsStringProperty(objectLiteral, "description") ?? "",
        sourceTitle: source.title,
        sourceUrl: source.htmlUrl,
        maturity: readJsStringProperty(objectLiteral, "type") ?? undefined,
      })
    }
  }

  return entries
}

function dedupeOfficialEntries(
  entries: OfficialCommandEntry[],
): OfficialCommandEntry[] {
  const seen = new Set<string>()
  const result: OfficialCommandEntry[] = []

  for (const entry of entries) {
    const key = `${entry.provider}:${entry.kind}:${entry.name}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }

  return result
}

function parseOfficialCommandEntries(
  source: OfficialCommandSourceDefinition,
  markdown: string,
): OfficialCommandEntry[] {
  if (source.parser === "index-only") return []
  if (source.parser === "codex-reference") {
    return dedupeOfficialEntries([
      ...parseCodexReferenceCommands(markdown, source),
      ...parseMarkdownCommandTables(markdown, source),
    ])
  }

  return dedupeOfficialEntries(parseMarkdownCommandTables(markdown, source))
}

async function refreshOfficialSource(
  source: OfficialCommandSourceDefinition,
  fetchedAt: string,
): Promise<{
  source: OfficialCommandSourceSnapshot
  entries: OfficialCommandEntry[]
}> {
  try {
    const { text, etag, lastModified } = await fetchOfficialText(source)
    const entries = parseOfficialCommandEntries(source, text)

    return {
      entries,
      source: {
        title: source.title,
        url: source.url,
        htmlUrl: source.htmlUrl,
        hash: sha256Short(text),
        etag,
        lastModified,
        fetchedAt,
        commandCount: entries.length,
        error: null,
      },
    }
  } catch (error) {
    return {
      entries: [],
      source: {
        title: source.title,
        url: source.url,
        htmlUrl: source.htmlUrl,
        hash: null,
        etag: null,
        lastModified: null,
        fetchedAt,
        commandCount: 0,
        error: getErrorMessage(error),
      },
    }
  }
}

async function readCachedOfficialCommandIndex(): Promise<OfficialCommandIndexSnapshot | null> {
  try {
    const raw = await fs.readFile(getOfficialCommandIndexPath(), "utf-8")
    const parsed = JSON.parse(raw) as OfficialCommandIndexSnapshot
    if (parsed.schemaVersion !== OFFICIAL_COMMAND_INDEX_SCHEMA_VERSION) {
      return null
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[commands] Failed to read official command index:", error)
    }
    return null
  }
}

async function readOfficialCommandIndex(): Promise<OfficialCommandIndexSnapshot> {
  const cached = await readCachedOfficialCommandIndex()
  if (!cached) return emptyOfficialCommandIndex()

  const providerById = new Map(
    cached.providers.map((provider) => [provider.provider, provider]),
  )

  return {
    schemaVersion: OFFICIAL_COMMAND_INDEX_SCHEMA_VERSION,
    updatedAt: cached.updatedAt,
    providers: OFFICIAL_COMMAND_PROVIDERS.map(
      (definition) =>
        providerById.get(definition.provider) ??
        emptyOfficialProviderSnapshot(definition),
    ),
  }
}

async function writeOfficialCommandIndex(
  snapshot: OfficialCommandIndexSnapshot,
): Promise<void> {
  const cachePath = getOfficialCommandIndexPath()
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(snapshot, null, 2), "utf-8")
}

async function refreshOfficialCommandIndex(): Promise<OfficialCommandIndexSnapshot> {
  const previous = await readOfficialCommandIndex()
  const previousProviderById = new Map(
    previous.providers.map((provider) => [provider.provider, provider]),
  )
  const fetchedAt = new Date().toISOString()

  const providers = await Promise.all(
    OFFICIAL_COMMAND_PROVIDERS.map(async (provider) => {
      const sourceResults = await Promise.all(
        provider.sources.map((source) =>
          refreshOfficialSource(source, fetchedAt),
        ),
      )
      const entries = dedupeOfficialEntries(
        sourceResults.flatMap((result) => result.entries),
      )
      const failedSources = sourceResults
        .map((result) => result.source)
        .filter((source) => source.error)
      const previousProvider = previousProviderById.get(provider.provider)

      if (
        entries.length === 0 &&
        failedSources.length === sourceResults.length
      ) {
        if (previousProvider?.entries.length) {
          return {
            ...previousProvider,
            error: failedSources
              .map((source) => source.error)
              .filter(Boolean)
              .join("; "),
          }
        }

        return {
          provider: provider.provider,
          label: provider.label,
          docsUrl: provider.docsUrl,
          updatedAt: null,
          entries: [],
          sources: sourceResults.map((result) => result.source),
          error: failedSources
            .map((source) => source.error)
            .filter(Boolean)
            .join("; "),
        }
      }

      return {
        provider: provider.provider,
        label: provider.label,
        docsUrl: provider.docsUrl,
        updatedAt: fetchedAt,
        entries,
        sources: sourceResults.map((result) => result.source),
        error:
          failedSources.length > 0
            ? failedSources
                .map((source) => `${source.title}: ${source.error}`)
                .join("; ")
            : null,
      }
    }),
  )

  const snapshot: OfficialCommandIndexSnapshot = {
    schemaVersion: OFFICIAL_COMMAND_INDEX_SCHEMA_VERSION,
    updatedAt: fetchedAt,
    providers,
  }

  await writeOfficialCommandIndex(snapshot)
  return snapshot
}

/**
 * Parse command .md frontmatter to extract description and argument-hint
 */
function parseCommandMd(content: string): {
  description?: string
  argumentHint?: string
  name?: string
} {
  try {
    const { data } = parseMarkdownFrontmatter(content)
    return {
      description:
        typeof data.description === "string" ? data.description : undefined,
      argumentHint:
        typeof data["argument-hint"] === "string"
          ? data["argument-hint"]
          : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
    }
  } catch (err) {
    console.error("[commands] Failed to parse frontmatter:", err)
    return {}
  }
}

function getBundledCodexCliPath(): string {
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex"
  const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, "bin")
    : path.join(
        app.getAppPath(),
        "resources",
        "bin",
        `${process.platform}-${process.arch}`,
      )

  return path.join(resourcesDir, binaryName)
}

function cleanCommandOutput(value: string): string {
  return stripVTControlCharacters(value).replace(/\r/g, "").trim()
}

function runReadOnlyRuntimeCommand(
  filePath: string,
  args: string[],
): Promise<{ output: string; error: string | null }> {
  return new Promise((resolve) => {
    execFile(
      filePath,
      args,
      {
        encoding: "utf8",
        timeout: RUNTIME_COMMAND_TIMEOUT_MS,
        windowsHide: true,
        env: {
          ...process.env,
          NO_COLOR: "1",
          FORCE_COLOR: "0",
        },
      },
      (error, stdout, stderr) => {
        const output = cleanCommandOutput(
          [stdout, stderr].filter(Boolean).join("\n"),
        )
        if (error) {
          resolve({
            output,
            error: output || error.message,
          })
          return
        }

        resolve({ output, error: null })
      },
    )
  })
}

function parseCliCommands(helpOutput: string): RuntimeGuideCommand[] {
  const lines = helpOutput.split("\n")
  const commands: RuntimeGuideCommand[] = []
  const seen = new Set<string>()
  let inCommandsSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (!inCommandsSection) {
      if (trimmed === "Commands:" || trimmed === "Commands") {
        inCommandsSection = true
      }
      continue
    }

    if (!trimmed) continue
    if (/^[A-Z][A-Za-z ]+:$/.test(trimmed) && trimmed !== "Commands:") break

    const match = line.match(
      /^\s{2,}([A-Za-z][A-Za-z0-9_-]*(?:\|[A-Za-z0-9_-]+)*)(?:\s+[^\s].*?)?\s{2,}(.+)$/,
    )
    if (!match) continue

    const name = match[1]
    if (seen.has(name)) continue

    seen.add(name)
    commands.push({
      name,
      description: match[2].trim(),
    })
  }

  return commands.slice(0, 48)
}

async function readRuntimeCommandGuide(
  runtime: RuntimeCommandGuide["runtime"],
  label: string,
  filePath: string,
  hint: string,
): Promise<RuntimeCommandGuide> {
  const executable = getRuntimeExecutableStatus(filePath, hint)
  const base = {
    runtime,
    label,
    executable,
    sourceNote:
      "Detected from the local runtime executable help output. This may change when the runtime updates.",
    updatedAt: new Date().toISOString(),
  }

  if (!executable.ok || !executable.path) {
    return {
      ...base,
      version: null,
      cliCommands: [],
      error: executable.error,
    }
  }

  const [helpResult, versionResult] = await Promise.all([
    runReadOnlyRuntimeCommand(executable.path, ["--help"]),
    runReadOnlyRuntimeCommand(executable.path, ["--version"]),
  ])

  return {
    ...base,
    version: versionResult.output || null,
    cliCommands: helpResult.error ? [] : parseCliCommands(helpResult.output),
    error: helpResult.error,
  }
}

/**
 * Validate entry name for security (prevent path traversal)
 */
function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

/**
 * Recursively scan a directory for .md command files
 * Supports namespaces via nested folders: git/commit.md → git:commit
 */
async function scanCommandsDirectory(
  dir: string,
  source: "user" | "project" | "plugin",
  prefix = "",
  basePath?: string,
): Promise<FileCommand[]> {
  const commands: FileCommand[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return commands
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) {
        console.warn(`[commands] Skipping invalid entry name: ${entry.name}`)
        continue
      }

      const fullPath = path.join(dir, entry.name)
      const { isDirectory, isFile } = await resolveDirentType(dir, entry)

      if (isDirectory) {
        // Recursively scan nested directories
        const nestedCommands = await scanCommandsDirectory(
          fullPath,
          source,
          prefix ? `${prefix}:${entry.name}` : entry.name,
          basePath,
        )
        commands.push(...nestedCommands)
      } else if (isFile && entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "")
        const fallbackName = prefix ? `${prefix}:${baseName}` : baseName

        try {
          const rawContent = await fs.readFile(fullPath, "utf-8")
          const parsed = parseCommandMd(rawContent)
          const { content: body } = parseMarkdownFrontmatter(rawContent)
          const commandName = parsed.name || fallbackName

          // Format display path: ~/... for user, relative for project
          let displayPath: string
          if (source === "project" && basePath) {
            displayPath = path.relative(basePath, fullPath)
          } else {
            const homeDir = os.homedir()
            displayPath = fullPath.startsWith(homeDir)
              ? "~" + fullPath.slice(homeDir.length)
              : fullPath
          }

          commands.push({
            name: commandName,
            description: parsed.description || "",
            argumentHint: parsed.argumentHint,
            source,
            path: displayPath,
            content: body.trim(),
          })
        } catch (err) {
          console.warn(`[commands] Failed to read ${fullPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.error(`[commands] Failed to scan directory ${dir}:`, err)
  }

  return commands
}

/**
 * Generate command .md content from name, description, and body
 */
function generateCommandMd(command: {
  name: string
  description: string
  content: string
  argumentHint?: string
}): string {
  const frontmatter: string[] = []
  if (command.description) {
    frontmatter.push(`description: ${command.description}`)
  }
  if (command.argumentHint) {
    frontmatter.push(`argument-hint: ${command.argumentHint}`)
  }
  if (frontmatter.length === 0) {
    return command.content
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${command.content}`
}

/**
 * Resolve the absolute filesystem path of a command given its display path
 */
function resolveCommandPath(displayPath: string, projectPath?: string): string {
  if (displayPath.startsWith("~")) {
    return path.join(os.homedir(), displayPath.slice(1))
  }
  if (projectPath && !displayPath.startsWith("/")) {
    return path.join(projectPath, displayPath)
  }
  return displayPath
}

function getUserCommandsDir(): string {
  return path.join(os.homedir(), ".claude", "commands")
}

function getProjectCommandsDir(projectPath: string): string {
  return path.join(projectPath, ".claude", "commands")
}

function isHomeDisplayPath(displayPath: string): boolean {
  return (
    displayPath === "~" ||
    displayPath.startsWith("~/") ||
    displayPath.startsWith("~\\")
  )
}

function resolveEditableCommandPath(
  displayPath: string,
  projectPath?: string,
): string {
  if (isHomeDisplayPath(displayPath)) {
    const absolutePath = resolveCommandPath(displayPath)
    return resolvePathWithinRoot({
      targetPath: absolutePath,
      rootPath: getUserCommandsDir(),
    })
  }

  assertRelativePathBoundary(displayPath)

  if (!projectPath) {
    throw new Error("Project path required for project command")
  }

  const absolutePath = resolveCommandPath(displayPath, projectPath)
  return resolvePathWithinRoot({
    targetPath: absolutePath,
    rootPath: getProjectCommandsDir(projectPath),
  })
}

export const commandsRouter = router({
  runtimeGuide: publicProcedure.query(async () => {
    const claudeHint = process.env.ELECTRON_RENDERER_URL
      ? "Run `bun run claude:download` from the repo, then restart the dev app."
      : "Reinstall the app so the bundled Claude Code runtime is restored."
    const codexHint = app.isPackaged
      ? "Reinstall the app so the bundled Codex command is restored."
      : "Run `bun run codex:download` from the repo, then restart the dev app."

    return Promise.all([
      readRuntimeCommandGuide(
        "claude-code",
        "Claude Code",
        getBundledClaudeBinaryPath(),
        claudeHint,
      ),
      readRuntimeCommandGuide(
        "codex",
        "Codex",
        getBundledCodexCliPath(),
        codexHint,
      ),
    ])
  }),

  officialIndex: publicProcedure.query(async () => {
    return readOfficialCommandIndex()
  }),

  refreshOfficialIndex: publicProcedure.mutation(async () => {
    return refreshOfficialCommandIndex()
  }),

  /**
   * List all commands from filesystem
   * - User commands: ~/.claude/commands/
   * - Project commands: .claude/commands/ (relative to projectPath)
   */
  list: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const userCommandsDir = path.join(os.homedir(), ".claude", "commands")
      const userCommandsPromise = scanCommandsDirectory(userCommandsDir, "user")

      let projectCommandsPromise = Promise.resolve<FileCommand[]>([])
      if (input?.projectPath) {
        const projectCommandsDir = path.join(
          input.projectPath,
          ".claude",
          "commands",
        )
        projectCommandsPromise = scanCommandsDirectory(
          projectCommandsDir,
          "project",
          "",
          input.projectPath,
        )
      }

      // Discover plugin commands
      const enabledPluginSources = await getEnabledPlugins()
      const allowedPluginComponents =
        await discoverAllowedClaudePluginRuntimeComponents(enabledPluginSources)
      const pluginCommandsPromises = allowedPluginComponents.map(
        async ({ plugin }) => {
          const paths = getPluginComponentPaths(plugin)
          try {
            const commands = await scanCommandsDirectory(
              paths.commands,
              "plugin",
            )
            return commands.map((cmd) => ({
              ...cmd,
              pluginName: plugin.source,
            }))
          } catch {
            return []
          }
        },
      )

      // Scan all directories in parallel
      const [userCommands, projectCommands, ...pluginCommandsArrays] =
        await Promise.all([
          userCommandsPromise,
          projectCommandsPromise,
          ...pluginCommandsPromises,
        ])
      const pluginCommands = pluginCommandsArrays.flat()

      // Project commands first (more specific), then user commands, then plugin commands
      return [...projectCommands, ...userCommands, ...pluginCommands]
    }),

  /**
   * Get content of a specific command file (without frontmatter)
   */
  getContent: publicProcedure
    .input(z.object({ path: z.string(), projectPath: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const absolutePath = resolveEditableCommandPath(
          input.path,
          input.projectPath,
        )
        const content = await fs.readFile(absolutePath, "utf-8")
        const { content: body } = parseMarkdownFrontmatter(content)
        return { content: body.trim() }
      } catch (err) {
        console.error(`[commands] Failed to read command content:`, err)
        throw new Error("Invalid command path")
      }
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        content: z.string(),
        argumentHint: z.string().optional(),
        source: z.enum(["user", "project"]),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const safeName = input.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
      if (!safeName) {
        throw new Error(
          "Command name must contain at least one alphanumeric character",
        )
      }

      let targetDir: string
      if (input.source === "project") {
        if (!input.projectPath) {
          throw new Error("Project path required for project commands")
        }
        targetDir = path.join(input.projectPath, ".claude", "commands")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "commands")
      }

      const commandPath = path.join(targetDir, `${safeName}.md`)

      // Check if already exists
      try {
        await fs.access(commandPath)
        throw new Error(`Command "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Create directory and write command file
      await fs.mkdir(targetDir, { recursive: true })
      const fileContent = generateCommandMd({
        name: safeName,
        description: input.description,
        content: input.content,
        argumentHint: input.argumentHint,
      })
      await fs.writeFile(commandPath, fileContent, "utf-8")

      return {
        name: safeName,
        path: commandPath,
        source: input.source,
      }
    }),

  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
        argumentHint: z.string().optional(),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const absolutePath = resolveEditableCommandPath(
        input.path,
        input.projectPath,
      )

      // Verify file exists before writing
      await fs.access(absolutePath)

      const fileContent = generateCommandMd({
        name: input.name,
        description: input.description,
        content: input.content,
        argumentHint: input.argumentHint,
      })
      await fs.writeFile(absolutePath, fileContent, "utf-8")

      return { success: true }
    }),

  delete: publicProcedure
    .input(
      z.object({
        path: z.string(),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const absolutePath = resolveEditableCommandPath(
        input.path,
        input.projectPath,
      )
      await fs.access(absolutePath)
      await fs.unlink(absolutePath)

      return { success: true }
    }),
})
