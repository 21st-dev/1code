import { Check, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { type ModelProfile } from "../../../lib/atoms"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"

interface ProfileRowProps {
  profile: ModelProfile
  isActive: boolean
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ModelProfileRow({
  profile,
  isActive,
  onActivate,
  onEdit,
  onDelete,
}: ProfileRowProps) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{profile.name}</span>
            {isActive && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Model: {profile.config.model || "Not set"}
          </div>
          <div className="text-xs text-muted-foreground">
            Proxy: {profile.config.baseUrl || "Default (api.anthropic.com)"}
          </div>
          {(profile.config.defaultOpusModel ||
            profile.config.defaultSonnetModel ||
            profile.config.defaultHaikuModel ||
            profile.config.subagentModel) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {profile.config.defaultOpusModel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  OPUS
                </span>
              )}
              {profile.config.defaultSonnetModel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  SONNET
                </span>
              )}
              {profile.config.defaultHaikuModel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  HAIKU
                </span>
              )}
              {profile.config.subagentModel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  SUBAGENT
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button size="sm" variant="ghost" onClick={onActivate}>
            Use
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
