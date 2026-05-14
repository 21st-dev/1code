"use client"

import { memo, useDeferredValue, useMemo } from "react"

import { CustomAgentIcon, SkillIcon } from "../../../components/ui/icons"
import { useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { MENTION_PREFIXES, type FileMentionOption } from "../mentions"

type RecommendationKind = "skill" | "agent"

type Recommendation = {
  id: string
  kind: RecommendationKind
  name: string
  description: string
  source?: "user" | "project" | "plugin" | "registry"
  mention: FileMentionOption
  score: number
}

type AgentContextRecommendationsProps = {
  draftText: string
  projectPath?: string
  isSuppressed?: boolean
  maxItems?: number
  className?: string
  onSelect: (mention: FileMentionOption) => void
}

const MIN_DRAFT_LENGTH = 8
const DEFAULT_MAX_ITEMS = 4

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "check",
  "code",
  "does",
  "for",
  "from",
  "get",
  "has",
  "have",
  "help",
  "how",
  "into",
  "make",
  "need",
  "please",
  "repo",
  "should",
  "task",
  "that",
  "the",
  "this",
  "use",
  "want",
  "what",
  "when",
  "with",
])

const CONCEPT_ALIASES: Array<{ triggers: string[]; terms: string[] }> = [
  {
    triggers: ["security", "secure", "secret", "token", "auth", "credential", "安全", "权限", "密钥", "隐私"],
    terms: ["security", "secure", "threat", "risk", "auth", "secret", "token", "credential"],
  },
  {
    triggers: ["review", "audit", "inspect", "检查", "审查", "评审", "代码检查"],
    terms: ["review", "audit", "inspect"],
  },
  {
    triggers: ["test", "verify", "validation", "smoke", "测试", "验证", "跑一下"],
    terms: ["test", "verify", "verification", "validation", "smoke"],
  },
  {
    triggers: ["debug", "bug", "broken", "fix", "error", "报错", "修复", "调试", "坏了"],
    terms: ["debug", "bug", "fix", "error", "systematic"],
  },
  {
    triggers: ["plan", "proposal", "spec", "roadmap", "计划", "规划", "方案", "提案"],
    terms: ["plan", "planning", "proposal", "spec", "workflow"],
  },
  {
    triggers: ["react", "component", "rerender", "tsx", "组件", "前端"],
    terms: ["react", "component", "rerender", "tsx", "frontend"],
  },
  {
    triggers: ["ui", "ux", "design", "interface", "界面", "视觉", "样式"],
    terms: ["ui", "ux", "design", "interface"],
  },
  {
    triggers: ["performance", "optimize", "slow", "perf", "性能", "优化", "卡"],
    terms: ["performance", "optimize", "slow", "perf"],
  },
  {
    triggers: ["next", "nextjs", "next.js", "route", "app router"],
    terms: ["next", "nextjs", "next.js", "route", "router"],
  },
  {
    triggers: ["postgres", "sql", "database", "db", "数据库", "查询"],
    terms: ["postgres", "postgresql", "sql", "database", "query"],
  },
  {
    triggers: ["mcp", "server", "tool", "tools"],
    terms: ["mcp", "server", "tool", "tools"],
  },
  {
    triggers: ["changelog", "release notes", "更新日志", "发布说明"],
    terms: ["changelog", "release", "notes"],
  },
]

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[_/\\.-]+/g, " ")
}

function hasMeaningfulDraft(value: string) {
  const trimmed = value.replace(/@\[(skill|agent):[^\]]+\]/g, "").trim()
  return trimmed.length >= MIN_DRAFT_LENGTH || /[\u4e00-\u9fff]{2,}/.test(trimmed)
}

function extractMentionedIds(value: string) {
  const mentioned = new Set<string>()
  const mentionRegex = /@\[(skill|agent):([^\]]+)\]/g
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(value)) !== null) {
    mentioned.add(`${match[1]}:${match[2].toLowerCase()}`)
  }

  return mentioned
}

function extractQueryTerms(value: string) {
  const normalized = normalizeText(value)
  const words = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []
  const terms = new Set(
    words.filter((word) => !STOP_WORDS.has(word)),
  )

  for (const concept of CONCEPT_ALIASES) {
    if (concept.triggers.some((trigger) => normalized.includes(trigger))) {
      concept.terms.forEach((term) => terms.add(term))
    }
  }

  return {
    normalized,
    terms: Array.from(terms),
  }
}

