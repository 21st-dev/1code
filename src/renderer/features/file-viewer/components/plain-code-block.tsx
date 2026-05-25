import { useMemo } from "react"
import { cn } from "@/lib/utils"

export function PlainCodeBlock({
  content,
  wordWrap,
  lineNumbers = true,
}: {
  content: string
  wordWrap: boolean
  lineNumbers?: boolean
}) {
  const lines = useMemo(() => content.split("\n"), [content])

  return (
    <div className="h-full overflow-auto bg-muted/20">
      <pre
        className={cn(
          "m-0 min-w-full p-3 font-mono text-xs leading-5 text-foreground",
          wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
      >
        {lineNumbers ? (
          lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3"
            >
              <span className="select-none text-right tabular-nums text-muted-foreground/60">
                {index + 1}
              </span>
              <code>{line || " "}</code>
            </div>
          ))
        ) : (
          <code>{content}</code>
        )}
      </pre>
    </div>
  )
}
