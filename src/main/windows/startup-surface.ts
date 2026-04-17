export type StartupSurface = "app" | "login"

export function getStartupSurface(_params: {
  isAuthenticated: boolean
}): StartupSurface {
  return "app"
}
