import type {
  PluginManageTabId,
  PluginResourceRouteActionId,
  PluginResourceRouteKind,
} from "./plugin-route-state"

export type PluginLogoId =
  | "actively"
  | "apollo"
  | "calendar"
  | "chrome"
  | "codex-labs"
  | "cursor"
  | "docs"
  | "drive"
  | "figma"
  | "github"
  | "gmail"
  | "hubspot"
  | "huggingface"
  | "linear"
  | "notion"
  | "plugin-grid"
  | "plugin-store"
  | "purple-dots"
  | "record-replay"
  | "salesforce"
  | "sheets"
  | "skill"
  | "slack"
  | "slides"
  | "striped"

export type CatalogPlugin = {
  id: string
  logo: PluginLogoId
  titleKey: string
  descriptionKey: string
}

export type CatalogPluginDetail = {
  developer: string
  apps: string[]
  skills: string[]
  mcps: string[]
  capabilities: string[]
  promptKey: string
  category?: string
  componentDescriptions?: {
    apps?: Record<string, string>
    skills?: Record<string, string>
    mcps?: Record<string, string>
  }
  longDescriptionKey?: string
  promptExampleKeys?: string[]
  termsOfService?: string
  version?: string
  website?: string
  privacyPolicy?: string
}

export type RuntimePluginComponent = {
  name: string
  description?: string
}

export type RuntimePluginData = {
  name: string
  version: string
  description?: string
  path: string
  source: string
  marketplace: string
  category?: string
  homepage?: string
  tags?: string[]
  isDisabled: boolean
  components: {
    commands: RuntimePluginComponent[]
    skills: RuntimePluginComponent[]
    agents: RuntimePluginComponent[]
    mcpServers: string[]
  }
}

export type RuntimeSkillData = {
  name: string
  description: string
  source: "moss" | "user" | "project" | "plugin"
  pluginName?: string
  path: string
  content: string
}

export type ConnectedPlugin = {
  id: string
  logo: PluginLogoId
  label: string
}

export type ManagedResourceKind = PluginResourceRouteKind
export type ManagedResourceActionId = PluginResourceRouteActionId
export type ManagedResourceConnectionState =
  | "connected"
  | "enabled"
  | "disabled"
  | "needs-auth"
  | "pending"
  | "recommended"
  | "unavailable"

export type ManagedResource = {
  id: string
  kind: ManagedResourceKind
  actionId: ManagedResourceActionId
  connectionState: ManagedResourceConnectionState
  logo: PluginLogoId
  title: string
  descriptionKey: string
  statusKey: string
  actionKey: string
  capabilityIds?: string[]
  connectorId?: string
  mcpServerName?: string
  promptKey?: string
  targetId?: string
}

export type PluginManageTab = {
  id: PluginManageTabId
  labelKey: string
  count: number
}

export type PluginOnboardingRoleId = "developer" | "operator" | "researcher"

type PluginOnboardingRoleDefinition = {
  id: PluginOnboardingRoleId
  titleKey: string
  descriptionKey: string
  starterPromptKey: string
  resourceIds: string[]
  catalogPluginIds: string[]
}

export type PluginOnboardingRoleSuggestion = PluginOnboardingRoleDefinition & {
  resources: ManagedResource[]
  catalogPlugins: CatalogPlugin[]
}

export const CONNECTED_PLUGINS: ConnectedPlugin[] = [
  { id: "docs", logo: "docs", label: "Google Docs" },
  { id: "sheets", logo: "sheets", label: "Google Sheets" },
  { id: "slides", logo: "slides", label: "Google Slides" },
  { id: "cursor", logo: "cursor", label: "Cursor" },
  { id: "chrome", logo: "chrome", label: "Chrome" },
  { id: "codex-labs", logo: "codex-labs", label: "Codex Labs" },
  { id: "record-and-replay", logo: "record-replay", label: "Record & Replay" },
  { id: "purple-dots", logo: "purple-dots", label: "Research" },
  { id: "linear", logo: "linear", label: "Linear" },
  { id: "gmail", logo: "gmail", label: "Gmail" },
  { id: "huggingface", logo: "huggingface", label: "Hugging Face" },
  { id: "plugin-store", logo: "plugin-store", label: "Plugin Store" },
  { id: "striped", logo: "striped", label: "Raycast" },
  { id: "plugin-grid", logo: "plugin-grid", label: "Workflows" },
]

