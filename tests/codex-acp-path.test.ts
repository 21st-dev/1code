import { describe, expect, test } from "bun:test"
import {
  getCodexAcpPackageName,
  toUnpackedAsarPath,
} from "../src/main/lib/codex/acp-path"

describe("Codex ACP runtime path helpers", () => {
  test("maps supported platform and arch pairs to optional package names", () => {
    expect(
      getCodexAcpPackageName({ platform: "darwin", arch: "arm64" }),
    ).toBe("@zed-industries/codex-acp-darwin-arm64")
    expect(getCodexAcpPackageName({ platform: "linux", arch: "x64" })).toBe(
      "@zed-industries/codex-acp-linux-x64",
    )
    expect(getCodexAcpPackageName({ platform: "win32", arch: "arm64" })).toBe(
      "@zed-industries/codex-acp-win32-arm64",
    )
    expect(() =>
      getCodexAcpPackageName({ platform: "freebsd", arch: "x64" }),
    ).toThrow("Unsupported platform/arch for codex-acp: freebsd/x64")
  })

  test("prefers app.asar.unpacked path only when it exists", () => {
    const packed = "/Applications/Locus.app/Contents/Resources/app.asar/bin/codex-acp"
    const unpacked =
      "/Applications/Locus.app/Contents/Resources/app.asar.unpacked/bin/codex-acp"

    expect(
      toUnpackedAsarPath(packed, {
        exists: (path) => path === unpacked,
      }),
    ).toBe(unpacked)
    expect(toUnpackedAsarPath(packed, { exists: () => false })).toBe(packed)
    expect(toUnpackedAsarPath("/tmp/codex-acp", { exists: () => true })).toBe(
      "/tmp/codex-acp",
    )
  })
})
