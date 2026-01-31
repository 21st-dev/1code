export interface McpToolInfo {
  name: string
  description?: string
}

export interface McpServer {
  name: string
  status: string
  tools: (McpToolInfo | string)[]
  needsAuth: boolean
  config: Record<string, unknown>
  serverInfo?: { name: string; version: string }
  error?: string
}

export interface McpGroup {
  groupName: string
  projectPath: string | null
  mcpServers: McpServer[]
}

export type TransportType = "stdio" | "http"
export type AuthType = "none" | "oauth" | "bearer"
export type ScopeType = "global" | "project"

export interface McpServerFormData {
  name: string
  scope: ScopeType
  projectPath?: string
  transport: TransportType
  // Stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  // HTTP
  url?: string
  authType?: AuthType
  bearerToken?: string
}
