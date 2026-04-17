import { describe, expect, test } from "bun:test"
import {
  getOpenCodexBackendRouteTemplate,
  getOpenCodexBackendRuntimeKind,
  normalizeOpenCodexBackendRoute,
  openCodexBackendRouteRequiresHost,
  parseOpenCodexBackendRoute,
} from "./opencodex-backend-route"

describe("OpenCodex backend route helpers", () => {
  test("normalizes the approved subscription bridge route variants", () => {
    expect(
      normalizeOpenCodexBackendRoute({
        kind: "codex-subscription",
        authSource: "codex-local-auth",
      }),
    ).toEqual({
      kind: "codex-subscription",
      authSource: "codex-local-auth",
    })

    expect(
      normalizeOpenCodexBackendRoute({
        kind: "claude-subscription",
        authSource: "claude-local-auth",
      }),
    ).toEqual({
      kind: "claude-subscription",
      authSource: "claude-local-auth",
    })
  })

  test("migrates the legacy narrow config shape into the canonical union route", () => {
    expect(
      parseOpenCodexBackendRoute({
        providerFamily: "openai-compatible",
        baseUrl: " https://api.openai.com/v1 ",
        model: " gpt-5.2 ",
        apiKey: " sk-route-openai ",
      }),
    ).toEqual({
      kind: "openai-compatible-api",
      authSource: "api-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.2",
      apiKey: "sk-route-openai",
    })

    expect(
      parseOpenCodexBackendRoute({
        providerFamily: "custom",
        baseUrl: " http://127.0.0.1:8000/v1 ",
        model: " opencodex-default ",
        apiKey: " sk-custom-endpoint ",
      }),
    ).toEqual({
      kind: "custom-endpoint",
      authSource: "api-key",
      providerFamily: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "opencodex-default",
      apiKey: "sk-custom-endpoint",
    })
  })

  test("rejects invalid api-backed routes and identifies which routes need host launch materialization", () => {
    expect(
      normalizeOpenCodexBackendRoute({
        kind: "anthropic-compatible-api",
        authSource: "api-key",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-6",
        apiKey: "sk-short",
      }),
    ).toBeUndefined()

    expect(
      openCodexBackendRouteRequiresHost({
        kind: "codex-subscription",
        authSource: "codex-local-auth",
      }),
    ).toBe(false)

    expect(
      openCodexBackendRouteRequiresHost({
        kind: "custom-endpoint",
        authSource: "api-key",
        providerFamily: "anthropic-compatible",
        baseUrl: "https://proxy.example.com",
        model: "claude-opus",
        apiKey: "sk-ant-123456789012345678901",
      }),
    ).toBe(true)
  })

  test("provides stable templates and runtime mapping for all route kinds", () => {
    expect(getOpenCodexBackendRouteTemplate("codex-subscription")).toEqual({
      kind: "codex-subscription",
      authSource: "codex-local-auth",
    })

    expect(getOpenCodexBackendRouteTemplate("custom-endpoint")).toEqual({
      kind: "custom-endpoint",
      authSource: "api-key",
      providerFamily: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "opencodex-default",
      apiKey: "",
    })

    expect(
      getOpenCodexBackendRuntimeKind({
        kind: "openai-compatible-api",
        authSource: "api-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.2",
        apiKey: "sk-openai-route",
      }),
    ).toBe("codex")

    expect(
      getOpenCodexBackendRuntimeKind({
        kind: "claude-subscription",
        authSource: "claude-local-auth",
      }),
    ).toBe("claude")
  })
})