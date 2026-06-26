import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildGitHubCloneTarget,
  cloneGitHubRepository,
  parseGitHubRepoIdentity,
} from "../src/main/lib/projects/github-clone"

const tempDirs: string[] = []

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("GitHub clone input boundary", () => {
  test("normalizes supported GitHub repository identities to owner/repo only", () => {
    expect(parseGitHubRepoIdentity("lupanpan1030/agent-code-for-me")).toEqual({
      owner: "lupanpan1030",
      repo: "agent-code-for-me",
    })
    expect(
      parseGitHubRepoIdentity(
        "https://github.com/lupanpan1030/agent-code-for-me.git",
      ),
    ).toEqual({
      owner: "lupanpan1030",
      repo: "agent-code-for-me",
    })
    expect(
      parseGitHubRepoIdentity("git@github.com:lupanpan1030/agent-code-for-me.git"),
    ).toEqual({
      owner: "lupanpan1030",
      repo: "agent-code-for-me",
    })
  })

  test("rejects shell metacharacters, extra URL parts, and git clone option injection", () => {
    const maliciousInputs = [
      "lupanpan1030/agent-code-for-me;rm -rf ~",
      "https://github.com/lupanpan1030/agent-code-for-me;rm -rf ~",
      "https://github.com/lupanpan1030/agent-code-for-me/extra",
      "https://github.com/lupanpan1030/agent-code-for-me?upload-pack=sh",
      "lupanpan1030/--upload-pack=touch-pwned",
      "git@github.com:lupanpan1030/agent-code-for-me --upload-pack=sh",
    ]

    for (const input of maliciousInputs) {
      expect(() => parseGitHubRepoIdentity(input)).toThrow(
        "Invalid GitHub URL or repo format",
      )
    }
  })

  test("runs git clone through argv without a shell", async () => {
    const homePath = await makeTempDir("locus-github-clone-home-")
    const target = buildGitHubCloneTarget(
      "lupanpan1030/agent-code-for-me",
      homePath,
    )
    const calls: Array<{ file: string; args: string[] }> = []

    await cloneGitHubRepository(target, async (file, args) => {
      calls.push({ file, args })
    })

    expect(calls).toEqual([
      {
        file: "git",
        args: [
          "clone",
          "--",
          "https://github.com/lupanpan1030/agent-code-for-me.git",
          join(homePath, ".21st", "repos", "lupanpan1030", "agent-code-for-me"),
        ],
      },
    ])
  })
})

