import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http"
import { randomUUID } from "node:crypto"
import type { AddressInfo } from "net"
import {
  buildOneCodeMobilePairingUrl,
  handleMobileGatewayRequest,
  type MobileGatewayFacade,
  type MobileGatewayHttpResponse,
  type MobileGatewayPairingTokenRotation,
} from "./facade"

export interface StartMobileGatewayServerOptions {
  facade: MobileGatewayFacade
  host?: string
  port?: number
  pairingToken?: string
  pairingLabel?: string
  corsOrigin?: string
}

export interface RunningMobileGatewayServer {
  server: Server
  host: string
  port: number
  url: string
  getPairingToken(): string | undefined
  getPairingUrl(): string | undefined
  close(): Promise<void>
}

type MobileGatewayPairingTokenState = {
  getPairingToken(): string | undefined
  rotatePairingToken(): MobileGatewayPairingTokenRotation
}

export async function startMobileGatewayServer(
  options: StartMobileGatewayServerOptions,
): Promise<RunningMobileGatewayServer> {
  const host = options.host ?? "127.0.0.1"
  const requestedPort = options.port ?? 0
  const pairingTokenState = createPairingTokenState(options.pairingToken)
  const server = createMobileGatewayServer(options, pairingTokenState)

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(requestedPort, host)
  })

  const address = server.address()
  if (!address || typeof address !== "object") {
    await closeServer(server)
    throw new Error("Mobile gateway server did not expose a TCP address")
  }

  const port = (address as AddressInfo).port
  return {
    server,
    host,
    port,
    url: `http://${host}:${port}`,
    getPairingToken: pairingTokenState.getPairingToken,
    getPairingUrl() {
      const token = pairingTokenState.getPairingToken()
      if (!token) return undefined
      return buildOneCodeMobilePairingUrl({
        baseUrl: `http://${host}:${port}`,
        token,
        label: options.pairingLabel ?? "Local 1code",
      })
    },
    close: () => closeServer(server),
  }
}

export function createMobileGatewayServer(
  options: StartMobileGatewayServerOptions,
  pairingTokenState = createPairingTokenState(options.pairingToken),
): Server {
  return createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      writeMobileGatewayResponse(res, {
        status: 204,
        headers: {},
        body: "",
      }, options.corsOrigin)
      return
    }

    try {
      const body = await readRequestBody(req)
      const response = await handleMobileGatewayRequest(options.facade, {
        method: req.method ?? "GET",
        url: buildRequestUrl(req, options.host ?? "127.0.0.1"),
        headers: normalizeHeaders(req.headers),
        body,
      }, {
        pairingToken: pairingTokenState.getPairingToken,
        rotatePairingToken: pairingTokenState.rotatePairingToken,
        pairingBaseUrl: (requestUrl) => requestUrl.origin,
        pairingLabel: options.pairingLabel,
      })
      writeMobileGatewayResponse(res, response, options.corsOrigin)
    } catch (error) {
      writeMobileGatewayResponse(res, {
        status: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      }, options.corsOrigin)
    }
  })
}

function createPairingTokenState(
  initialToken: string | undefined,
): MobileGatewayPairingTokenState {
  let currentToken = initialToken
  return {
    getPairingToken() {
      return currentToken
    },
    rotatePairingToken() {
      currentToken = randomUUID()
      return {
        token: currentToken,
        rotatedAt: new Date().toISOString(),
      }
    },
  }
}

function buildRequestUrl(req: IncomingMessage, fallbackHost: string): string {
  const host = req.headers.host ?? fallbackHost
  return `http://${host}${req.url ?? "/"}`
}

function normalizeHeaders(
  headers: IncomingMessage["headers"],
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value.join(", ") : value
  }
  return normalized
}

async function readRequestBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined
}

function writeMobileGatewayResponse(
  res: ServerResponse,
  response: MobileGatewayHttpResponse,
  corsOrigin = "*",
): void {
  res.writeHead(response.status, {
    ...response.headers,
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  })
  res.end(response.body)
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
