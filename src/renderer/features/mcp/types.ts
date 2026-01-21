/**
 * MCP server configuration from mcp.json
 */
export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

/**
 * Auth status for an MCP server
 */
export type McpAuthStatus = "no_auth_needed" | "configured" | "missing_credentials"

/**
 * MCP server with auth status
 */
export interface McpServer {
  id: string
  name: string
  config: McpServerConfig
  authStatus: McpAuthStatus
  credentialEnvVars: string[]
  enabled: boolean
}
