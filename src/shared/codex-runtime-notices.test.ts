import { describe, expect, test } from "bun:test"

import {
  isCodexRuntimeNoticeText,
  stripCodexRuntimeNoticeText,
} from "./codex-runtime-notices"

const reconnectNotice =
  "Reconnecting... 2/5 (stream disconnected before completion: failed to send websocket request: IO error: Broken pipe (os error 32))"

describe("codex runtime notice hygiene", () => {
  test("recognizes runtime notices", () => {
    expect(isCodexRuntimeNoticeText(reconnectNotice)).toBe(true)
    expect(
      isCodexRuntimeNoticeText(
        "Under-development features enabled: chronicle. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in /Users/moss/.codex/config.toml.",
      ),
    ).toBe(true)
    expect(
      isCodexRuntimeNoticeText(
        "Exceeded skills context budget of 2%. All skill descriptions were removed and 107 additional skills were not included in the model-visible skills list.",
      ),
    ).toBe(true)
    expect(isCodexRuntimeNoticeText("正常回答")).toBe(false)
  })

  test("strips a whole runtime notice", () => {
    expect(stripCodexRuntimeNoticeText(reconnectNotice)).toEqual({
      text: "",
      changed: true,
    })
  })

  test("strips runtime notice lines from mixed assistant text", () => {
    expect(
      stripCodexRuntimeNoticeText(
        `${reconnectNotice}\n\n页面状态正在稳定流转。\n输入框会恢复。`,
      ),
    ).toEqual({
      text: "页面状态正在稳定流转。\n输入框会恢复。",
      changed: true,
    })
  })
})
