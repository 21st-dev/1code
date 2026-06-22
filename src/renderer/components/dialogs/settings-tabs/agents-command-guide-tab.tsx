import { useAtomValue } from "jotai"
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Command,
  ExternalLink,
  FileText,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ComponentType, ReactNode } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Textarea } from "../../ui/textarea"
import { BUILTIN_SLASH_COMMANDS } from "../../../features/agents/commands"
import { selectedProjectAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { useI18n, type TranslationKey } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"

type RuntimeGuideItem = {
  runtime: "claude-code" | "codex"
  label: string
  executable: {
    ok: boolean
    path: string | null
    error: string | null
  }
  version: string | null
  cliCommands: {
    name: string
    description: string
  }[]
  error: string | null
}

type OfficialCommandProviderId = "claude-code" | "codex"
type OfficialCommandKind = "cli" | "slash" | "flag"

type OfficialCommandEntry = {
  provider: OfficialCommandProviderId
  kind: OfficialCommandKind
  name: string
  description: string
  sourceTitle: string
  sourceUrl: string
  maturity?: string
  example?: string
}

type OfficialCommandSourceSnapshot = {
  title: string
  url: string
  htmlUrl: string
  hash: string | null
  etag: string | null
  lastModified: string | null
  fetchedAt: string | null
  commandCount: number
  error: string | null
}

type OfficialProviderSnapshot = {
  provider: OfficialCommandProviderId
  label: string
  docsUrl: string
  updatedAt: string | null
  entries: OfficialCommandEntry[]
  sources: OfficialCommandSourceSnapshot[]
  error: string | null
}

type OfficialCommandIndexSnapshot = {
  schemaVersion: 1
  updatedAt: string | null
  providers: OfficialProviderSnapshot[]
}

type OfficialDocLink = {
  label: string
  url: string
}

type LocalCommandFile = {
  name: string
  description: string
  source: "user" | "project" | "plugin"
  path: string
  content: string
  argumentHint?: string
  pluginName?: string
}

type CommandEditorState =
  | { mode: "create" }
  | { mode: "edit"; command: LocalCommandFile }

type CommandEditorDraft = {
  name: string
  description: string
  argumentHint: string
  content: string
  source: "user" | "project"
}

function SourceBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="shrink-0 whitespace-nowrap text-[10px] font-medium">
      {label}
    </Badge>
  )
}

function OfficialDocsCard({
  title,
  description,
  updateNote,
  links,
}: {
  title: string
  description: string
  updateNote: string
  links: OfficialDocLink[]
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {links.map((link) => (
          <Button
            key={link.url}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => void window.desktopApi.openExternal(link.url)}
          >
            {link.label}
            <ExternalLink className="h-3 w-3" />
          </Button>
        ))}
      </div>
      <p className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {updateNote}
      </p>
    </div>
  )
}

function CapabilitySummaryCard({
  icon: Icon,
  title,
  description,
  label,
  value,
  countLabel,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  label: string
  value: number
  countLabel: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-xs font-semibold text-foreground">{title}</p>
        </div>
        <SourceBadge label={label} />
      </div>
      <div className="mt-3 flex min-w-0 items-baseline gap-2">
        <p className="font-mono text-2xl font-semibold leading-none text-foreground">
          {value}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{countLabel}</p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}

function getBuiltinCommandDescription(
  name: string,
  t: (key: TranslationKey) => string,
  fallback: string,
): string {
  const keyByName: Record<string, TranslationKey> = {
    clear: "settings.commands.builtin.clear",
    plan: "settings.commands.builtin.plan",
    agent: "settings.commands.builtin.agent",
    compact: "settings.commands.builtin.compact",
    init: "settings.commands.builtin.init",
    doctor: "settings.commands.builtin.doctor",
    diff: "settings.commands.builtin.diff",
    review: "settings.commands.builtin.review",
    "pr-comments": "settings.commands.builtin.prComments",
    "release-notes": "settings.commands.builtin.releaseNotes",
    "security-review": "settings.commands.builtin.securityReview",
    commit: "settings.commands.builtin.commit",
    "worktree-setup": "settings.commands.builtin.worktreeSetup",
  }

  const key = keyByName[name]
  return key ? t(key) : fallback
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

function formatSnapshotDate(value: string | null): string {
  if (!value) return ""

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return value
  }
}

function normalizeRuntimeCommandName(name: string): string | null {
  const normalized = name.split("|")[0]?.trim().toLowerCase()
  return normalized || null
}

function normalizeOfficialCliCommandName(
  provider: OfficialCommandProviderId,
  name: string,
): string | null {
  const tokens = name
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)

  if (tokens.length === 0) return null

  const binary = provider === "codex" ? "codex" : "claude"
  if (tokens[0]?.toLowerCase() === binary) {
    return tokens[1]?.toLowerCase() ?? null
  }

  return tokens[0]?.toLowerCase() ?? null
}

