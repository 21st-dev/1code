import { useAtom, useSetAtom } from "jotai"
import { MoreHorizontal, Plus, Trash, RefreshCw, Server, Globe, Pencil } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  activeProviderIdAtom,
  lastSelectedModelIdAtom,
  modelProvidersAtom,
  MODEL_ID_MAP,
  openaiApiKeyAtom,
  type ModelProvider,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Textarea } from "../../ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

// Account row component
function AccountRow({
  account,
  isActive,
  onSetActive,
  onRename,
  onRemove,
  isLoading,
}: {
  account: {
    id: string
    displayName: string | null
    email: string | null
    connectedAt: string | null
  }
  isActive: boolean
  onSetActive: () => void
  onRename: () => void
  onRemove: () => void
  isLoading: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-sm font-medium">
            {account.displayName || "Anthropic Account"}
          </div>
          {account.email && (
            <div className="text-xs text-muted-foreground">{account.email}</div>
          )}
          {!account.email && account.connectedAt && (
            <div className="text-xs text-muted-foreground">
              Connected{" "}
              {new Date(account.connectedAt).toLocaleDateString(undefined, {
                dateStyle: "short",
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetActive}
            disabled={isLoading}
          >
            Switch
          </Button>
        )}
        {isActive && (
          <Badge variant="secondary" className="text-xs">
            Active
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onRemove}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// Anthropic accounts section component
function AnthropicAccountsSection() {
  const { data: accounts, isLoading: isAccountsLoading, refetch: refetchList } =
    trpc.anthropicAccounts.list.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: activeAccount, refetch: refetchActive } =
    trpc.anthropicAccounts.getActive.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: claudeCodeIntegration } = trpc.claudeCode.getIntegration.useQuery()
  const trpcUtils = trpc.useUtils()

  // Auto-migrate legacy account if needed
  const migrateLegacy = trpc.anthropicAccounts.migrateLegacy.useMutation({
    onSuccess: async () => {
      await refetchList()
      await refetchActive()
    },
  })

  // Trigger migration if: no accounts, not loading, has legacy connection, not already migrating
  useEffect(() => {
    if (
      !isAccountsLoading &&
      accounts?.length === 0 &&
      claudeCodeIntegration?.isConnected &&
      !migrateLegacy.isPending &&
      !migrateLegacy.isSuccess
    ) {
      migrateLegacy.mutate()
    }
  }, [isAccountsLoading, accounts, claudeCodeIntegration, migrateLegacy])

  const setActiveMutation = trpc.anthropicAccounts.setActive.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account switched")
    },
    onError: (err) => {
      toast.error(`Failed to switch account: ${err.message}`)
    },
  })

  const renameMutation = trpc.anthropicAccounts.rename.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      toast.success("Account renamed")
    },
    onError: (err) => {
      toast.error(`Failed to rename account: ${err.message}`)
    },
  })

  const removeMutation = trpc.anthropicAccounts.remove.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account removed")
    },
    onError: (err) => {
      toast.error(`Failed to remove account: ${err.message}`)
    },
  })

  const handleRename = (accountId: string, currentName: string | null) => {
    const newName = window.prompt(
      "Enter new name for this account:",
      currentName || "Anthropic Account"
    )
    if (newName && newName.trim()) {
      renameMutation.mutate({ accountId, displayName: newName.trim() })
    }
  }

  const handleRemove = (accountId: string, displayName: string | null) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${displayName || "this account"}"? You will need to re-authenticate to use it again.`
    )
    if (confirmed) {
      removeMutation.mutate({ accountId })
    }
  }

  const isLoading =
    setActiveMutation.isPending ||
    renameMutation.isPending ||
    removeMutation.isPending

  // Don't show section if no accounts
  if (!isAccountsLoading && (!accounts || accounts.length === 0)) {
    return null
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
        {isAccountsLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading accounts...
          </div>
        ) : (
          accounts?.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isActive={activeAccount?.id === account.id}
              onSetActive={() => setActiveMutation.mutate({ accountId: account.id })}
              onRename={() => handleRename(account.id, account.displayName)}
              onRemove={() => handleRemove(account.id, account.displayName)}
              isLoading={isLoading}
            />
          ))
        )}
    </div>
  )
}

