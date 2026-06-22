import { asc, eq } from "drizzle-orm"
import { appAgents, getDatabase } from "../db"
import { parseMarkdownFrontmatter } from "../markdown/frontmatter"
import {
  normalizeAppAgentName,
  serializeToolList,
  toAppAgentDTO,
  type AppAgentDTO,
} from "./shared"

type CuratedAgentSource = {
  id: string
  displayName: string
  owner: string
  repo: string
  ref: string
  include: RegExp
  maxEntries: number
}

export type RegistryAppAgentStatus = "not-installed" | "installed"

export type RegistryAppAgentSummary = {
  id: string
  name: string
  displayName: string
  sourceId: string
  sourceName: string
  sourceUrl: string
  upstreamPath: string
  category: string
  status: RegistryAppAgentStatus
}

export type RegistryAppAgentDetail = RegistryAppAgentSummary & {
  description: string
  prompt: string
  tools: string[]
  disallowedTools: string[]
}

const SOURCES: CuratedAgentSource[] = [
  {
    id: "voltagent",
    displayName: "VoltAgent awesome-claude-code-subagents",
    owner: "VoltAgent",
    repo: "awesome-claude-code-subagents",
    ref: "main",
    include: /^categories\/[^/]+\/[^/.][^/]*\.md$/,
    maxEntries: 120,
  },
  {
    id: "furai",
    displayName: "0xfurai claude-code-subagents",
    owner: "0xfurai",
    repo: "claude-code-subagents",
    ref: "main",
    include: /^agents\/[^/.][^/]*\.md$/,
    maxEntries: 120,
  },
  {
    id: "wshobson",
    displayName: "wshobson agents",
    owner: "wshobson",
    repo: "agents",
    ref: "main",
    include: /^plugins\/[^/]+\/agents\/[^/.][^/]*\.md$/,
    maxEntries: 120,
  },
]

const CACHE_TTL_MS = 10 * 60 * 1000
let registryCache:
  | {
      loadedAt: number
      entries: Omit<RegistryAppAgentSummary, "status">[]
    }
  | null = null

