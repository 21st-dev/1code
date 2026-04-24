import { cn } from "../../../lib/utils"

export type SegmentedOption<T extends string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  value: T
  onChange: (next: T) => void
  options: SegmentedOption<T>[]
  size?: "sm" | "md"
  className?: string
}

export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-background p-0.5 gap-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[5px] transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
