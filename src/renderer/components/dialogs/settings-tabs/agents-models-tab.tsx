import { useAtom, useSetAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  customClaudeConfigAtom,
  generateProfileId,
  useInitializeModelProfiles,
  type CustomClaudeConfig,
  type ModelProfile,
  validateModelProfile,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Badge } from "../../ui/badge"
import { cn } from "../../../lib/utils"
import { Trash2, Plus, Edit2, Save, X, GripVertical } from "lucide-react"

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

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

// Form state for editing/creating a profile
interface ProfileFormState {
  name: string
  description: string
  models: string[]
  baseUrl: string
  token: string
}

const EMPTY_FORM: ProfileFormState = {
  name: "",
  description: "",
  models: [],
  baseUrl: "",
  token: "",
}

export function AgentsModelsTab() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const disconnectClaudeCode = trpc.claudeCode.disconnect.useMutation()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // Profile management state - use the initialized profiles from DB
  const modelProfiles = useInitializeModelProfiles()
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [formState, setFormState] = useState<ProfileFormState>(EMPTY_FORM)
  const [newModelName, setNewModelName] = useState("")

  // tRPC mutations for profile CRUD
  const createProfileMutation = trpc.modelProfiles.create.useMutation()
  const updateProfileMutation = trpc.modelProfiles.update.useMutation()
  const deleteProfileMutation = trpc.modelProfiles.delete.useMutation()

  // Get the profile being edited
  const editingProfile = editingProfileId ? modelProfiles.find((p) => p.id === editingProfileId) : null

  // Initialize form with profile data
  useEffect(() => {
    if (editingProfile) {
      setFormState({
        name: editingProfile.name,
        description: editingProfile.description || "",
        models: editingProfile.models,
        baseUrl: editingProfile.config.baseUrl,
        token: editingProfile.config.token,
      })
    } else if (editingProfileId === null) {
      setFormState(EMPTY_FORM)
    }
  }, [editingProfile, editingProfileId, modelProfiles])

  // Handle legacy config migration
  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
  }, [storedConfig.model, storedConfig.baseUrl, storedConfig.token])

  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)

  const trimmedModel = model.trim()
  const trimmedBaseUrl = baseUrl.trim()
  const trimmedToken = token.trim()
  const canSave = Boolean(trimmedModel && trimmedBaseUrl && trimmedToken)
  const canReset = Boolean(trimmedModel || trimmedBaseUrl || trimmedToken)

  // Form validation
  const formValidation = validateModelProfile({
    name: formState.name,
    models: formState.models,
    config: {
      baseUrl: formState.baseUrl,
      token: formState.token,
      model: formState.models[0] || "",
    },
  })
  const canSaveForm = formValidation.valid

  const handleSaveLegacy = () => {
    if (!canSave) {
      toast.error("Fill model, token, and base URL to save")
      return
    }
    const nextConfig: CustomClaudeConfig = {
      model: trimmedModel,
      token: trimmedToken,
      baseUrl: trimmedBaseUrl,
    }

    setStoredConfig(nextConfig)
    toast.success("Model settings saved")
  }

  const handleResetLegacy = () => {
    setStoredConfig(EMPTY_CONFIG)
    setModel("")
    setBaseUrl("")
    setToken("")
    toast.success("Model settings reset")
  }

  const handleClaudeCodeSetup = () => {
    disconnectClaudeCode.mutate()
    setSettingsOpen(false)
    setAnthropicOnboardingCompleted(false)
  }

  // Profile CRUD operations
  const handleAddProfile = () => {
    setEditingProfileId("new")
    setFormState(EMPTY_FORM)
  }

  const handleEditProfile = (profileId: string) => {
    setEditingProfileId(profileId)
  }

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await deleteProfileMutation.mutateAsync({ id: profileId })
      toast.success("Profile deleted")
    } catch (error) {
      toast.error("Failed to delete profile")
      console.error(error)
    }
  }

  const handleSaveProfile = async () => {
    if (!canSaveForm) {
      toast.error(formValidation.errors[0] || "Please fill all required fields")
      return
    }

    const config = {
      model: formState.models[0] || "",
      token: formState.token.trim(),
      baseUrl: formState.baseUrl.trim(),
    }

    try {
      if (editingProfileId === "new") {
        await createProfileMutation.mutateAsync({
          name: formState.name.trim(),
          description: formState.description.trim() || undefined,
          config,
          models: formState.models,
          isOffline: false,
        })
        toast.success("Profile created")
      } else {
        await updateProfileMutation.mutateAsync({
          id: editingProfileId,
          name: formState.name.trim(),
          description: formState.description.trim() || undefined,
          config,
          models: formState.models,
          isOffline: false,
        })
        toast.success("Profile updated")
      }

      setEditingProfileId(null)
      setFormState(EMPTY_FORM)
    } catch (error) {
      toast.error(editingProfileId === "new" ? "Failed to create profile" : "Failed to update profile")
      console.error(error)
    }
  }

  const handleCancelEdit = () => {
    setEditingProfileId(null)
    setFormState(EMPTY_FORM)
  }

  const handleAddModel = () => {
    const trimmed = newModelName.trim()
    if (trimmed && !formState.models.includes(trimmed)) {
      setFormState((prev) => ({
        ...prev,
        models: [...prev.models, trimmed],
      }))
      setNewModelName("")
    }
  }

  const handleRemoveModel = (modelName: string) => {
    setFormState((prev) => ({
      ...prev,
      models: prev.models.filter((m) => m !== modelName),
    }))
  }

  const handleKeyDownModel = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddModel()
    }
  }

  // Check if we're editing
  const isEditing = editingProfileId !== null

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && !isEditing && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Configure model overrides and Claude Code authentication
          </p>
        </div>
      )}

      {/* Back button when editing */}
      {isEditing && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <h3 className="text-sm font-semibold">
            {editingProfileId === "new" ? "New Model Profile" : "Edit Model Profile"}
          </h3>
        </div>
      )}

      {!isEditing ? (
        <>
          <div className="space-y-2">
            <div className="pb-2">
              <h4 className="text-sm font-medium text-foreground">Claude Code</h4>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex flex-col space-y-1">
                  <span className="text-sm font-medium text-foreground">
                    Claude Code Connection
                  </span>
                  {isClaudeCodeLoading ? (
                    <span className="text-xs text-muted-foreground">
                      Checking...
                    </span>
                  ) : isClaudeCodeConnected ? (
                    claudeCodeIntegration?.connectedAt ? (
                      <span className="text-xs text-muted-foreground">
                        Connected on{" "}
                        {new Date(
                          claudeCodeIntegration.connectedAt,
                        ).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Connected
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not connected yet
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleClaudeCodeSetup}
                  disabled={disconnectClaudeCode.isPending || isClaudeCodeLoading}
                >
                  {isClaudeCodeConnected ? "Reconnect" : "Connect"}
                </Button>
              </div>
            </div>
          </div>

          {/* Custom Model Profiles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2">
              <h4 className="text-sm font-medium text-foreground">
                Custom Model Profiles
              </h4>
              <Button variant="outline" size="sm" onClick={handleAddProfile}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Profile
              </Button>
            </div>

            {modelProfiles.filter((p) => !p.isOffline).length === 0 ? (
              <div className="bg-muted/50 rounded-lg border border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No custom model profiles yet. Add one to use alternative model providers.
                </p>
              </div>
            ) : (
              <div className="bg-background rounded-lg border border-border overflow-hidden divide-y">
                {modelProfiles
                  .filter((p) => !p.isOffline)
                  .map((profile) => (
                    <div
                      key={profile.id}
                      className="p-4 flex items-start justify-between gap-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <GripVertical className="h-5 w-5 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {profile.name}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {profile.models.length} model{profile.models.length !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          {profile.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {profile.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {profile.models.slice(0, 3).map((modelName) => (
                              <Badge key={modelName} variant="outline" className="text-xs">
                                {modelName}
                              </Badge>
                            ))}
                            {profile.models.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{profile.models.length - 3} more
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 truncate">
                            {profile.config.baseUrl}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditProfile(profile.id)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteProfile(profile.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Legacy single config (for backwards compatibility) */}
          <div className="space-y-2">
            <div className="pb-2">
              <h4 className="text-sm font-medium text-foreground">
                Override Model (Legacy)
              </h4>
            </div>
            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 space-y-6">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Model name</Label>
                    <p className="text-xs text-muted-foreground">
                      Model identifier to use for requests
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-80">
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full"
                      placeholder="claude-3-7-sonnet-20250219"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-6">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">API token</Label>
                    <p className="text-xs text-muted-foreground">
                      ANTHROPIC_AUTH_TOKEN env
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-80">
                    <Input
                      type="password"
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value)
                      }}
                      className="w-full"
                      placeholder="sk-ant-..."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-6">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Base URL</Label>
                    <p className="text-xs text-muted-foreground">
                      ANTHROPIC_BASE_URL env
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-80">
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="w-full"
                      placeholder="https://api.anthropic.com"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetLegacy}
                  disabled={!canReset}
                  className="hover:bg-red-500/10 hover:text-red-600"
                >
                  Reset
                </Button>
                <Button size="sm" onClick={handleSaveLegacy} disabled={!canSave}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Profile Editor Form */
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Profile Name */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">Profile Name</Label>
                <p className="text-xs text-muted-foreground">
                  A friendly name for this profile
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={formState.name}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full"
                  placeholder="My OpenAI Provider"
                />
              </div>
            </div>

            {/* Description */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">Description</Label>
                <p className="text-xs text-muted-foreground">
                  Optional description (shown in model selector)
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full"
                  placeholder="GPT-4 and GPT-3.5 Turbo"
                />
              </div>
            </div>

            {/* Model Names */}
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">Model Names</Label>
                <p className="text-xs text-muted-foreground">
                  Available models for this provider
                </p>
              </div>
              <div className="flex-shrink-0 w-80 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    onKeyDown={handleKeyDownModel}
                    className="w-full"
                    placeholder="gpt-4, claude-3-opus"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddModel}
                    disabled={!newModelName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formState.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {formState.models.map((modelName) => (
                      <Badge
                        key={modelName}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {modelName}
                        <button
                          type="button"
                          onClick={() => handleRemoveModel(modelName)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Base URL */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">Base URL</Label>
                <p className="text-xs text-muted-foreground">
                  API endpoint URL
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={formState.baseUrl}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      baseUrl: e.target.value,
                    }))
                  }
                  className="w-full"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </div>

            {/* API Token */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">API Token</Label>
                <p className="text-xs text-muted-foreground">
                  Authentication token
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={formState.token}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      token: e.target.value,
                    }))
                  }
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveProfile}
              disabled={!canSaveForm}
            >
              <Save className="h-4 w-4 mr-1" />
              Save Profile
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
