import { useEffect, useMemo, useRef, type CSSProperties } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { shouldVirtualizePlainCodeBlock } from "./code-viewer-limits"

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
  const shouldVirtualize = shouldVirtualizePlainCodeBlock(lines.length)

  if (!shouldVirtualize) {
    return (
      <div className="h-full overflow-auto bg-muted/20">
        <StaticCodeLines
          content={content}
          lines={lines}
          wordWrap={wordWrap}
          lineNumbers={lineNumbers}
        />
      </div>
    )
  }

  return (
    <VirtualizedCodeLines
      lines={lines}
      wordWrap={wordWrap}
      lineNumbers={lineNumbers}
    />
  )
}

function StaticCodeLines({
  content,
  lines,
  wordWrap,
  lineNumbers,
}: {
  content: string
  lines: string[]
  wordWrap: boolean
  lineNumbers: boolean
}) {
  return (
    <pre
      className={cn(
        "m-0 min-w-full p-3 font-mono text-xs leading-5 text-foreground",
        wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
      )}
    >
      {lineNumbers ? (
        lines.map((line, index) => (
          <CodeLine
            key={index}
            line={line}
            index={index}
            wordWrap={wordWrap}
            lineNumbers
          />
        ))
      ) : (
        <code>{content}</code>
      )}
    </pre>
  )
}

function VirtualizedCodeLines({
  lines,
  wordWrap,
  lineNumbers,
}: {
  lines: string[]
  wordWrap: boolean
  lineNumbers: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (wordWrap ? 40 : 20),
    overscan: 20,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [lines.length, virtualizer, wordWrap])

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-muted/20">
      <pre
        className={cn(
          "relative m-0 min-w-full p-3 font-mono text-xs leading-5 text-foreground",
          wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
        style={{ height: `${virtualizer.getTotalSize() + 24}px` }}
        data-line-count={lines.length}
        data-virtualized="true"
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const line = lines[virtualRow.index] ?? ""
          return (
            <CodeLine
              key={virtualRow.key}
              data-index={virtualRow.index}
              measureElement={virtualizer.measureElement}
              line={line}
              index={virtualRow.index}
              wordWrap={wordWrap}
              lineNumbers={lineNumbers}
              style={{
                position: "absolute",
                top: 0,
                left: 12,
                right: 12,
                transform: `translateY(${virtualRow.start + 12}px)`,
              }}
            />
          )
        })}
      </pre>
    </div>
  )
}

function CodeLine({
  line,
  index,
  wordWrap,
  lineNumbers,
  style,
  measureElement,
  "data-index": dataIndex,
}: {
  line: string
  index: number
  wordWrap: boolean
  lineNumbers: boolean
  style?: CSSProperties
  measureElement?: (node: HTMLDivElement | null) => void
  "data-index"?: number
}) {
  return (
    <div
      ref={measureElement}
      data-index={dataIndex}
      className={cn(
        lineNumbers
          ? "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3"
          : "block",
        wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
      )}
      style={style}
    >
      {lineNumbers && (
        <span className="select-none text-right tabular-nums text-muted-foreground/60">
          {index + 1}
        </span>
      )}
      <code>{line || " "}</code>
    </div>
  )
}