function getOfficialKindLabel(
  kind: OfficialCommandKind,
  t: (key: TranslationKey) => string,
): string {
  if (kind === "slash") return t("settings.commands.officialKindSlash")
  if (kind === "flag") return t("settings.commands.officialKindFlag")
  return t("settings.commands.officialKindCli")
}

function getOfficialComparison(
  provider: OfficialProviderSnapshot,
  runtimes: RuntimeGuideItem[] | undefined,
) {
  const runtime = runtimes?.find((item) => item.runtime === provider.provider)
  const localNames = new Set(
    (runtime?.cliCommands ?? [])
      .map((command) => normalizeRuntimeCommandName(command.name))
      .filter((name): name is string => Boolean(name)),
  )
  const officialNames = new Set(
    provider.entries
      .filter((entry) => entry.kind === "cli")
      .map((entry) => normalizeOfficialCliCommandName(provider.provider, entry.name))
      .filter((name): name is string => Boolean(name)),
  )
  const officialOnly = [...officialNames]
    .filter((name) => !localNames.has(name))
    .slice(0, 4)

  return {
    localCount: localNames.size,
    officialCount: officialNames.size,
    officialOnly,
  }
}

function OfficialSnapshotPanel({
  snapshot,
  runtimes,
  isLoading,
  isRefreshing,
  refreshError,
  onRefresh,
}: {
  snapshot: OfficialCommandIndexSnapshot | undefined
  runtimes: RuntimeGuideItem[] | undefined
  isLoading: boolean
  isRefreshing: boolean
  refreshError: string | null
  onRefresh: () => void
}) {
  const { t } = useI18n()
  const [expandedProviders, setExpandedProviders] = useState<
    Set<OfficialCommandProviderId>
  >(() => new Set())
  const providers = snapshot?.providers ?? []
  const lastUpdated = formatSnapshotDate(snapshot?.updatedAt ?? null)
  const hasSnapshotState = providers.some(
    (provider) =>
      provider.entries.length > 0 ||
      Boolean(provider.error) ||
      provider.sources.some((source) => Boolean(source.fetchedAt || source.error)),
  )

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            {t("settings.commands.officialSnapshotTitle")}
          </h4>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {t("settings.commands.officialSnapshotDescription")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("settings.commands.officialSnapshotLastUpdated")}:{" "}
            {lastUpdated || t("settings.commands.officialSnapshotNever")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
          {t("settings.commands.updateOfficialIndex")}
        </Button>
      </div>

      {refreshError && (
        <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-600 dark:text-amber-300">
          {refreshError}
        </div>
      )}

      {isLoading ? (
        <div className="mt-3">
          <EmptyLine>{t("common.loading")}</EmptyLine>
        </div>
      ) : !hasSnapshotState ? (
        <div className="mt-3">
          <EmptyLine>{t("settings.commands.noOfficialSnapshot")}</EmptyLine>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {providers.map((provider) => {
            const comparison = getOfficialComparison(provider, runtimes)
            const sourceCount = provider.sources.filter(
              (source) => source.fetchedAt,
            ).length
            const isExpanded = expandedProviders.has(provider.provider)
            const visibleEntries = isExpanded ? provider.entries : []
            const commandKindCounts = provider.entries.reduce(
              (counts, entry) => {
                counts[entry.kind] += 1
                return counts
              },
              { cli: 0, slash: 0, flag: 0 } as Record<OfficialCommandKind, number>,
            )

            return (
              <div
                key={provider.provider}
                className="min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h5 className="text-sm font-semibold text-foreground">
                        {provider.label}
                      </h5>
                      <SourceBadge
                        label={t("settings.commands.officialSnapshotEntries", {
                          count: provider.entries.length,
                        })}
                      />
                      <SourceBadge
                        label={t("settings.commands.officialSnapshotSources", {
                          count: sourceCount,
                        })}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("settings.commands.officialSnapshotLocalVsOfficial", {
                        local: comparison.localCount,
                        official: comparison.officialCount,
                      })}
                    </p>
                  </div>
                  {provider.error ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                </div>

                <p className="mt-2 rounded-md bg-background px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {comparison.officialOnly.length > 0
                    ? t("settings.commands.officialSnapshotDifference", {
                        count: comparison.officialOnly.length,
                        examples: comparison.officialOnly.join(", "),
                      })
                    : t("settings.commands.officialSnapshotNoDifference")}
                </p>

                {provider.error && (
                  <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">
                    {provider.error}
                  </div>
                )}

                <div className="mt-3 space-y-1.5">
                  {provider.sources.map((source) => (
                    <button
                      key={source.url}
                      type="button"
                      onClick={() => void window.desktopApi.openExternal(source.htmlUrl)}
                      className="flex w-full min-w-0 items-start justify-between gap-2 rounded-md bg-background px-2.5 py-2 text-left hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-medium text-foreground">
                          {source.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {source.error
                            ? t("settings.commands.officialSourceFailed")
                            : t("settings.commands.officialSourceMeta", {
                                count: source.commandCount,
                                hash: source.hash || "-",
                              })}
                        </span>
                      </span>
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>

                {provider.entries.length > 0 && (
                  <>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-background px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-foreground">
                          {t("settings.commands.officialCommandSummaryTitle", {
                            count: provider.entries.length,
                          })}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {t("settings.commands.officialCommandSummaryMeta", {
                            cli: commandKindCounts.cli,
                            slash: commandKindCounts.slash,
                            flag: commandKindCounts.flag,
                          })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px]"
                        onClick={() => {
                          setExpandedProviders((current) => {
                            const next = new Set(current)
                            if (next.has(provider.provider)) {
                              next.delete(provider.provider)
                            } else {
                              next.add(provider.provider)
                            }
                            return next
                          })
                        }}
                      >
                        {isExpanded
                          ? t("settings.commands.officialCollapseCommands")
                          : t("settings.commands.officialShowAllCommands", {
                              count: provider.entries.length,
                            })}
                      </Button>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 grid max-h-[560px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-1">
                        {visibleEntries.map((entry) => (
                          <div
                            key={`${entry.kind}:${entry.name}:${entry.sourceTitle}`}
                            className="min-w-0 rounded-md bg-background px-2.5 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground">
                                {entry.name}
                              </p>
                              <SourceBadge label={getOfficialKindLabel(entry.kind, t)} />
                            </div>
                            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                              {entry.description || entry.sourceTitle}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RuntimePanel({ runtime }: { runtime: RuntimeGuideItem }) {
  const { t } = useI18n()
  const isOk = runtime.executable.ok && !runtime.error

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              {runtime.label}
            </h4>
            <SourceBadge label={t("settings.commands.referenceOnly")} />
            <SourceBadge
              label={
                isOk
                  ? t("settings.commands.statusDetected")
                  : t("settings.commands.statusUnavailable")
              }
            />
          </div>
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
            {runtime.executable.path || t("settings.commands.pathUnavailable")}
          </p>
        </div>
        {isOk ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t("settings.commands.version")}
            </p>
            <p className="mt-1 truncate text-xs text-foreground">
              {runtime.version || t("settings.commands.versionUnknown")}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t("settings.commands.source")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.commands.localHelpOutput")}
            </p>
          </div>
        </div>

        {runtime.error && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
            {runtime.error}
          </div>
        )}

        {runtime.cliCommands.length > 0 ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {runtime.cliCommands.map((command) => (
              <div
                key={`${runtime.runtime}:${command.name}`}
                className="min-w-0 rounded-md bg-muted/50 px-2.5 py-2"
              >
                <p className="truncate font-mono text-xs text-foreground">
                  {command.name}
                </p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {command.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyLine>{t("settings.commands.noRuntimeCommands")}</EmptyLine>
        )}
      </div>
    </div>
  )
}

function CommandFileList({
  commands,
  badgeLabel,
  onEdit,
  onDelete,
}: {
  commands: LocalCommandFile[]
  badgeLabel?: string
  onEdit?: (command: LocalCommandFile) => void
  onDelete?: (command: LocalCommandFile) => void
}) {
  const { t } = useI18n()

  if (commands.length === 0) {
    return <EmptyLine>{t("settings.commands.noLocalCommands")}</EmptyLine>
  }

  return (
    <div className="space-y-1.5">
      {commands.map((command) => (
        <div
          key={`${command.source}:${command.path}:${command.name}`}
          className="flex items-start justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-foreground">
              /{command.name}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {command.description || t("settings.commands.noDescription")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SourceBadge
              label={badgeLabel || (
                command.source === "project"
                  ? t("settings.commands.sourceProject")
                  : command.source === "plugin"
                    ? t("settings.commands.sourcePlugin")
                    : t("settings.commands.sourceUser")
              )}
            />
            <span className="max-w-[180px] truncate text-[10px] text-muted-foreground">
              {command.pluginName || command.path}
            </span>
            {command.source !== "plugin" && (onEdit || onDelete) && (
              <div className="mt-1 flex items-center gap-1">
                {onEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(command)}
                    aria-label={t("settings.commands.editCommand")}
                    title={t("settings.commands.editCommand")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                    onClick={() => onDelete(command)}
                    aria-label={t("settings.commands.deleteCommand")}
                    title={t("settings.commands.deleteCommand")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CommandEditorDialog({
  editor,
  hasProject,
  projectName,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  editor: CommandEditorState | null
  hasProject: boolean
  projectName?: string
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: CommandEditorDraft, editor: CommandEditorState) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [argumentHint, setArgumentHint] = useState("")
  const [content, setContent] = useState("")
  const [source, setSource] = useState<"user" | "project">("user")

  useEffect(() => {
    if (!editor) return

    if (editor.mode === "edit") {
      setName(editor.command.name)
      setDescription(editor.command.description)
      setArgumentHint(editor.command.argumentHint ?? "")
      setContent(editor.command.content)
      setSource(editor.command.source === "project" ? "project" : "user")
      return
    }

    setName("")
    setDescription("")
    setArgumentHint("")
    setContent("")
    setSource("user")
  }, [editor])

  const canSave = Boolean(editor) && name.trim().length > 0

  const handleSubmit = useCallback(() => {
    if (!editor || !canSave) return
    onSubmit(
      {
        name,
        description,
        argumentHint,
        content,
        source,
      },
      editor,
    )
  }, [argumentHint, canSave, content, description, editor, name, onSubmit, source])

  const isEdit = editor?.mode === "edit"

  return (
    <Dialog open={!!editor} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">
            {isEdit
              ? t("settings.commands.editCommand")
              : t("settings.commands.newCommand")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.commands.commandEditorDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("settings.commands.commandName")}</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isEdit}
                placeholder="my-command"
                autoFocus={!isEdit}
              />
              <p className="text-[11px] text-muted-foreground">
                {isEdit
                  ? t("settings.commands.commandNameReadonly")
                  : t("settings.commands.commandNameHint")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("settings.commands.commandScope")}</Label>
              {isEdit ? (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {source === "project"
                    ? projectName
                      ? t("settings.commands.scopeProjectNamed", {
                          project: projectName,
                        })
                      : t("settings.commands.sourceProject")
                    : t("settings.commands.scopeUserCommand")}
                </div>
              ) : hasProject ? (
                <Select
                  value={source}
                  onValueChange={(value) =>
                    setSource(value as "user" | "project")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      {t("settings.commands.scopeUserCommand")}
                    </SelectItem>
                    <SelectItem value="project">
                      {projectName
                        ? t("settings.commands.scopeProjectNamed", {
                            project: projectName,
                          })
                        : t("settings.commands.sourceProject")}{" "}
                      (.claude/commands/)
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {t("settings.commands.scopeUserCommand")}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.commands.commandDescription")}</Label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("settings.commands.commandDescriptionPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.commands.argumentHint")}</Label>
            <Input
              value={argumentHint}
              onChange={(event) => setArgumentHint(event.target.value)}
              placeholder={t("settings.commands.argumentHintPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.commands.commandPrompt")}</Label>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={12}
              className="font-mono resize-y"
              placeholder={t("settings.commands.commandPromptPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/40 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSave || isSaving}>
            {isSaving
              ? isEdit
                ? t("common.saving")
                : t("common.creating")
              : isEdit
                ? t("common.save")
                : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AgentsCommandGuideTab() {
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()
  const selectedProject = useAtomValue(selectedProjectAtom)
  const projectPath = selectedProject?.path
  const [showAdvancedReferences, setShowAdvancedReferences] = useState(false)
  const [commandEditor, setCommandEditor] =
    useState<CommandEditorState | null>(null)
  const [deletingCommand, setDeletingCommand] =
    useState<LocalCommandFile | null>(null)

  const runtimeGuideQuery = trpc.commands.runtimeGuide.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const commandsQuery = trpc.commands.list.useQuery(
    { projectPath },
    {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  )
  const pluginsQuery = trpc.plugins.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const officialIndexQuery = trpc.commands.officialIndex.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const refreshOfficialIndexMutation =
    trpc.commands.refreshOfficialIndex.useMutation({
      onMutate: () => {
        toast.info(t("settings.commands.officialSnapshotUpdating"))
      },
      onSuccess: (snapshot) => {
        trpcUtils.commands.officialIndex.setData(undefined, snapshot)
        const total = snapshot.providers.reduce(
          (count, provider) => count + provider.entries.length,
          0,
        )
        toast.success(t("settings.commands.officialSnapshotUpdated"), {
          description: t("settings.commands.officialSnapshotUpdatedDescription", {
            count: total,
          }),
        })
      },
      onError: (error) => {
        toast.error(t("settings.commands.officialSnapshotUpdateFailed"), {
          description: error.message,
        })
      },
    })
  const createCommandMutation = trpc.commands.create.useMutation()
  const updateCommandMutation = trpc.commands.update.useMutation()
  const deleteCommandMutation = trpc.commands.delete.useMutation()

  const commandFiles = commandsQuery.data ?? []
  const userAndProjectCommands = commandFiles.filter(
    (command) => command.source !== "plugin",
  )
  const pluginFileCommands = commandFiles.filter(
    (command) => command.source === "plugin",
  )
  const runtimeCommandCount =
    runtimeGuideQuery.data?.reduce(
      (count, runtime) => count + runtime.cliCommands.length,
      0,
    ) ?? 0

  const pluginCommandSummary = useMemo(() => {
    const plugins = pluginsQuery.data ?? []
    const summary = {
      total: 0,
      claude: 0,
      codex: 0,
      entries: [] as {
        key: string
        runtime: string
        pluginName: string
        commandName: string
        description?: string
      }[],
    }

    for (const plugin of plugins) {
      for (const command of plugin.components.commands) {
        summary.total += 1
        if (plugin.runtime === "claude") summary.claude += 1
        if (plugin.runtime === "codex") summary.codex += 1
        summary.entries.push({
          key: `${plugin.runtime}:${plugin.source}:${command.name}`,
          runtime: plugin.runtime,
          pluginName: plugin.name,
          commandName: command.name,
          description: command.description,
        })
      }
    }

    return summary
  }, [pluginsQuery.data])

  const handleRefresh = () => {
    void runtimeGuideQuery.refetch()
    void commandsQuery.refetch()
    void pluginsQuery.refetch()
  }

  const handleRefreshOfficialIndex = () => {
    refreshOfficialIndexMutation.mutate()
  }

  const handleSubmitCommand = useCallback(
    async (draft: CommandEditorDraft, editor: CommandEditorState) => {
      try {
        if (editor.mode === "create") {
          const result = await createCommandMutation.mutateAsync({
            name: draft.name,
            description: draft.description,
            argumentHint: draft.argumentHint || undefined,
            content: draft.content,
            source: draft.source,
            projectPath,
          })
          toast.success(t("settings.commands.toast.commandCreated"), {
            description: `/${result.name}`,
          })
        } else {
          await updateCommandMutation.mutateAsync({
            path: editor.command.path,
            name: editor.command.name,
            description: draft.description,
            argumentHint: draft.argumentHint || undefined,
            content: draft.content,
            projectPath,
          })
          toast.success(t("settings.commands.toast.commandSaved"), {
            description: `/${editor.command.name}`,
          })
        }

        setCommandEditor(null)
        await commandsQuery.refetch()
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.commands.toast.failedToSaveCommand")
        toast.error(t("settings.commands.toast.failedToSaveCommand"), {
          description: message,
        })
      }
    },
    [
      commandsQuery,
      createCommandMutation,
      projectPath,
      t,
      updateCommandMutation,
    ],
  )

  const handleDeleteCommand = useCallback(async () => {
    if (!deletingCommand) return

    try {
      await deleteCommandMutation.mutateAsync({
        path: deletingCommand.path,
        projectPath,
      })
      toast.success(t("settings.commands.toast.commandDeleted"), {
        description: `/${deletingCommand.name}`,
      })
      setDeletingCommand(null)
      await commandsQuery.refetch()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings.commands.toast.failedToDeleteCommand")
      toast.error(t("settings.commands.toast.failedToDeleteCommand"), {
        description: message,
      })
    }
  }, [commandsQuery, deleteCommandMutation, deletingCommand, projectPath, t])

  const isRefreshing =
    runtimeGuideQuery.isFetching || commandsQuery.isFetching || pluginsQuery.isFetching
  const isOfficialIndexRefreshing =
    officialIndexQuery.isFetching || refreshOfficialIndexMutation.isPending
  const isCommandMutationPending =
    createCommandMutation.isPending ||
    updateCommandMutation.isPending ||
    deleteCommandMutation.isPending

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {t("settings.commands.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {t("settings.commands.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="shrink-0"
        >
          <RefreshCw
            className={cn("mr-1.5 h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
          {t("settings.commands.refresh")}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <CapabilitySummaryCard
          icon={Command}
          title={t("settings.commands.guide.chatTitle")}
          description={t("settings.commands.guide.chatDescription")}
          label={t("settings.commands.usableInChat")}
          value={BUILTIN_SLASH_COMMANDS.length}
          countLabel={t("settings.commands.countLocus")}
        />
        <CapabilitySummaryCard
          icon={FileText}
          title={t("settings.commands.guide.filesTitle")}
          description={t("settings.commands.guide.filesDescription")}
          label={t("settings.commands.usableInChat")}
          value={userAndProjectCommands.length}
          countLabel={t("settings.commands.countLocalFiles")}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t("settings.commands.localIndexNotice")}
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={Command}
          title={t("settings.commands.locusSlashCommands")}
          description={t("settings.commands.locusSlashDescription")}
        />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {BUILTIN_SLASH_COMMANDS.map((command) => (
            <div
              key={command.id}
              className="min-w-0 rounded-md bg-muted/50 px-3 py-2"
            >
              <p className="truncate font-mono text-xs text-foreground">
                {command.command}
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {getBuiltinCommandDescription(command.name, t, command.description)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          icon={FileText}
          title={t("settings.commands.localCommandFiles")}
          description={
            projectPath
              ? t("settings.commands.projectScope", {
                  project: selectedProject?.name || t("common.project"),
                })
              : t("settings.commands.noProjectScope")
          }
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={() => setCommandEditor({ mode: "create" })}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("settings.commands.newCommand")}
            </Button>
          }
        />
        <CommandFileList
          commands={userAndProjectCommands}
          onEdit={(command) => setCommandEditor({ mode: "edit", command })}
          onDelete={setDeletingCommand}
        />
      </section>

      <Collapsible
        open={showAdvancedReferences}
        onOpenChange={setShowAdvancedReferences}
        className="space-y-4"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                !showAdvancedReferences && "-rotate-90",
              )}
            />
            {showAdvancedReferences
              ? t("settings.commands.hideAdvancedReferences")
              : t("settings.commands.showAdvancedReferences")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("settings.commands.advancedReferencesDescription")}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <CapabilitySummaryCard
              icon={Terminal}
              title={t("settings.commands.guide.cliTitle")}
              description={t("settings.commands.guide.cliDescription")}
              label={t("settings.commands.referenceOnly")}
              value={runtimeCommandCount}
              countLabel={t("settings.commands.countRuntime")}
            />
            <CapabilitySummaryCard
              icon={Plug}
              title={t("settings.commands.guide.pluginsTitle")}
              description={t("settings.commands.guide.pluginsDescription")}
              label={t("settings.commands.referenceOnly")}
              value={pluginCommandSummary.total}
              countLabel={t("settings.commands.countPlugin")}
            />
          </div>

          <section className="space-y-3">
            <SectionHeader
              icon={Terminal}
              title={t("settings.commands.runtimeCliCommands")}
              description={t("settings.commands.runtimeCliDescription")}
            />
            <div className="grid gap-3 xl:grid-cols-2">
              {runtimeGuideQuery.isLoading ? (
                <EmptyLine>{t("common.loading")}</EmptyLine>
              ) : (
                (runtimeGuideQuery.data ?? []).map((runtime) => (
                  <RuntimePanel key={runtime.runtime} runtime={runtime} />
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              icon={Plug}
              title={t("settings.commands.pluginCommands")}
              description={t("settings.commands.pluginCommandsDescription", {
                total: pluginCommandSummary.total,
                claude: pluginCommandSummary.claude,
                codex: pluginCommandSummary.codex,
              })}
            />
            {pluginCommandSummary.entries.length > 0 ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {pluginCommandSummary.entries.slice(0, 16).map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-start justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-foreground">
                        /{entry.commandName}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {entry.description || entry.pluginName}
                      </p>
                    </div>
                    <SourceBadge
                      label={
                        entry.runtime === "codex"
                          ? t("settings.commands.runtimeCodex")
                          : t("settings.commands.runtimeClaude")
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <CommandFileList
                commands={pluginFileCommands}
                badgeLabel={t("settings.commands.sourcePlugin")}
              />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              icon={BookOpen}
              title={t("settings.commands.officialDocsTitle")}
              description={t("settings.commands.officialDocsDescription")}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <OfficialDocsCard
                title={t("settings.commands.officialClaudeTitle")}
                description={t("settings.commands.officialClaudeDescription")}
                updateNote={t("settings.commands.officialClaudeUpdate")}
                links={[
                  {
                    label: t("settings.commands.officialCliReference"),
                    url: "https://code.claude.com/docs/en/cli-reference",
                  },
                  {
                    label: t("settings.commands.officialCommandsReference"),
                    url: "https://code.claude.com/docs/en/commands",
                  },
                  {
                    label: t("settings.commands.officialDocsIndex"),
                    url: "https://code.claude.com/docs/llms.txt",
                  },
                ]}
              />
              <OfficialDocsCard
                title={t("settings.commands.officialCodexTitle")}
                description={t("settings.commands.officialCodexDescription")}
                updateNote={t("settings.commands.officialCodexUpdate")}
                links={[
                  {
                    label: t("settings.commands.officialCliReference"),
                    url: "https://developers.openai.com/codex/cli/reference",
                  },
                  {
                    label: t("settings.commands.officialSlashCommands"),
                    url: "https://developers.openai.com/codex/cli/slash-commands",
                  },
                  {
                    label: t("settings.commands.officialDocsIndex"),
                    url: "https://developers.openai.com/codex/llms.txt",
                  },
                  {
                    label: t("settings.commands.officialChangelog"),
                    url: "https://developers.openai.com/codex/changelog",
                  },
                ]}
              />
            </div>
            <OfficialSnapshotPanel
              snapshot={officialIndexQuery.data}
              runtimes={runtimeGuideQuery.data}
              isLoading={officialIndexQuery.isLoading}
              isRefreshing={isOfficialIndexRefreshing}
              refreshError={refreshOfficialIndexMutation.error?.message ?? null}
              onRefresh={handleRefreshOfficialIndex}
            />
          </section>
        </CollapsibleContent>
      </Collapsible>

      <CommandEditorDialog
        editor={commandEditor}
        hasProject={!!projectPath}
        projectName={selectedProject?.name}
        isSaving={isCommandMutationPending}
        onOpenChange={(open) => {
          if (!open) setCommandEditor(null)
        }}
        onSubmit={handleSubmitCommand}
      />

      <AlertDialog
        open={!!deletingCommand}
        onOpenChange={(open) => {
          if (!open) setDeletingCommand(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.commands.deleteCommandTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.commands.deleteCommandDescription", {
                name: deletingCommand?.name ? `/${deletingCommand.name}` : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCommandMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCommand}
              disabled={deleteCommandMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteCommandMutation.isPending
                ? t("common.deleting")
                : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