export const FEATURED_PLUGINS: CatalogPlugin[] = [
  {
    id: "github",
    logo: "github",
    titleKey: "pluginsPage.catalog.github.title",
    descriptionKey: "pluginsPage.catalog.github.description",
  },
  {
    id: "slack",
    logo: "slack",
    titleKey: "pluginsPage.catalog.slack.title",
    descriptionKey: "pluginsPage.catalog.slack.description",
  },
  {
    id: "notion",
    logo: "notion",
    titleKey: "pluginsPage.catalog.notion.title",
    descriptionKey: "pluginsPage.catalog.notion.description",
  },
  {
    id: "google-calendar",
    logo: "calendar",
    titleKey: "pluginsPage.catalog.googleCalendar.title",
    descriptionKey: "pluginsPage.catalog.googleCalendar.description",
  },
  {
    id: "drive",
    logo: "drive",
    titleKey: "pluginsPage.catalog.googleDrive.title",
    descriptionKey: "pluginsPage.catalog.googleDrive.description",
  },
]

export const PRODUCTIVITY_PLUGINS: CatalogPlugin[] = [
  {
    id: "record-and-replay",
    logo: "record-replay",
    titleKey: "pluginsPage.catalog.recordReplay.title",
    descriptionKey: "pluginsPage.catalog.recordReplay.description",
  },
]

export const BUSINESS_PLUGINS: CatalogPlugin[] = [
  {
    id: "actively",
    logo: "actively",
    titleKey: "pluginsPage.catalog.actively.title",
    descriptionKey: "pluginsPage.catalog.actively.description",
  },
  {
    id: "apollo",
    logo: "apollo",
    titleKey: "pluginsPage.catalog.apollo.title",
    descriptionKey: "pluginsPage.catalog.apollo.description",
  },
  {
    id: "salesforce",
    logo: "salesforce",
    titleKey: "pluginsPage.catalog.salesforce.title",
    descriptionKey: "pluginsPage.catalog.salesforce.description",
  },
  {
    id: "hubspot",
    logo: "hubspot",
    titleKey: "pluginsPage.catalog.hubspot.title",
    descriptionKey: "pluginsPage.catalog.hubspot.description",
  },
]

export const MARKETPLACE_PLUGINS = [
  ...FEATURED_PLUGINS,
  ...PRODUCTIVITY_PLUGINS,
  ...BUSINESS_PLUGINS,
]

