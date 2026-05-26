import { describe, expect, test } from "bun:test"
import {
  getWorktreeCreateError,
  isWorktreeCheckoutTimeout,
  WORKTREE_CHECKOUT_TIMEOUT_MESSAGE,
  WORKTREE_CREATE_TIMEOUT_MS,
} from "../src/main/lib/git/worktree"

describe("worktree create failures", () => {
  test("uses a five minute checkout timeout", () => {
    expect(WORKTREE_CREATE_TIMEOUT_MS).toBe(300_000)
  })

  test("classifies killed git checkout as a timeout", () => {
    const timeoutError = Object.assign(new Error("Command timed out"), {
      killed: true,
      signal: "SIGTERM",
    })

    expect(isWorktreeCheckoutTimeout(timeoutError)).toBe(true)

    const worktreeError = getWorktreeCreateError(timeoutError, false)
    expect(worktreeError.reason).toBe("checkout-timeout")
    expect(worktreeError.message).toContain(WORKTREE_CHECKOUT_TIMEOUT_MESSAGE)
    expect(worktreeError.message).toContain("project directory")
  })

  test("keeps lock and lfs failures distinct from timeout", () => {
    expect(
      getWorktreeCreateError(new Error("could not lock config file"), false).reason,
    ).toBe("git-lock")
    expect(
      getWorktreeCreateError(new Error("git-lfs filter-process failed"), true)
        .reason,
    ).toBe("git-lfs")
  })
})
