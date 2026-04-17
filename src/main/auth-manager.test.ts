import { describe, expect, test } from "bun:test"
import { resolveOpenCodexAuthApiBaseUrl } from "./lib/opencodex/auth-url"
import { resolveOpenCodexCloudAuthEnabled } from "./lib/opencodex/cloud-auth"

describe("resolveOpenCodexAuthApiBaseUrl", () => {
  test("uses the OpenCodex web base-url seam for packaged and dev auth calls", () => {
    expect(resolveOpenCodexAuthApiBaseUrl({ isPackaged: true, env: {} })).toBe("https://opencodex.invalid")
    expect(
      resolveOpenCodexAuthApiBaseUrl({
        isPackaged: true,
        env: { OPENCODEX_WEB_URL: " https://desktop.opencodex.example/root/ " },
      }),
    ).toBe("https://desktop.opencodex.example/root")
    expect(
      resolveOpenCodexAuthApiBaseUrl({
        isPackaged: false,
        env: { MAIN_VITE_API_URL: " https://dev-api.opencodex.example/base/ " },
      }),
    ).toBe("https://dev-api.opencodex.example/base")
  })
})

describe("resolveOpenCodexCloudAuthEnabled", () => {
  test("defaults OpenCodex to local-native mode", () => {
    expect(resolveOpenCodexCloudAuthEnabled({})).toBe(false)
    expect(resolveOpenCodexCloudAuthEnabled({ OPENCODEX_ENABLE_CLOUD_AUTH: "" })).toBe(false)
  })

  test("only enables cloud auth when explicitly requested", () => {
    expect(resolveOpenCodexCloudAuthEnabled({ OPENCODEX_ENABLE_CLOUD_AUTH: "1" })).toBe(true)
    expect(resolveOpenCodexCloudAuthEnabled({ OPENCODEX_ENABLE_CLOUD_AUTH: "true" })).toBe(true)
    expect(resolveOpenCodexCloudAuthEnabled({ OPENCODEX_ENABLE_CLOUD_AUTH: "0" })).toBe(false)
  })
})
