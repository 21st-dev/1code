import { useCallback, useEffect, useMemo, useState } from "react"
import { FolderOpen } from "lucide-react"
import { useProjectIcon } from "../../lib/hooks/use-project-icon"
import { cn } from "../../lib/utils"

interface ProjectIconProps {
  project:
    | {
        id?: string | null
        name?: string | null
        gitRepo?: string | null
        iconPath?: string | null
        updatedAt?: string | Date | null
      }
    | null
    | undefined
  className?: string
}

export function ProjectIcon({ project, className }: ProjectIconProps) {
  const { src, hasError } = useProjectIcon(project)
  const [imgError, setImgError] = useState(false)
  const handleError = useCallback(() => setImgError(true), [])
  const fallbackInitial = useMemo(() => {
    const label = (project?.gitRepo || project?.name || "").trim()
    const initial = label.replace(/^[^a-zA-Z0-9]+/, "").charAt(0)
    return initial ? initial.toUpperCase() : "?"
  }, [project?.gitRepo, project?.name])

  useEffect(() => {
    setImgError(false)
  }, [src, project?.id, project?.iconPath, project?.updatedAt])

  if (!project) {
    return (
      <FolderOpen
        className={cn("text-muted-foreground flex-shrink-0", className)}
      />
    )
  }

  if (hasError || !src || imgError) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "rounded-sm bg-input-background border text-muted-foreground flex-shrink-0 flex items-center justify-center font-medium uppercase",
          className,
        )}
      >
        <span className="text-[0.65em] leading-none">{fallbackInitial}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={project.gitRepo || project.name || "Project icon"}
      className={cn("rounded-sm flex-shrink-0 object-cover", className)}
      onError={handleError}
    />
  )
}