function ModelProviderDialog({
  provider,
  onSave,
  onClose,
  open,
  onOpenChange,
}: {
  provider?: ModelProvider
  onSave: (provider: ModelProvider) => void
  onClose: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(provider?.name || "")
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || "")
  const [token, setToken] = useState(provider?.token || "")
  const hasStoredToken = Boolean(provider?.token?.startsWith("enc:"))
  const [modelsText, setModelsText] = useState(
    provider?.models?.join("\n") || "",
  )
  const [isFetching, setIsFetching] = useState(false)
  const encryptTokenMutation = trpc.claude.encryptToken.useMutation()
  const fetchModelsMutation = trpc.claude.fetchModels.useMutation()

  const parseModels = (value: string) =>
    value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)

  // Reset state when profile changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(provider?.name || "")
      setBaseUrl(provider?.baseUrl || "")
      const rawToken = provider?.token || ""
      setToken(rawToken.startsWith("enc:") ? "" : rawToken)
      setModelsText(provider?.models?.join("\n") || "")
    }
  }, [open, provider])

  const handleSave = async () => {
    const models = parseModels(modelsText)
    if (!name || !baseUrl || models.length === 0) {
      toast.error("Name, Base URL, and at least one model are required")
      return
    }

    let storedToken = token || ""
    if (!storedToken && provider?.token?.startsWith("enc:")) {
      storedToken = provider.token
    }
    if (storedToken && !storedToken.startsWith("enc:")) {
      try {
        const result = await encryptTokenMutation.mutateAsync({ token: storedToken })
        storedToken = result.encrypted
      } catch (err) {
        console.error("[models] Failed to encrypt token:", err)
        toast.error("Failed to secure API token")
        return
      }
    }

    const newProvider: ModelProvider = {
      id: provider?.id || `provider-${crypto.randomUUID()}`,
      name,
      baseUrl,
      token: storedToken,
      models,
      isOffline: false,
    }

    onSave(newProvider)
    onOpenChange(false)
  }

  const fetchModels = async () => {
    if (!baseUrl) {
      toast.error("Enter a Base URL first")
      return
    }

    setIsFetching(true)

    try {
      const fallbackToken =
        token || (provider?.token?.startsWith("enc:") ? provider.token : "")
      const result = await fetchModelsMutation.mutateAsync({
        baseUrl,
        token: fallbackToken || undefined,
      })
      if (result.models.length > 0) {
        setModelsText(result.models.join("\n"))
        toast.success(`Found ${result.models.length} models`)
      } else {
        if (result.status?.details) {
          console.warn("[models] Discovery details:", result.status.details)
        }
        toast.error(result.status?.reason || "No models returned. Check URL or enter model manually.")
      }
    } catch (err) {
      console.error("[models] Model discovery failed:", err)
      toast.error("Failed to connect to endpoint")
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{provider ? "Edit Provider" : "Add Provider"}</DialogTitle>
          <DialogDescription>
            Configure a custom model provider (e.g. Ollama, LM Studio, vLLM).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Provider Name</Label>
            <Input 
              id="name" 
              placeholder="My Local LLM" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <div className="flex gap-2">
              <Input 
                id="baseUrl" 
                placeholder="http://localhost:11434" 
                value={baseUrl} 
                onChange={(e) => setBaseUrl(e.target.value)} 
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={fetchModels} 
                disabled={isFetching || !baseUrl}
                title="Fetch available models"
              >
                {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">e.g. http://localhost:11434 (Ollama) or http://localhost:1234 (LM Studio)</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="models">Models</Label>
            <Textarea
              id="models"
              placeholder="one model per line"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">Enter one model per line, or fetch from the provider.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="token">API Token (Optional)</Label>
            <Input 
              id="token" 
              type="password" 
              placeholder={hasStoredToken ? "•••• (stored)" : "sk-..."} 
              value={token} 
              onChange={(e) => setToken(e.target.value)} 
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>Cancel</Button>
          <Button onClick={handleSave}>Save Provider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModelProvidersList() {
  const [providers, setProviders] = useAtom(modelProvidersAtom)
  const [activeProviderId, setActiveProviderId] = useAtom(activeProviderIdAtom)
  const setLastSelectedModelId = useSetAtom(lastSelectedModelIdAtom)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ModelProvider | undefined>(undefined)
  const encryptTokenMutation = trpc.claude.encryptToken.useMutation()

  useEffect(() => {
    const needsEncryption = providers.filter(
      (p) => p.token && !p.token.startsWith("enc:"),
    )
    if (needsEncryption.length === 0) return

    let cancelled = false
    const encryptAll = async () => {
      const updates = await Promise.all(
        needsEncryption.map(async (provider) => {
          try {
            const result = await encryptTokenMutation.mutateAsync({
              token: provider.token,
            })
            return {
              ...provider,
              token: result.encrypted,
            }
          } catch (err) {
            console.error("[models] Failed to encrypt stored token:", err)
            return provider
          }
        }),
      )

      if (cancelled) return
      setProviders((current) =>
        current.map((p) => updates.find((u) => u.id === p.id) || p),
      )
    }

    encryptAll()
    return () => {
      cancelled = true
    }
  }, [providers, encryptTokenMutation, setProviders])

  const handleSave = (provider: ModelProvider) => {
    if (editingProvider) {
      setProviders(providers.map(p => p.id === provider.id ? provider : p))
      toast.success("Provider updated")
    } else {
      setProviders([...providers, provider])
      toast.success("Provider added")
    }
    setEditingProvider(undefined)
  }

  const handleEdit = (provider: ModelProvider) => {
    setEditingProvider(provider)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this provider?")) {
      if (activeProviderId === id) {
        setActiveProviderId(null)
        setLastSelectedModelId(MODEL_ID_MAP.opus)
      }
      setProviders(providers.filter(p => p.id !== id))
      toast.success("Provider deleted")
    }
  }

  const handleClose = () => {
    setDialogOpen(false)
    setTimeout(() => setEditingProvider(undefined), 300) // Delay clearing to allow dialog close anim
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Custom Providers</h4>
        <Button size="sm" variant="outline" onClick={() => { setEditingProvider(undefined); setDialogOpen(true); }}>
          <Plus className="h-3 w-3 mr-1" />
          Add Provider
        </Button>
      </div>

      <div className="space-y-2">
        {providers.length === 0 ? (
          <div className="p-4 border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
            No providers configured. Add one to use external models.
          </div>
        ) : (
          <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
            {providers.map(provider => (
              <div key={provider.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {provider.isOffline ? (
                      <div className="h-8 w-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <Server className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded bg-purple-500/10 flex items-center justify-center text-purple-500">
                        <Globe className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {provider.name}
                      {provider.isOffline && <Badge variant="secondary" className="text-[10px] h-4">OFFLINE</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {provider.models.length} model{provider.models.length === 1 ? "" : "s"} • {provider.baseUrl}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(provider)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!provider.isOffline && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => handleDelete(provider.id)}>
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModelProviderDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        provider={editingProvider}
        onSave={handleSave}
        onClose={handleClose}
      />
    </div>
  )
}

export function AgentsModelsTab() {
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // OpenAI API key state
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  const handleClaudeCodeSetup = () => {
    setSettingsOpen(false)
    setAnthropicOnboardingCompleted(false)
  }

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canSaveOpenAI = trimmedOpenAIKey !== storedOpenAIKey
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey === storedOpenAIKey) return // No change
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key saved")
    } catch (err) {
      toast.error("Failed to save OpenAI API key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key removed")
    } catch (err) {
      toast.error("Failed to remove OpenAI API key")
    }
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Configure model overrides and Claude Code authentication
          </p>
        </div>
      )}

      {/* Anthropic Accounts Section */}
      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Anthropic Accounts
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your Claude API accounts
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClaudeCodeSetup}
            disabled={isClaudeCodeLoading}
          >
            <Plus className="h-3 w-3 mr-1" />
            {isClaudeCodeConnected ? "Add" : "Connect"}
          </Button>
        </div>

        <AnthropicAccountsSection />
      </div>

      {/* Custom Providers Section */}
      <ModelProvidersList />

      {/* OpenAI API Key for Voice Input */}
      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">Voice Input</h4>
          {canResetOpenAI && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetOpenAI}
              disabled={setOpenAIKeyMutation.isPending}
              className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
            >
              Remove
            </Button>
          )}
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between gap-6 p-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">OpenAI API Key</Label>
              <p className="text-xs text-muted-foreground">
                Required for voice transcription (Whisper API). Free users need their own key.
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                onBlur={handleSaveOpenAI}
                className="w-full"
                placeholder="sk-..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
