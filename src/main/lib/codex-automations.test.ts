import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, test } from "bun:test"

import {
  createLocalCodexAutomation,
  deleteLocalCodexAutomation,
  listLocalCodexAutomations,
  parseCodexAutomationToml,
  runLocalCodexAutomationNow,
  updateLocalCodexAutomation,
} from "./codex-automations"

async function useTempCodexHome() {
  const tempCodexHome = await mkdtemp(join(tmpdir(), "1code-codex-automations-"))
  process.env.CODEX_HOME = tempCodexHome
  return tempCodexHome
}

describe("local Codex automations", () => {
  test("parses real Codex automation.toml shape", () => {
    expect(
      parseCodexAutomationToml(`
version = 1
id = "1code"
kind = "cron"
name = "1Code 自动化对齐临时验收"
prompt = "临时验收任务"
status = "ACTIVE"
rrule = "FREQ=HOURLY;INTERVAL=1"
model = "gpt-5.5"
reasoning_effort = "low"
execution_environment = "local"
cwds = ["/Users/moss/Projects/1code"]
created_at = 1781687761313
updated_at = 1781687761313
`),
    ).toMatchObject({
      id: "1code",
      status: "ACTIVE",
      reasoning_effort: "low",
      execution_environment: "local",
      cwds: ["/Users/moss/Projects/1code"],
    })
  })

  test("creates, lists, updates, runs, and deletes official-shaped TOML files", async () => {
    const originalCodexHome = process.env.CODEX_HOME
    const codexHome = await useTempCodexHome()
    try {
      const created = await createLocalCodexAutomation({
        name: "1Code 自动化对齐临时验收",
        prompt: "检查当前工作区。",
        status: "ACTIVE",
        rrule: "FREQ=HOURLY;INTERVAL=1",
        model: "gpt-5.5",
        reasoningEffort: "low",
        executionEnvironment: "local",
        cwds: ["/Users/moss/Projects/1code"],
      })

      expect(created).toMatchObject({
        source: "codex-local",
        name: "1Code 自动化对齐临时验收",
        status: "ACTIVE",
        engine: "codex",
        reasoning_effort: "low",
        execution_environment: "local",
      })

      const list = await listLocalCodexAutomations()
      expect(list.map((automation) => automation.id)).toEqual([created.id])

      await updateLocalCodexAutomation({ id: created.id, status: "PAUSED" })
      expect((await listLocalCodexAutomations())[0]).toMatchObject({
        id: created.id,
        status: "PAUSED",
      })

      await runLocalCodexAutomationNow({ automationId: created.id })
      expect(typeof (await listLocalCodexAutomations())[0]?.last_run_at).toBe(
        "number",
      )

      const toml = await readFile(
        join(codexHome, "automations", created.id, "automation.toml"),
        "utf8",
      )
      expect(toml).toContain('execution_environment = "local"')
      expect(toml).toContain('engine = "codex"')
      expect(toml).toContain('reasoning_effort = "low"')

      await deleteLocalCodexAutomation({ id: created.id })
      expect(await listLocalCodexAutomations()).toEqual([])
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      await rm(codexHome, { force: true, recursive: true })
    }
  })

  test("defaults new local automations to the Hermes model", async () => {
    const originalCodexHome = process.env.CODEX_HOME
    const codexHome = await useTempCodexHome()
    try {
      const created = await createLocalCodexAutomation({
        name: "Hermes 默认自动化",
        prompt: "确认自动化默认模型。",
      })

      expect(created).toMatchObject({
        model: "moss-default",
        engine: "hermes",
        source: "codex-local",
      })

      const toml = await readFile(
        join(codexHome, "automations", created.id, "automation.toml"),
        "utf8",
      )
      expect(toml).toContain('model = "moss-default"')
      expect(toml).toContain('engine = "hermes"')
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      await rm(codexHome, { force: true, recursive: true })
    }
  })

  test("persists the selected Claude Code engine for local automations", async () => {
    const originalCodexHome = process.env.CODEX_HOME
    const codexHome = await useTempCodexHome()
    try {
      const created = await createLocalCodexAutomation({
        name: "Claude 自动化",
        prompt: "用 Claude Code 检查当前工作区。",
        model: "claude-sonnet",
      })

      expect(created).toMatchObject({
        model: "claude-sonnet",
        engine: "claude-code",
        source: "codex-local",
      })

      const toml = await readFile(
        join(codexHome, "automations", created.id, "automation.toml"),
        "utf8",
      )
      expect(toml).toContain('model = "claude-sonnet"')
      expect(toml).toContain('engine = "claude-code"')
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      await rm(codexHome, { force: true, recursive: true })
    }
  })

  test("persists the selected Custom ACP engine for local automations", async () => {
    const originalCodexHome = process.env.CODEX_HOME
    const codexHome = await useTempCodexHome()
    try {
      const created = await createLocalCodexAutomation({
        name: "Custom ACP 自动化",
        prompt: "用自定义 ACP 检查当前工作区。",
        model: "custom-acp",
        engine: "custom-acp",
      })

      expect(created).toMatchObject({
        model: "custom-acp",
        engine: "custom-acp",
        source: "codex-local",
      })

      const toml = await readFile(
        join(codexHome, "automations", created.id, "automation.toml"),
        "utf8",
      )
      expect(toml).toContain('model = "custom-acp"')
      expect(toml).toContain('engine = "custom-acp"')
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      await rm(codexHome, { force: true, recursive: true })
    }
  })
})
