import { randomUUID } from "node:crypto"
import { agentRuntimeAdapters } from "../agent-runtime/adapters"
import { createMobileGatewayFacade } from "./facade"
import { listMobileGatewaySessionsFromDatabase } from "./database-sessions"
import {
  startMobileGatewayServer,
  type RunningMobileGatewayServer,
} from "./server"

export interface DesktopMobileGatewayOptions {
  enabled?: boolean
  host?: string
  port?: number
  pairingToken?: string
}

export interface RunningDesktopMobileGateway extends RunningMobileGatewayServer {
  pairingToken: string
}

const DEFAULT_MOBILE_GATEWAY_PORT = 4177

export async function startDesktopMobileGateway(
  options: DesktopMobileGatewayOptions = {},
): Promise<RunningDesktopMobileGateway | null> {
  const enabled = options.enabled ?? process.env.ONECODE_MOBILE_GATEWAY === "1"
  if (!enabled) return null

  const pairingToken =
    cleanString(options.pairingToken) ??
    cleanString(process.env.ONECODE_MOBILE_GATEWAY_TOKEN) ??
    randomUUID()
  const host =
    cleanString(options.host) ??
    cleanString(process.env.ONECODE_MOBILE_GATEWAY_HOST) ??
    "127.0.0.1"
  const port =
    options.port ??
    parsePort(process.env.ONECODE_MOBILE_GATEWAY_PORT) ??
    DEFAULT_MOBILE_GATEWAY_PORT
  const facade = createMobileGatewayFacade({
    sessions: listMobileGatewaySessionsFromDatabase,
    adapters: agentRuntimeAdapters,
  })
  const server = await startMobileGatewayServer({
    facade,
    host,
    port,
    pairingToken,
  })

  return {
    ...server,
    get pairingToken() {
      return server.getPairingToken() ?? pairingToken
    },
  }
}

function cleanString(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function parsePort(value: string | null | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const port = Number.parseInt(value, 10)
  return Number.isSafeInteger(port) && port >= 0 && port <= 65535
    ? port
    : undefined
}
