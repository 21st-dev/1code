export const DESKTOP_RUNTIME_CONTROL_LEVELS = [
  "plan",
  "observe",
  "guarded",
  "strict",
] as const

export type DesktopRuntimeControlLevel =
  (typeof DESKTOP_RUNTIME_CONTROL_LEVELS)[number]

export type ResolvedDesktopRuntimeControlLevel = Exclude<
  DesktopRuntimeControlLevel,
  "strict"
>