function scoreRecommendation(
  draft: ReturnType<typeof extractQueryTerms>,
  recommendation: Omit<Recommendation, "score">,
) {
  const normalizedName = normalizeText(recommendation.name)
  const normalizedDescription = normalizeText(recommendation.description)
  const normalizedTools = normalizeText(recommendation.mention.tools?.join(" ") ?? "")
  let score = 0
  let matchedTerms = 0

  if (normalizedName.length > 2 && draft.normalized.includes(normalizedName)) {
    score += 30
    matchedTerms += 1
  }

  for (const term of draft.terms) {
    if (normalizedName.includes(term)) {
      score += 10
      matchedTerms += 1
    } else if (normalizedDescription.includes(term)) {
      score += 5
      matchedTerms += 1
    } else if (normalizedTools.includes(term)) {
      score += 4
      matchedTerms += 1
    }
  }

  if (matchedTerms === 0) return 0
  if (matchedTerms > 1) score += Math.min(matchedTerms * 2, 8)
  if (recommendation.source === "project") score += 4

  return score
}

export const AgentContextRecommendations = memo(function AgentContextRecommendations({
  draftText,
  projectPath,
  isSuppressed = false,
  maxItems = DEFAULT_MAX_ITEMS,
  className,
  onSelect,
}: AgentContextRecommendationsProps) {
  const { t } = useI18n()
  const deferredDraftText = useDeferredValue(draftText)
  const shouldQuery = !isSuppressed && hasMeaningfulDraft(deferredDraftText)

  const { data: skills = [] } = trpc.skills.listEnabled.useQuery(
    projectPath ? { cwd: projectPath } : undefined,
    {
      enabled: shouldQuery,
      staleTime: 5 * 60 * 1000,
    },
  )
  const { data: agents = [] } = trpc.agents.listEnabled.useQuery(
    projectPath ? { cwd: projectPath } : undefined,
    {
      enabled: shouldQuery,
      staleTime: 5 * 60 * 1000,
    },
  )

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!shouldQuery) return []

    const mentioned = extractMentionedIds(deferredDraftText)
    const draft = extractQueryTerms(deferredDraftText)
    if (draft.terms.length === 0) return []

    const candidates: Array<Omit<Recommendation, "score">> = [
      ...skills.map((skill) => ({
        id: `${MENTION_PREFIXES.SKILL}${skill.name}`,
        kind: "skill" as const,
        name: skill.name,
        description: skill.description || "",
        source: skill.source,
        mention: {
          id: `${MENTION_PREFIXES.SKILL}${skill.name}`,
          label: skill.name,
          path: skill.path,
          repository: "",
          truncatedPath: skill.description,
          type: "skill" as const,
          description: skill.description,
          source: skill.source,
        },
      })),
      ...agents.map((agent) => ({
        id: `${MENTION_PREFIXES.AGENT}${agent.name}`,
        kind: "agent" as const,
        name: agent.name,
        description: agent.description || "",
        source: agent.source,
        mention: {
          id: `${MENTION_PREFIXES.AGENT}${agent.name}`,
          label: agent.name,
          path: agent.path,
          repository: "",
          truncatedPath: agent.description,
          type: "agent" as const,
          description: agent.description,
          tools: agent.tools,
          model: agent.model,
          source: agent.source,
        },
      })),
    ].filter((candidate) => !mentioned.has(`${candidate.kind}:${candidate.name.toLowerCase()}`))

    return candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreRecommendation(draft, candidate),
      }))
      .filter((candidate) => candidate.score >= 8)
      .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
      .slice(0, maxItems)
  }, [agents, deferredDraftText, maxItems, shouldQuery, skills])

  if (recommendations.length === 0) return null

  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto px-1 pb-1 text-xs text-muted-foreground [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <span className="shrink-0 px-1 font-medium">
        {t("chat.recommendations.label")}
      </span>
      {recommendations.map((recommendation) => {
        const Icon = recommendation.kind === "skill" ? SkillIcon : CustomAgentIcon
        const typeLabel = t(
          recommendation.kind === "skill"
            ? "chat.recommendations.skill"
            : "chat.recommendations.agent",
        )

        return (
          <button
            key={recommendation.id}
            type="button"
            className={cn(
              "inline-flex h-6 max-w-[180px] shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background/70 px-1.5",
              "text-left transition-colors hover:bg-accent hover:text-foreground",
            )}
            aria-label={t("chat.recommendations.use", {
              type: typeLabel,
              name: recommendation.name,
            })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(recommendation.mention)}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate text-foreground/90">
              {recommendation.name}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {typeLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
})
