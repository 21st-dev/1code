import { describe, expect, test } from "bun:test"
import { resolveHostCompatibleMcpStdioConfig } from "./mcp-stdio-compat"

describe("resolveHostCompatibleMcpStdioConfig", () => {
  test("maps a Windows project root path through the source project path", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["D:\\Moss\\services\\mcp-apps-ui\\servers\\server.mjs", "--stdio"],
        sourcePath: "/Users/moss/Codex/Moss",
      },
      {
        platform: "darwin",
        exists: (targetPath) =>
          targetPath === "/Users/moss/Codex/Moss" ||
          targetPath === "/Users/moss/Codex/Moss/services/mcp-apps-ui/servers/server.mjs",
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.cwd).toBe("/Users/moss/Codex/Moss")
      expect(result.config.args?.[0]).toBe(
        "/Users/moss/Codex/Moss/services/mcp-apps-ui/servers/server.mjs",
      )
    }
  })

  test("blocks unmapped Windows absolute paths on macOS", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["D:\\External\\server.mjs", "--stdio"],
        sourcePath: "/Users/moss/Codex/Moss",
      },
      {
        platform: "darwin",
        exists: (targetPath) => targetPath === "/Users/moss/Codex/Moss",
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Windows path is not mapped")
    }
  })

  test("skips a rewritten local Node script that is missing", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["D:\\Moss\\missing\\server.mjs", "--stdio"],
        sourcePath: "/Users/moss/Codex/Moss",
      },
      {
        platform: "darwin",
        exists: (targetPath) => targetPath === "/Users/moss/Codex/Moss",
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Local stdio script does not exist")
    }
  })

  test("skips a local Node script with unresolved bare dependencies", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["D:\\Moss\\servers\\premium\\index.mjs", "--stdio"],
        sourcePath: "/Users/moss/Codex/Moss",
      },
      {
        platform: "darwin",
        exists: (targetPath) =>
          targetPath === "/Users/moss/Codex/Moss" ||
          targetPath === "/Users/moss/Codex/Moss/servers/premium/index.mjs",
        readFile: () =>
          'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
        canResolve: () => false,
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Local stdio script dependency is not installed")
      expect(result.reason).toContain("@modelcontextprotocol/sdk")
    }
  })

  test("skips node commands that do not name a stdio server script", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["--version"],
        sourcePath: "/Users/moss/Movies/Videos",
      },
      {
        platform: "darwin",
        exists: (targetPath) => targetPath === "/Users/moss/Movies/Videos",
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("no entry script")
    }
  })

  test("skips a missing relative Node script resolved against cwd", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["./mcp/server.mjs"],
        cwd: "/Users/moss/Projects/1code",
      },
      {
        platform: "darwin",
        exists: (targetPath) => targetPath === "/Users/moss/Projects/1code",
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Local stdio script does not exist")
      expect(result.reason).toContain("/Users/moss/Projects/1code/mcp/server.mjs")
    }
  })

  test("skips a relative Node script when no cwd or source path is available", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["./mcp/server.mjs"],
      },
      {
        platform: "darwin",
        exists: () => true,
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Relative stdio script requires cwd")
      expect(result.reason).toContain("./mcp/server.mjs")
    }
  })

  test("uses cwd for dependency checks on an existing relative Node script", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "node",
        args: ["./mcp/server.mjs"],
        cwd: "/Users/moss/Projects/1code",
      },
      {
        platform: "darwin",
        exists: (targetPath) =>
          targetPath === "/Users/moss/Projects/1code" ||
          targetPath === "/Users/moss/Projects/1code/mcp/server.mjs",
        readFile: () => 'import { Server } from "@modelcontextprotocol/sdk/server/index.js";',
        canResolve: () => false,
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Local stdio script dependency is not installed")
      expect(result.reason).toContain("@modelcontextprotocol/sdk")
    }
  })

  test("uses source path to resolve relative cwd before launching a local command", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "./mcp/server",
        args: ["--stdio"],
        cwd: ".",
        sourcePath: "/Users/moss/Projects/1code",
      },
      {
        platform: "darwin",
        exists: (targetPath) =>
          targetPath === "/Users/moss/Projects/1code" ||
          targetPath === "/Users/moss/Projects/1code/mcp/server",
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.cwd).toBe("/Users/moss/Projects/1code")
    }
  })

  test("skips a missing relative app command before the stdio transport spawns it", () => {
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
        args: ["mcp"],
        cwd: "/Users/moss/.codex/plugins/cache/openai-bundled/computer-use/1.0.809",
      },
      {
        platform: "darwin",
        exists: (targetPath) =>
          targetPath === "/Users/moss/.codex/plugins/cache/openai-bundled/computer-use/1.0.809",
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("Local stdio command does not exist")
      expect(result.reason).toContain("SkyComputerUseClient")
    }
  })

  test("allows an existing relative app command to run from an absolute plugin cwd", () => {
    const command =
      "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
    const cwd = "/Users/moss/.codex/plugins/cache/openai-bundled/computer-use/1.0.809"
    const result = resolveHostCompatibleMcpStdioConfig(
      {
        command,
        args: ["mcp"],
        cwd,
      },
      {
        platform: "darwin",
        exists: (targetPath) => targetPath === cwd || targetPath === `${cwd}/${command.slice(2)}`,
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.command).toBe(command)
      expect(result.config.cwd).toBe(cwd)
    }
  })
})
