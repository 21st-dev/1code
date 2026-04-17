import { describe, expect, test } from "bun:test"
import {
  DEFAULT_OPENCODEX_WEB_BASE_URL,
  formatOpenCodexWindowTitle,
  getOpenCodexAppUserModelId,
  getOpenCodexAuthPageTitle,
  getOpenCodexAuthDeviceName,
  getOpenCodexCopyright,
  getOpenCodexProtocol,
  getOpenCodexSupportUrl,
  getOpenCodexTrustedHosts,
  getOpenCodexWebAppUrl,
  getOpenCodexWebBaseUrl,
  OPENCODEX_PRODUCT_NAME,
  OPENCODEX_SUPPORT_EMAIL,
} from "./app-identity"

describe("OpenCodex runtime identity", () => {
  test("uses OpenCodex product and protocol identifiers", () => {
    expect(OPENCODEX_PRODUCT_NAME).toBe("OpenCodex")
    expect(getOpenCodexProtocol(false)).toBe("opencodex")
    expect(getOpenCodexProtocol(true)).toBe("opencodex-dev")
  })

  test("uses OpenCodex app user model IDs for packaged and dev runs", () => {
    expect(getOpenCodexAppUserModelId(false)).toBe("dev.opencodex.desktop")
    expect(getOpenCodexAppUserModelId(true)).toBe("dev.opencodex.desktop.dev")
  })

  test("formats default window titles with the OpenCodex product name", () => {
    expect(formatOpenCodexWindowTitle()).toBe("OpenCodex")
    expect(formatOpenCodexWindowTitle({ badgeCount: 3 })).toBe("OpenCodex (3)")
    expect(formatOpenCodexWindowTitle({ title: "Custom Project" })).toBe("Custom Project")
  })

  test("formats auth callback page titles with the OpenCodex product name", () => {
    expect(getOpenCodexAuthPageTitle("Authentication")).toBe("OpenCodex - Authentication")
    expect(getOpenCodexAuthPageTitle("MCP Authentication")).toBe("OpenCodex - MCP Authentication")
  })

  test("uses OpenCodex-owned support url and copyright metadata", () => {
    expect(OPENCODEX_SUPPORT_EMAIL).toBe("support@opencodex.local")
    expect(getOpenCodexSupportUrl({})).toBe("mailto:support@opencodex.local")
    expect(getOpenCodexSupportUrl({ OPENCODEX_HOME_URL: " https://opencodex.example/product/ " })).toBe(
      "https://opencodex.example/product",
    )
    expect(getOpenCodexCopyright(2026)).toBe("Copyright (c) 2026 OpenCodex")
  })

  test("derives OpenCodex auth and trusted-host metadata from the packaged identity", () => {
    expect(getOpenCodexAuthDeviceName("1.2.3", "darwin", "arm64")).toBe(
      "OpenCodex 1.2.3 (darwin arm64)",
    )
    expect(getOpenCodexTrustedHosts("https://desktop.opencodex.example/api")).toEqual([
      "desktop.opencodex.example",
      "localhost",
      "127.0.0.1",
    ])
    expect(getOpenCodexTrustedHosts("mailto:support@opencodex.local")).toEqual([
      "localhost",
      "127.0.0.1",
    ])
  })

  test("resolves OpenCodex-owned web base and app urls", () => {
    expect(getOpenCodexWebBaseUrl({ OPENCODEX_WEB_URL: " https://desktop.opencodex.example/ " })).toBe(
      "https://desktop.opencodex.example",
    )
    expect(getOpenCodexWebBaseUrl({})).toBe(DEFAULT_OPENCODEX_WEB_BASE_URL)
    expect(getOpenCodexWebBaseUrl({ MAIN_VITE_API_URL: " https://api.opencodex.example/base/ " })).toBe(
      "https://api.opencodex.example/base",
    )
    expect(getOpenCodexWebAppUrl({})).toBe(`${DEFAULT_OPENCODEX_WEB_BASE_URL}/agents`)
    expect(getOpenCodexWebAppUrl({ OPENCODEX_WEB_URL: "https://desktop.opencodex.example" })).toBe(
      "https://desktop.opencodex.example/agents",
    )
    expect(getOpenCodexWebAppUrl({ OPENCODEX_WEB_URL: "https://desktop.opencodex.example/root/" })).toBe(
      "https://desktop.opencodex.example/root/agents",
    )
  })
})
