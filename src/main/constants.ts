// Dev mode detection
export const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

// Auth server port - use different port in dev to allow running alongside production
export const AUTH_SERVER_PORT = IS_DEV ? 21322 : 21321

let runtimeAuthServerPort = AUTH_SERVER_PORT

export function getAuthServerPort(): number {
  return runtimeAuthServerPort
}

export function setAuthServerPort(port: number): void {
  runtimeAuthServerPort = port
}
