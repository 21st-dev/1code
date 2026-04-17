import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function readUtf8(relativePath: string): string {
  return readFileSync(join(import.meta.dir, "..", "..", "..", relativePath), "utf8")
}

describe("OpenCodex desktop shell contract", () => {
  test("preload strips cloud auth APIs and exposes local-native methods", () => {
    const preloadSource = readUtf8("preload/index.ts")

    expect(preloadSource).not.toContain("getUser: () => ipcRenderer.invoke(\"auth:get-user\")")
    expect(preloadSource).not.toContain("isAuthenticated: () => ipcRenderer.invoke(\"auth:is-authenticated\")")
    expect(preloadSource).not.toContain("logout: () => ipcRenderer.invoke(\"auth:logout\")")
    expect(preloadSource).not.toContain("startAuthFlow: () => ipcRenderer.invoke(\"auth:start-flow\")")
    expect(preloadSource).not.toContain("submitAuthCode: (code: string) => ipcRenderer.invoke(\"auth:submit-code\", code)")
    expect(preloadSource).not.toContain("updateUser: (updates: { name?: string }) => ipcRenderer.invoke(\"auth:update-user\", updates)")
    expect(preloadSource).not.toContain("getAuthToken: () => ipcRenderer.invoke(\"auth:get-token\")")
    expect(preloadSource).not.toContain("onAuthSuccess:")
    expect(preloadSource).not.toContain("onAuthError:")
    expect(preloadSource).not.toContain("signedFetch:")
    expect(preloadSource).not.toContain("streamFetch:")

    expect(preloadSource).toContain("ipcRenderer.invoke(\"opencodex:get-local-profile\")")
    expect(preloadSource).toContain("updateLocalProfile: (updates: { displayName?: string }) =>")
    expect(preloadSource).toContain("ipcRenderer.invoke(\"opencodex:reset-local-workspace\")")
    expect(preloadSource).toContain("ipcRenderer.invoke(\"opencodex:get-backend-host-state\")")
    expect(preloadSource).toContain("saveOpenCodexBackendConfig: (config: OpenCodexBackendConfigInput) =>")
    expect(preloadSource).toContain("ipcRenderer.invoke(\"opencodex:restart-backend-host\")")
  })

  test("windows main shell no longer registers auth IPC handlers", () => {
    const windowsMainSource = readUtf8("main/windows/main.ts")

    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:get-user\"")
    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:is-authenticated\"")
    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:logout\"")
    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:start-flow\"")
    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:submit-code\"")
    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:update-user\"")
    expect(windowsMainSource).not.toContain("ipcMain.handle(\"auth:get-token\"")

    expect(windowsMainSource).toContain("ipcMain.handle(\"opencodex:get-local-profile\"")
    expect(windowsMainSource).toContain("ipcMain.handle(\"opencodex:update-local-profile\"")
    expect(windowsMainSource).toContain("ipcMain.handle(\"opencodex:reset-local-workspace\"")
    expect(windowsMainSource).toContain("ipcMain.handle(\"opencodex:get-backend-host-state\"")
    expect(windowsMainSource).toContain("ipcMain.handle(\"opencodex:save-backend-config\"")
    expect(windowsMainSource).toContain("ipcMain.handle(\"opencodex:restart-backend-host\"")
  })

  test("main startup no longer keeps desktop cloud-auth state machine", () => {
    const mainIndexSource = readUtf8("main/index.ts")

    expect(mainIndexSource).not.toContain("AuthManager")
    expect(mainIndexSource).not.toContain("initAuthManager")
    expect(mainIndexSource).not.toContain("getAuthManagerFromModule")
    expect(mainIndexSource).not.toContain("export function getAuthManager()")
    expect(mainIndexSource).not.toContain("export async function handleAuthCode")
    expect(mainIndexSource).not.toContain("x-desktop-token")
    expect(mainIndexSource).not.toContain("auth:success")
    expect(mainIndexSource).not.toContain("auth:error")
    expect(mainIndexSource).not.toContain("trackAuthCompleted")
    expect(mainIndexSource).not.toContain("setSubscriptionPlan")
  })

  test("desktop shell deletes the legacy cloud auth manager module", () => {
    const authManagerPath = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "main",
      "auth-manager.ts",
    )

    expect(existsSync(authManagerPath)).toBe(false)
  })
})
