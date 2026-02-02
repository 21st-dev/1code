import { X } from "lucide-react"
import { useState } from "react"
import { type CustomClaudeConfig, type ModelProfile } from "../../../lib/atoms"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
  defaultOpusModel: "",
  defaultSonnetModel: "",
  defaultHaikuModel: "",
  subagentModel: "",
}

interface ProfileFormProps {
  mode: "add" | "edit"
  existingProfile?: ModelProfile
  onSave: (profile: Omit<ModelProfile, "id">) => void
  onCancel: () => void
}

export function ModelProfileForm({
  mode,
  existingProfile,
  onSave,
  onCancel,
}: ProfileFormProps) {
  const [name, setName] = useState(existingProfile?.name || "")
  const [model, setModel] = useState(existingProfile?.config.model || "")
  const [token, setToken] = useState(existingProfile?.config.token || "")
  const [baseUrl, setBaseUrl] = useState(existingProfile?.config.baseUrl || "")
  const [defaultOpusModel, setDefaultOpusModel] = useState(existingProfile?.config.defaultOpusModel || "")
  const [defaultSonnetModel, setDefaultSonnetModel] = useState(existingProfile?.config.defaultSonnetModel || "")
  const [defaultHaikuModel, setDefaultHaikuModel] = useState(existingProfile?.config.defaultHaikuModel || "")
  const [subagentModel, setSubagentModel] = useState(existingProfile?.config.subagentModel || "")

  const isValid = name.trim() && model.trim() && token.trim() && baseUrl.trim()

  const handleSave = () => {
    if (!isValid) return

    onSave({
      name: name.trim(),
      config: {
        model: model.trim(),
        token: token.trim(),
        baseUrl: baseUrl.trim(),
        defaultOpusModel: defaultOpusModel.trim() || undefined,
        defaultSonnetModel: defaultSonnetModel.trim() || undefined,
        defaultHaikuModel: defaultHaikuModel.trim() || undefined,
        subagentModel: subagentModel.trim() || undefined,
      },
    })
  }

  return (
    <div className="p-4 space-y-4 border-t border-border bg-muted/30">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {mode === "add" ? "Add Profile" : "Edit Profile"}
        </h4>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="profile-name" className="text-xs">
            Profile Name *
          </Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Local Proxy, Cloud Gateway"
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="profile-base-url" className="text-xs">
            Base URL *
          </Label>
          <Input
            id="profile-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com"
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="profile-token" className="text-xs">
            API Token *
          </Label>
          <Input
            id="profile-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="sk-ant-..."
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="profile-model" className="text-xs">
            Default Model *
          </Label>
          <Input
            id="profile-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="claude-sonnet-4-5-thinking"
            className="h-8"
          />
        </div>

        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-3 font-medium">
            Additional Model Configuration (Optional)
          </p>
        </div>

        {/* 2-column grid for optional model fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="profile-opus-model" className="text-xs">
              Default Opus Model
            </Label>
            <Input
              id="profile-opus-model"
              value={defaultOpusModel}
              onChange={(e) => setDefaultOpusModel(e.target.value)}
              placeholder="claude-opus-4-5-thinking"
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-sonnet-model" className="text-xs">
              Default Sonnet Model
            </Label>
            <Input
              id="profile-sonnet-model"
              value={defaultSonnetModel}
              onChange={(e) => setDefaultSonnetModel(e.target.value)}
              placeholder="claude-sonnet-4-5-thinking"
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-haiku-model" className="text-xs">
              Default Haiku Model
            </Label>
            <Input
              id="profile-haiku-model"
              value={defaultHaikuModel}
              onChange={(e) => setDefaultHaikuModel(e.target.value)}
              placeholder="claude-sonnet-4-5"
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-subagent-model" className="text-xs">
              Subagent Model
            </Label>
            <Input
              id="profile-subagent-model"
              value={subagentModel}
              onChange={(e) => setSubagentModel(e.target.value)}
              placeholder="claude-sonnet-4-5-thinking"
              className="h-8"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={!isValid}
          className="w-full"
          size="sm"
        >
          {mode === "add" ? "Add Profile" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