export const CATALOG_PLUGIN_DETAILS: Record<string, CatalogPluginDetail> = {
  github: {
    developer: "OpenAI",
    apps: ["GitHub"],
    skills: ["GitHub Fix CI", "GitHub", "Review Follow-up", "Publish Changes"],
    mcps: ["GitHub"],
    capabilities: ["Interactive", "Write"],
    category: "Developer Tools",
    componentDescriptions: {
      apps: {
        GitHub:
          "Access repositories, issues, and pull requests. Required for some features such as Codex",
      },
      skills: {
        "GitHub Fix CI": "Debug failing GitHub Actions CI",
        GitHub:
          "Interact with GitHub using the `gh` CLI. Use `gh issue`, `gh pr`, `gh run`, and `gh api` for issues, PRs, CI runs, and advanced queries.",
        "Review Follow-up": "Address actionable PR feedback",
        "Publish Changes": "Commit, push, and open a PR",
      },
    },
    longDescriptionKey: "pluginsPage.catalog.github.longDescription",
    promptKey: "pluginsPage.catalog.github.prompt",
    promptExampleKeys: ["pluginsPage.catalog.github.promptExample"],
    privacyPolicy: "https://openai.com/policies/privacy-policy",
    termsOfService: "https://openai.com/policies/terms-of-use",
    website: "https://github.com",
  },
  slack: {
    developer: "OpenAI",
    apps: ["Slack"],
    skills: ["Messages"],
    mcps: ["Slack"],
    capabilities: ["Channels", "Threads", "Team context"],
    promptKey: "pluginsPage.catalog.slack.prompt",
  },
  notion: {
    developer: "OpenAI",
    apps: ["Notion"],
    skills: ["Knowledge capture"],
    mcps: ["Notion"],
    capabilities: ["Docs", "Databases", "Meeting notes"],
    promptKey: "pluginsPage.catalog.notion.prompt",
  },
  "google-calendar": {
    developer: "OpenAI",
    apps: ["Google Calendar"],
    skills: ["Scheduling"],
    mcps: ["Calendar"],
    capabilities: ["Events", "Availability", "Meeting prep"],
    promptKey: "pluginsPage.catalog.googleCalendar.prompt",
  },
  drive: {
    developer: "OpenAI",
    apps: ["Google Drive", "Docs", "Sheets", "Slides"],
    skills: ["Documents"],
    mcps: ["Drive"],
    capabilities: ["Files", "Docs", "Sheets", "Slides"],
    promptKey: "pluginsPage.catalog.googleDrive.prompt",
  },
  "record-and-replay": {
    developer: "OpenAI",
    apps: [],
    skills: ["Record and Replay"],
    mcps: ["Event-stream"],
    capabilities: ["Interactive", "Write"],
    category: "Productivity",
    componentDescriptions: {
      skills: {
        "Record and Replay":
          "Record the user's actions on their Mac with Record & Replay, and turn it into a reusable Codex skill from the captured event stream.",
      },
    },
    longDescriptionKey: "pluginsPage.catalog.recordReplay.longDescription",
    promptKey: "pluginsPage.catalog.recordReplay.prompt",
    promptExampleKeys: [
      "pluginsPage.catalog.recordReplay.promptExample.workflow",
      "pluginsPage.catalog.recordReplay.promptExample.task",
      "pluginsPage.catalog.recordReplay.promptExample.fileExpense",
    ],
    privacyPolicy: "https://openai.com/policies/row-privacy-policy/",
    termsOfService: "https://openai.com/policies/row-terms-of-use/",
    version: "1.0.857",
    website: "https://openai.com/",
  },
  actively: {
    developer: "OpenAI",
    apps: ["Actively"],
    skills: ["Account research"],
    mcps: ["Actively"],
    capabilities: ["Prospects", "Signals", "Account context"],
    promptKey: "pluginsPage.catalog.actively.prompt",
  },
  apollo: {
    developer: "OpenAI",
    apps: ["Apollo"],
    skills: ["Sales research"],
    mcps: ["Apollo"],
    capabilities: ["Leads", "Companies", "Engagement"],
    promptKey: "pluginsPage.catalog.apollo.prompt",
  },
  salesforce: {
    developer: "OpenAI",
    apps: ["Salesforce"],
    skills: ["CRM"],
    mcps: ["Salesforce"],
    capabilities: ["Accounts", "Opportunities", "Records"],
    promptKey: "pluginsPage.catalog.salesforce.prompt",
  },
  hubspot: {
    developer: "OpenAI",
    apps: ["HubSpot"],
    skills: ["CRM"],
    mcps: ["HubSpot"],
    capabilities: ["Contacts", "Deals", "Notes"],
    promptKey: "pluginsPage.catalog.hubspot.prompt",
  },
}

export const MANAGED_APPS: ManagedResource[] = [
  {
    id: "google-drive",
    kind: "app",
    actionId: "manage",
    connectionState: "connected",
    connectorId: "google-drive",
    logo: "drive",
    title: "Google Drive",
    descriptionKey: "pluginsPage.manage.apps.drive.description",
    statusKey: "pluginsPage.status.connected",
    actionKey: "pluginsPage.manage",
  },
  {
    id: "gmail",
    kind: "app",
    actionId: "manage",
    connectionState: "connected",
    connectorId: "gmail",
    logo: "gmail",
    title: "Gmail",
    descriptionKey: "pluginsPage.manage.apps.gmail.description",
    statusKey: "pluginsPage.status.connected",
    actionKey: "pluginsPage.manage",
  },
  {
    id: "google-calendar",
    kind: "app",
    actionId: "manage",
    connectionState: "connected",
    connectorId: "google-calendar",
    logo: "calendar",
    title: "Google Calendar",
    descriptionKey: "pluginsPage.manage.apps.calendar.description",
    statusKey: "pluginsPage.status.connected",
    actionKey: "pluginsPage.manage",
  },
  {
    id: "chrome",
    kind: "app",
    actionId: "manage",
    connectionState: "enabled",
    connectorId: "chrome",
    logo: "chrome",
    title: "Chrome",
    descriptionKey: "pluginsPage.manage.apps.chrome.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.manage",
  },
]

