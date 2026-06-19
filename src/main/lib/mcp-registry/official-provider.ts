import { z } from "zod"

export const OFFICIAL_MCP_REGISTRY_PROVIDER_ID = "official-mcp-registry"
export const OFFICIAL_MCP_REGISTRY_BASE_URL =
  "https://registry.modelcontextprotocol.io"
export const OFFICIAL_MCP_REGISTRY_API_PREFIX = "v0.1"

const DEFAULT_PAGE_LIMIT = 30
const MAX_PAGE_LIMIT = 100
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000

export type McpRegistryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type OfficialMcpRegistryMetadata = {
  nextCursor?: string | null
  count?: number
}

export type OfficialMcpRegistryServerResponse = {
  server: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export type OfficialMcpRegistryServerListResponse = {
  servers: OfficialMcpRegistryServerResponse[]
  metadata: OfficialMcpRegistryMetadata
}

export type OfficialMcpRegistryListInput = {
  cursor?: string
  limit?: number
  search?: string
  updatedSince?: string
  version?: string
  includeDeleted?: boolean
  signal?: AbortSignal
}

export type OfficialMcpRegistryDetailInput = {
  serverName: string
  version?: string
  includeDeleted?: boolean
  signal?: AbortSignal
}

export type OfficialMcpRegistryProviderOptions = {
  baseUrl?: string
  apiPrefix?: string
  fetchImpl?: McpRegistryFetch
  timeoutMs?: number
  maxResponseBytes?: number
}

export type OfficialMcpRegistryProvider = {
  providerId: typeof OFFICIAL_MCP_REGISTRY_PROVIDER_ID
  listServers: (
    input?: OfficialMcpRegistryListInput,
  ) => Promise<OfficialMcpRegistryServerListResponse>
  searchServers: (
    input: Omit<OfficialMcpRegistryListInput, "search"> & { search: string },
  ) => Promise<OfficialMcpRegistryServerListResponse>
  getServerDetail: (
    input: OfficialMcpRegistryDetailInput,
  ) => Promise<OfficialMcpRegistryServerResponse>
}

const officialServerResponseSchema = z
  .object({
    server: z.record(z.string(), z.unknown()),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

const officialListResponseSchema = z
  .object({
    servers: z.array(officialServerResponseSchema),
    metadata: z
      .object({
        nextCursor: z.string().nullable().optional(),
        count: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

function clampPageLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_LIMIT
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(limit)))
}

function normalizeApiPrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "")
}

function createUrl(
  options: Required<
    Pick<OfficialMcpRegistryProviderOptions, "baseUrl" | "apiPrefix">
  >,
  pathSegments: string[],
  query: Record<string, string | number | boolean | undefined>,
): URL {
  const url = new URL(options.baseUrl)
  if (url.protocol !== "https:") {
    throw new Error(
      "Official MCP registry provider requires an HTTPS base URL.",
    )
  }

  const basePath = url.pathname.replace(/\/+$/g, "")
  const apiPrefix = normalizeApiPrefix(options.apiPrefix)
  url.pathname = [basePath, apiPrefix, ...pathSegments.map(encodeURIComponent)]
    .filter(Boolean)
    .join("/")

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    url.searchParams.set(key, String(value))
  }

  return url
}

function withTimeoutSignal(input: {
  signal?: AbortSignal
  timeoutMs: number
}): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(input.signal?.reason)
  if (input.signal?.aborted) abortFromCaller()
  input.signal?.addEventListener("abort", abortFromCaller, { once: true })

  const timeout = setTimeout(() => {
    controller.abort(new Error("Official MCP registry request timed out."))
  }, input.timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      input.signal?.removeEventListener("abort", abortFromCaller)
    },
  }
}

async function readBoundedJson(
  response: Response,
  maxResponseBytes: number,
): Promise<unknown> {
  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > maxResponseBytes) {
    throw new Error("Official MCP registry response exceeded size limit.")
  }

  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
    throw new Error("Official MCP registry response exceeded size limit.")
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error("Official MCP registry returned invalid JSON.")
  }
}

function parseListResponse(
  value: unknown,
): OfficialMcpRegistryServerListResponse {
  const parsed = officialListResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Invalid official MCP registry list response.")
  }

  return {
    servers: parsed.data.servers.map((entry) => ({
      server: entry.server,
      ...(entry._meta ? { _meta: entry._meta } : {}),
    })),
    metadata: {
      ...(parsed.data.metadata?.nextCursor !== undefined
        ? { nextCursor: parsed.data.metadata.nextCursor }
        : {}),
      ...(parsed.data.metadata?.count !== undefined
        ? { count: parsed.data.metadata.count }
        : {}),
    },
  }
}

function parseServerResponse(
  value: unknown,
): OfficialMcpRegistryServerResponse {
  const parsed = officialServerResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Invalid official MCP registry detail response.")
  }

  return {
    server: parsed.data.server,
    ...(parsed.data._meta ? { _meta: parsed.data._meta } : {}),
  }
}

async function fetchOfficialRegistryJson(input: {
  url: URL
  fetchImpl: McpRegistryFetch
  signal?: AbortSignal
  timeoutMs: number
  maxResponseBytes: number
}): Promise<unknown> {
  const timeoutSignal = withTimeoutSignal({
    signal: input.signal,
    timeoutMs: input.timeoutMs,
  })

  try {
    const response = await input.fetchImpl(input.url, {
      method: "GET",
      signal: timeoutSignal.signal,
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      throw new Error(
        `Official MCP registry request failed with status ${response.status}.`,
      )
    }
    return await readBoundedJson(response, input.maxResponseBytes)
  } finally {
    timeoutSignal.cleanup()
  }
}

export function createOfficialMcpRegistryProvider(
  options: OfficialMcpRegistryProviderOptions = {},
): OfficialMcpRegistryProvider {
  const baseUrl = options.baseUrl ?? OFFICIAL_MCP_REGISTRY_BASE_URL
  const apiPrefix = options.apiPrefix ?? OFFICIAL_MCP_REGISTRY_API_PREFIX
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const maxResponseBytes = Math.max(
    1,
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
  )

  const listServers: OfficialMcpRegistryProvider["listServers"] = async (
    input = {},
  ) => {
    const url = createUrl({ baseUrl, apiPrefix }, ["servers"], {
      limit: clampPageLimit(input.limit),
      cursor: input.cursor?.trim() || undefined,
      search: input.search?.trim() || undefined,
      updated_since: input.updatedSince?.trim() || undefined,
      version: input.version?.trim() || undefined,
      include_deleted: input.includeDeleted ? true : undefined,
    })
    const response = await fetchOfficialRegistryJson({
      url,
      fetchImpl,
      signal: input.signal,
      timeoutMs,
      maxResponseBytes,
    })
    return parseListResponse(response)
  }

  return {
    providerId: OFFICIAL_MCP_REGISTRY_PROVIDER_ID,
    listServers,
    searchServers: listServers,
    async getServerDetail(input) {
      const serverName = input.serverName.trim()
      if (!serverName) {
        throw new Error("Official MCP registry server name is required.")
      }

      const url = createUrl(
        { baseUrl, apiPrefix },
        ["servers", serverName, "versions", input.version?.trim() || "latest"],
        {
          include_deleted: input.includeDeleted ? true : undefined,
        },
      )
      const response = await fetchOfficialRegistryJson({
        url,
        fetchImpl,
        signal: input.signal,
        timeoutMs,
        maxResponseBytes,
      })
      return parseServerResponse(response)
    },
  }
}
