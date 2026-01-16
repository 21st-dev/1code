import { useState, useEffect } from "react"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "../../../lib/utils"
import { AnthropicOAuthProviderCard } from "../../oauth/anthropic-oauth-provider-card"

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

export function AgentsProviderTab() {
  const isNarrowScreen = useIsNarrowScreen()

  // Get the query client to invalidate queries
  const utils = trpc.useContext()

  // Queries and mutations
  const { data: providers, isLoading, refetch } = trpc.providers.list.useQuery()

  const setActiveMutation = trpc.providers.setActive.useMutation({
    onSuccess: () => {
      refetch()
      // Invalidate the getActive query so chat interface picks up the change
      utils.providers.getActive.invalidate()
    },
  })

  const deleteMutation = trpc.providers.delete.useMutation({
    onSuccess: () => {
      refetch()
    },
    onError: (err) => {
      alert(err.message)
    },
  })

  const createMutation = trpc.providers.createAPIKeyProvider.useMutation({
    onSuccess: () => {
      resetForm()
      refetch()
    },
    onError: (err) => {
      alert(err.message)
    },
  })

  // Form state
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    model: "",
    apiKey: "",
    baseUrl: "",
  })

  const resetForm = () => {
    setFormData({ name: "", model: "", apiKey: "", baseUrl: "" })
    setIsCreating(false)
  }

  const handleCreate = () => {
    if (!formData.name || !formData.model || !formData.apiKey || !formData.baseUrl) {
      alert("Please fill in all fields")
      return
    }

    createMutation.mutate({
      name: formData.name,
      model: formData.model,
      apiKey: formData.apiKey,
      baseUrl: formData.baseUrl,
    })
  }

  const handleSetActive = (id: string) => {
    setActiveMutation.mutate({ id })
  }

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this provider?")) {
      deleteMutation.mutate({ id })
    }
  }

  return (
    <div className="p-6 space-y-6">
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">AI Provider</h3>
          <p className="text-xs text-muted-foreground">
            Configure and manage AI service providers
          </p>
        </div>
      )}

      {/* Anthropic OAuth Provider */}
      <AnthropicOAuthProviderCard />

      {/* API Key Providers */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              Loading providers...
            </div>
          ) : providers && providers.length > 0 ? (
            providers.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  provider.isActive && "border-primary bg-primary/5"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{provider.name}</span>
                    {provider.isActive && (
                      <span className="text-xs text-primary shrink-0">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Model: {provider.model}
                    {provider.baseUrl && ` | ${provider.baseUrl}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {!provider.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetActive(provider.id)}
                      disabled={setActiveMutation.isPending}
                    >
                      Use
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(provider.id)}
                    disabled={provider.isActive || deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-sm text-muted-foreground py-4">
              No providers configured. Add one below.
            </div>
          )}

          {isCreating && (
            <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
              <div>
                <Label className="text-xs">Provider Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., glm 4.7"
                  className="mt-1"
                  disabled={createMutation.isPending}
                />
              </div>
              <div>
                <Label className="text-xs">Model Name</Label>
                <Input
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g., glm-4.7"
                  className="mt-1"
                  disabled={createMutation.isPending}
                />
              </div>
              <div>
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="sk-ant-..."
                  className="mt-1"
                  disabled={createMutation.isPending}
                />
              </div>
              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/api/anthropic"
                  className="mt-1"
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetForm}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          )}

          {!isCreating && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setIsCreating(true)}
              disabled={createMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          <strong>Note:</strong> Each provider uses Anthropic-compatible API format.
          For custom endpoints like glm 4.7 or Minimax 2.1, enter the full base URL
          (e.g., https://api.z.ai/api/anthropic).
        </p>
      </div>
    </div>
  )
}