export const MANAGED_MCPS: ManagedResource[] = [
  {
    id: "github-mcp",
    kind: "mcp",
    actionId: "open-mcp-capability",
    connectionState: "enabled",
    capabilityIds: ["pull-requests", "issues", "ci", "releases"],
    logo: "github",
    mcpServerName: "GitHub",
    title: "GitHub",
    descriptionKey: "pluginsPage.manage.mcps.github.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.manage",
  },
  {
    id: "linear-mcp",
    kind: "mcp",
    actionId: "open-mcp-capability",
    connectionState: "enabled",
    capabilityIds: ["issues", "projects", "cycles"],
    logo: "linear",
    mcpServerName: "Linear",
    title: "Linear",
    descriptionKey: "pluginsPage.manage.mcps.linear.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.manage",
  },
  {
    id: "slack-mcp",
    kind: "mcp",
    actionId: "open-mcp-capability",
    connectionState: "enabled",
    capabilityIds: ["channels", "threads", "messages"],
    logo: "slack",
    mcpServerName: "Slack",
    title: "Slack",
    descriptionKey: "pluginsPage.manage.mcps.slack.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.manage",
  },
  {
    id: "notion-mcp",
    kind: "mcp",
    actionId: "connect-oauth",
    connectionState: "needs-auth",
    capabilityIds: ["docs", "databases"],
    logo: "notion",
    mcpServerName: "Notion",
    title: "Notion",
    descriptionKey: "pluginsPage.manage.mcps.notion.description",
    statusKey: "pluginsPage.status.disabled",
    actionKey: "pluginsPage.add",
  },
]

export const MANAGED_SKILLS: ManagedResource[] = [
  {
    id: "docs-skill",
    kind: "managed-skill",
    actionId: "try-in-chat",
    connectionState: "enabled",
    logo: "docs",
    title: "Documents",
    descriptionKey: "pluginsPage.manage.skills.documents.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.skills.try",
    promptKey: "pluginsPage.skills.documents.prompt",
  },
  {
    id: "research-skill",
    kind: "managed-skill",
    actionId: "try-in-chat",
    connectionState: "enabled",
    logo: "purple-dots",
    title: "Research",
    descriptionKey: "pluginsPage.manage.skills.research.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.skills.try",
    promptKey: "pluginsPage.skills.research.prompt",
  },
  {
    id: "workflow-skill",
    kind: "managed-skill",
    actionId: "try-in-chat",
    connectionState: "enabled",
    logo: "plugin-grid",
    title: "Workflows",
    descriptionKey: "pluginsPage.manage.skills.workflows.description",
    statusKey: "pluginsPage.status.enabled",
    actionKey: "pluginsPage.skills.try",
    promptKey: "pluginsPage.skills.workflows.prompt",
  },
]

export const RECOMMENDED_SKILLS: ManagedResource[] = [
  {
    id: "browser-qa",
    kind: "recommended-skill",
    actionId: "install-skill",
    connectionState: "recommended",
    logo: "chrome",
    title: "Browser QA",
    descriptionKey: "pluginsPage.skills.recommended.browserQa.description",
    statusKey: "pluginsPage.skills.status.recommended",
    actionKey: "pluginsPage.skills.install",
  },
  {
    id: "github-ops",
    kind: "recommended-skill",
    actionId: "install-skill",
    connectionState: "recommended",
    logo: "github",
    title: "GitHub Ops",
    descriptionKey: "pluginsPage.skills.recommended.githubOps.description",
    statusKey: "pluginsPage.skills.status.recommended",
    actionKey: "pluginsPage.skills.install",
  },
  {
    id: "data-analytics",
    kind: "recommended-skill",
    actionId: "install-skill",
    connectionState: "recommended",
    logo: "plugin-store",
    title: "Data Analytics",
    descriptionKey: "pluginsPage.skills.recommended.dataAnalytics.description",
    statusKey: "pluginsPage.skills.status.recommended",
    actionKey: "pluginsPage.skills.install",
  },
]

