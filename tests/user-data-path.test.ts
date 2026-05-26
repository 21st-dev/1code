import { describe, expect, test } from "bun:test"
import { join, resolve } from "path"
import { resolveUserDataPath } from "../src/main/lib/user-data-path"

describe("user data path resolution", () => {
  test("keeps legacy default paths for existing data", () => {
    expect(
      resolveUserDataPath({
        appDataPath: "/Users/test/Library/Application Support",
        isDev: true,
        legacyAppName: "Agent Code for Me",
        env: {},
      }),
    ).toEqual({
      path: join("/Users/test/Library/Application Support", "Agent Code for Me Dev"),
      source: "default",
    })

    expect(
      resolveUserDataPath({
        appDataPath: "/Users/test/Library/Application Support",
        isDev: false,
        legacyAppName: "Agent Code for Me",
        env: {},
      }),
    ).toEqual({
      path: join("/Users/test/Library/Application Support", "Agent Code for Me"),
      source: "default",
    })
  })

  test("uses LOCUS_USER_DATA_DIR for clean first-run profiles", () => {
    expect(
      resolveUserDataPath({
        appDataPath: "/ignored",
        isDev: true,
        legacyAppName: "Agent Code for Me",
        env: { LOCUS_USER_DATA_DIR: "tmp/locus-profile" },
      }),
    ).toEqual({
      path: resolve("tmp/locus-profile"),
      source: "LOCUS_USER_DATA_DIR",
    })
  })

  test("supports the legacy override environment variable", () => {
    expect(
      resolveUserDataPath({
        appDataPath: "/ignored",
        isDev: false,
        legacyAppName: "Agent Code for Me",
        env: { AGENT_CODE_FOR_ME_USER_DATA_DIR: "/tmp/agent-code-profile" },
      }),
    ).toEqual({
      path: "/tmp/agent-code-profile",
      source: "AGENT_CODE_FOR_ME_USER_DATA_DIR",
    })
  })
})
