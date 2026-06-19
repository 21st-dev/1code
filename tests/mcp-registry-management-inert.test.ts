import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const registryDir = join(process.cwd(), "src/main/lib/mcp-registry")
const registrySources = readdirSync(registryDir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => ({
    file,
    source: readFileSync(join(registryDir, file), "utf8"),
  }))

describe("MCP registry management-time inert boundary", () => {
  test("does not import process execution or route-local MCP helpers", () => {
    for (const { file, source } of registrySources) {
      expect(source, file).not.toMatch(/from ["']node:child_process["']/)
      expect(source, file).not.toMatch(/from ["']child_process["']/)
      expect(source, file).not.toContain("runCodexCliChecked")
      expect(source, file).not.toContain("addCodexMcpServer")
      expect(source, file).not.toContain("addClaudeMcpServer")
      expect(source, file).not.toContain("removeCodexMcpServer")
      expect(source, file).not.toContain("removeClaudeMcpServer")
      expect(source, file).not.toContain("startCodexMcpOAuth")
      expect(source, file).not.toContain("startClaudeMcpOAuth")
    }
  })

  test("does not call MCP tools or launch package managers during browse preview work", () => {
    for (const { file, source } of registrySources) {
      expect(source, file).not.toContain("fetchMcpTools")
      expect(source, file).not.toContain("fetchMcpToolsStdio")
      expect(source, file).not.toMatch(/\bspawn\s*\(/)
      expect(source, file).not.toMatch(/\bexecFile\s*\(/)
      expect(source, file).not.toMatch(/\bexec\s*\(/)
      expect(source, file).not.toMatch(/\bdocker\b/i)
      expect(source, file).not.toMatch(/\bnpm\s+(?:install|exec|run)\b/i)
      expect(source, file).not.toMatch(/\bnpx\b.*\b-y\b/i)
    }
  })
})