export const PLUGIN_ONBOARDING_ROLE_DEFINITIONS: PluginOnboardingRoleDefinition[] = [
  {
    id: "developer",
    titleKey: "pluginsPage.onboarding.roles.developer.title",
    descriptionKey: "pluginsPage.onboarding.roles.developer.description",
    starterPromptKey: "pluginsPage.onboarding.roles.developer.prompt",
    resourceIds: ["github-mcp", "browser-qa", "github-ops", "chrome"],
    catalogPluginIds: ["github"],
  },
  {
    id: "operator",
    titleKey: "pluginsPage.onboarding.roles.operator.title",
    descriptionKey: "pluginsPage.onboarding.roles.operator.description",
    starterPromptKey: "pluginsPage.onboarding.roles.operator.prompt",
    resourceIds: ["gmail", "google-calendar", "slack-mcp", "workflow-skill"],
    catalogPluginIds: ["slack", "google-calendar"],
  },
  {
    id: "researcher",
    titleKey: "pluginsPage.onboarding.roles.researcher.title",
    descriptionKey: "pluginsPage.onboarding.roles.researcher.description",
    starterPromptKey: "pluginsPage.onboarding.roles.researcher.prompt",
    resourceIds: ["google-drive", "notion-mcp", "research-skill", "data-analytics"],
    catalogPluginIds: ["drive", "notion"],
  },
]

export const PLUGIN_MANAGE_TABS: PluginManageTab[] = [
  {
    id: "plugins",
    labelKey: "pluginsPage.manage.tabs.plugins",
    count: CONNECTED_PLUGINS.length,
  },
  {
    id: "apps",
    labelKey: "pluginsPage.manage.tabs.apps",
    count: MANAGED_APPS.length,
  },
  {
    id: "mcps",
    labelKey: "pluginsPage.manage.tabs.mcps",
    count: MANAGED_MCPS.length,
  },
  {
    id: "skills",
    labelKey: "pluginsPage.manage.tabs.skills",
    count: MANAGED_SKILLS.length,
  },
  {
    id: "marketplace",
    labelKey: "pluginsPage.manage.tabs.marketplace",
    count: MARKETPLACE_PLUGINS.length,
  },
]

export function findCatalogPluginById(pluginId: string) {
  return MARKETPLACE_PLUGINS.find((plugin) => plugin.id === pluginId)
}