function slugifyRegistryId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function titleCaseSlug(value: string) {
  return value
    .replace(/^\d+-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getFileBaseName(filePath: string) {
  const fileName = filePath.split("/").pop() ?? filePath
  return fileName.replace(/\.md$/i, "")
}

function getCategory(source: CuratedAgentSource, filePath: string) {
  const parts = filePath.split("/")
  if (source.id === "voltagent") return titleCaseSlug(parts[1] ?? source.id)
  if (source.id === "wshobson") return titleCaseSlug(parts[1] ?? source.id)
  return titleCaseSlug(parts[0] ?? source.id)
}

function getSourceUrl(source: CuratedAgentSource, filePath: string) {
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.ref}/${filePath}`
}

function getRawUrl(source: CuratedAgentSource, filePath: string) {
  return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${filePath}`
}

async function fetchWithTimeout(url: string, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Agent-Code-for-Me-App-Agent-Registry",
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchGithubTree(source: CuratedAgentSource) {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.ref}?recursive=1`
  const response = await fetchWithTimeout(url)
  return (await response.json()) as {
    tree?: Array<{ path: string; type: string }>
  }
}

async function loadSourceSummaries(source: CuratedAgentSource) {
  const tree = await fetchGithubTree(source)
  const files = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && source.include.test(entry.path))
    .filter((entry) => !entry.path.endsWith("/README.md"))
    .slice(0, source.maxEntries)

  return files.map((file) => {
    const name = normalizeAppAgentName(getFileBaseName(file.path))
    const id = `${source.id}:${slugifyRegistryId(file.path.replace(/\.md$/i, ""))}`
    return {
      id,
      name,
      displayName: name,
      sourceId: source.id,
      sourceName: source.displayName,
      sourceUrl: getSourceUrl(source, file.path),
      upstreamPath: file.path,
      category: getCategory(source, file.path),
    }
  }).filter((entry) => entry.name)
}

async function loadRegistrySummaries() {
  if (registryCache && Date.now() - registryCache.loadedAt < CACHE_TTL_MS) {
    return registryCache.entries
  }

  const results = await Promise.allSettled(SOURCES.map(loadSourceSummaries))
  const entries = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value
    console.warn(
      `[app-agents] Failed to load registry source ${SOURCES[index]?.id}:`,
      result.reason,
    )
    return []
  })

  registryCache = {
    loadedAt: Date.now(),
    entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
  }
  return registryCache.entries
}

function getInstalledNames() {
  const db = getDatabase()
  return new Set(
    db
      .select({ name: appAgents.name })
      .from(appAgents)
      .orderBy(asc(appAgents.name))
      .all()
      .map((row) => row.name),
  )
}

function applyStatus(
  entries: Omit<RegistryAppAgentSummary, "status">[],
): RegistryAppAgentSummary[] {
  const installedNames = getInstalledNames()
  return entries.map((entry) => ({
    ...entry,
    status: installedNames.has(entry.name) ? "installed" : "not-installed",
  }))
}

export async function listRegistryAppAgents(): Promise<RegistryAppAgentSummary[]> {
  return applyStatus(await loadRegistrySummaries())
}

async function getRegistrySummaryById(id: string) {
  const summaries = await loadRegistrySummaries()
  const entry = summaries.find((item) => item.id === id)
  if (!entry) {
    throw new Error(`Registry Locus Agent "${id}" not found`)
  }
  const source = SOURCES.find((item) => item.id === entry.sourceId)
  if (!source) {
    throw new Error(`Registry source "${entry.sourceId}" not found`)
  }
  return { entry, source }
}

function parseTools(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export async function getRegistryAppAgent(
  id: string,
): Promise<RegistryAppAgentDetail> {
  const { entry, source } = await getRegistrySummaryById(id)
  const response = await fetchWithTimeout(getRawUrl(source, entry.upstreamPath))
  const raw = await response.text()
  if (raw.length > 250_000) {
    throw new Error("Registry Locus Agent file is too large")
  }

  const parsed = parseMarkdownFrontmatter(raw)
  const name = normalizeAppAgentName(
    typeof parsed.data.name === "string" ? parsed.data.name : entry.name,
  )
  const description =
    typeof parsed.data.description === "string" ? parsed.data.description : ""
  const prompt = parsed.content.trim()

  return {
    ...applyStatus([entry])[0]!,
    name: name || entry.name,
    displayName: name || entry.name,
    description,
    prompt,
    tools: parseTools(parsed.data.tools),
    disallowedTools: parseTools(parsed.data.disallowedTools),
  }
}

export async function importRegistryAppAgent(
  id: string,
): Promise<AppAgentDTO> {
  const agent = await getRegistryAppAgent(id)
  if (!agent.prompt) {
    throw new Error("Registry Locus Agent is missing prompt content")
  }

  const db = getDatabase()
  const existing = db
    .select()
    .from(appAgents)
    .where(eq(appAgents.name, agent.name))
    .get()

  if (existing) {
    db.update(appAgents)
      .set({
        description: agent.description,
        prompt: agent.prompt,
        tools: serializeToolList(agent.tools),
        disallowedTools: serializeToolList(agent.disallowedTools),
        updatedAt: new Date(),
      })
      .where(eq(appAgents.id, existing.id))
      .run()
  } else {
    db.insert(appAgents)
      .values({
        name: agent.name,
        description: agent.description,
        prompt: agent.prompt,
        tools: serializeToolList(agent.tools),
        disallowedTools: serializeToolList(agent.disallowedTools),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
  }

  const row = db
    .select()
    .from(appAgents)
    .where(eq(appAgents.name, agent.name))
    .get()

  if (!row) {
    throw new Error("Failed to import Locus Agent")
  }

  return toAppAgentDTO(row)
}
