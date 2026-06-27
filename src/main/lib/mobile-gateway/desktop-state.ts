export interface DesktopMobileGatewayPairingStatus {
  status: "available" | "unavailable"
  isAvailable: boolean
  url: string | null
  pairingUrl: string | null
  redactedPairingUrl: string | null
  redactedToken: string | null
  detail: string
}

export interface DesktopMobileGatewayPairingSource {
  url: string
  getPairingToken(): string | undefined
  getPairingUrl(): string | undefined
}

let runningDesktopMobileGateway: DesktopMobileGatewayPairingSource | null = null

export function setDesktopMobileGateway(
  gateway: DesktopMobileGatewayPairingSource | null,
): void {
  runningDesktopMobileGateway = gateway
}

export function getDesktopMobileGateway(): DesktopMobileGatewayPairingSource | null {
  return runningDesktopMobileGateway
}

export function readDesktopMobileGatewayPairingStatus():
  DesktopMobileGatewayPairingStatus {
  return buildDesktopMobileGatewayPairingStatus(runningDesktopMobileGateway)
}

export function buildDesktopMobileGatewayPairingStatus(
  gateway: DesktopMobileGatewayPairingSource | null,
): DesktopMobileGatewayPairingStatus {
  if (!gateway) {
    return {
      status: "unavailable",
      isAvailable: false,
      url: null,
      pairingUrl: null,
      redactedPairingUrl: null,
      redactedToken: null,
      detail: "Mobile gateway is not running.",
    }
  }

  const token = cleanString(gateway.getPairingToken())
  const pairingUrl = cleanString(gateway.getPairingUrl())

  if (!token || !pairingUrl) {
    return {
      status: "unavailable",
      isAvailable: false,
      url: gateway.url,
      pairingUrl: null,
      redactedPairingUrl: null,
      redactedToken: null,
      detail: "Mobile gateway is running without a pairing token.",
    }
  }

  const redactedToken = redactMobileGatewayToken(token)

  return {
    status: "available",
    isAvailable: true,
    url: gateway.url,
    pairingUrl,
    redactedPairingUrl: redactPairingUrlToken(pairingUrl, token, redactedToken),
    redactedToken,
    detail: "Mobile gateway is ready for pairing.",
  }
}

export function redactMobileGatewayToken(token: string): string {
  const trimmed = token.trim()
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

function redactPairingUrlToken(
  pairingUrl: string,
  token: string,
  redactedToken: string,
): string {
  try {
    const parsed = new URL(pairingUrl)
    if (parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", redactedToken)
      return parsed.toString()
    }
  } catch {
    // Fall through to a direct replacement for malformed debug strings.
  }

  return pairingUrl.replace(token, redactedToken)
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