export function normalizePluginHandle(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function formatRuntimeLabel(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function uniqueNonEmpty(items: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const value = item?.trim()
    if (!value) continue

    const key = value.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push(value)
  }

  return result
}

export function getCatalogPluginRuntimeAliases(plugin: CatalogPlugin) {
  if (plugin.id === "drive") return ["drive", "google-drive"]
  if (plugin.id === "google-calendar") return ["google-calendar", "calendar"]
  if (plugin.id === "record-and-replay") {
    return ["record-and-replay", "record-replay"]
  }

  return [plugin.id]
}

export function findRuntimePluginForCatalog(
  plugin: CatalogPlugin,
  runtimePlugins: RuntimePluginData[],
) {
  const aliases = new Set(
    getCatalogPluginRuntimeAliases(plugin).map(normalizePluginHandle),
  )

  return (
    runtimePlugins.find((runtimePlugin) => {
      const sourceName = runtimePlugin.source.split(":").pop() ?? runtimePlugin.source
      const pathName = runtimePlugin.path.split("/").pop() ?? runtimePlugin.path
      const candidates = uniqueNonEmpty([
        runtimePlugin.name,
        runtimePlugin.source,
        sourceName,
        pathName,
        runtimePlugin.category,
        runtimePlugin.homepage,
        ...(runtimePlugin.tags ?? []),
      ]).map(normalizePluginHandle)

      return candidates.some((candidate) => aliases.has(candidate))
    }) ?? null
  )
}

export function getCatalogPluginDetail(
  plugin: CatalogPlugin,
  runtimePlugin?: RuntimePluginData | null,
) {
  const detail = CATALOG_PLUGIN_DETAILS[plugin.id]
  if (!runtimePlugin) return detail
  const runtimeApps =
    detail.apps.length > 0 ? [...detail.apps, runtimePlugin.name] : detail.apps
  const runtimeCategoryCapability =
    detail.category == null && runtimePlugin.category
      ? formatRuntimeLabel(runtimePlugin.category)
      : null

  return {
    ...detail,
    apps: uniqueNonEmpty(runtimeApps),
    skills: uniqueNonEmpty([
      ...detail.skills,
      ...runtimePlugin.components.skills.map((skill) => skill.name),
      ...runtimePlugin.components.commands.map((command) => command.name),
    ]),
    mcps: uniqueNonEmpty([
      ...detail.mcps,
      ...runtimePlugin.components.mcpServers,
    ]),
    capabilities: uniqueNonEmpty([
      ...detail.capabilities,
      runtimeCategoryCapability,
      ...runtimePlugin.components.agents.map((agent) => agent.name),
    ]),
  }
}

export function getRuntimePluginResourceCount(
  runtimePlugin: RuntimePluginData,
) {
  return (
    runtimePlugin.components.commands.length +
    runtimePlugin.components.skills.length +
    runtimePlugin.components.agents.length +
    runtimePlugin.components.mcpServers.length
  )
}

export function getRuntimeSkillLogo(
  skill: RuntimeSkillData,
  catalogPlugin?: CatalogPlugin | null,
): PluginLogoId {
  if (catalogPlugin) return catalogPlugin.logo
  if (skill.source === "moss") return "codex-labs"
  if (skill.source === "project") return "docs"
  if (skill.source === "user") return "purple-dots"
  return "plugin-store"
}

export function getManagedResourcesForTab(tab: PluginManageTabId) {
  if (tab === "apps") return MANAGED_APPS
  if (tab === "mcps") return MANAGED_MCPS
  if (tab === "skills") return MANAGED_SKILLS
  return []
}

export function getManagedResourceRouteTarget(resource: ManagedResource) {
  return (
    resource.targetId ??
    resource.connectorId ??
    resource.mcpServerName ??
    resource.promptKey ??
    resource.id
  )
}

export function canRunManagedResourceAction(resource: ManagedResource) {
  return resource.actionId !== "unavailable"
}

export function buildPluginOnboardingSuggestions(): PluginOnboardingRoleSuggestion[] {
  const resourceById = new Map(
    [
      ...MANAGED_APPS,
      ...MANAGED_MCPS,
      ...MANAGED_SKILLS,
      ...RECOMMENDED_SKILLS,
    ].map((resource) => [resource.id, resource]),
  )

  return PLUGIN_ONBOARDING_ROLE_DEFINITIONS.map((definition) => ({
    ...definition,
    resourceIds: [...definition.resourceIds],
    catalogPluginIds: [...definition.catalogPluginIds],
    resources: definition.resourceIds
      .map((resourceId) => resourceById.get(resourceId))
      .filter((resource): resource is ManagedResource => Boolean(resource)),
    catalogPlugins: definition.catalogPluginIds
      .map(findCatalogPluginById)
      .filter((plugin): plugin is CatalogPlugin => Boolean(plugin)),
  }))
}

export function getPluginManageTabs({
  runtimePluginCount,
  runtimeSkillCount,
}: {
  runtimePluginCount: number
  runtimeSkillCount: number
}) {
  return PLUGIN_MANAGE_TABS.map((tab) => {
    if (tab.id === "plugins") {
      return {
        ...tab,
        count: runtimePluginCount || CONNECTED_PLUGINS.length,
      }
    }

    if (tab.id === "skills") {
      return {
        ...tab,
        count: runtimeSkillCount || MANAGED_SKILLS.length,
      }
    }

    return tab
  })
}
