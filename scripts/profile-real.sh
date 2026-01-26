#!/bin/bash

echo "═══════════════════════════════════════════════════════"
echo "  1CODE PERFORMANCE PROFILING - BASELINE MEASUREMENT"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "📊 COMPONENT SIZE ANALYSIS"
echo ""

for file in \
  "src/renderer/features/agents/main/active-chat.tsx" \
  "src/renderer/features/agents/main/messages-list.tsx" \
  "src/renderer/components/ui/icons.tsx" \
  "src/main/lib/trpc/routers/chats.ts" \
  "src/renderer/contexts/TRPCProvider.tsx"
do
  if [ -f "$file" ]; then
    lines=$(wc -l < "$file")
    size=$(du -h "$file" | cut -f1)
    
    if [ "$lines" -gt 2000 ]; then
      echo "⚠️  $file"
      echo "   $lines lines | $size - TOO LARGE"
    elif [ "$lines" -gt 1000 ]; then
      echo "⚡ $file"
      echo "   $lines lines | $size - NEEDS REVIEW"
    else
      echo "✓ $file"
      echo "   $lines lines | $size"
    fi
    echo ""
  else
    echo "❌ $file - NOT FOUND"
    echo ""
  fi
done

echo "📊 REACT HOOK ANALYSIS"
echo ""

for file in \
  "src/renderer/features/agents/main/active-chat.tsx" \
  "src/renderer/features/agents/main/messages-list.tsx"
do
  if [ -f "$file" ]; then
    useEffects=$(grep -c "useEffect" "$file" 2>/dev/null || echo "0")
    useCallbacks=$(grep -c "useCallback" "$file" 2>/dev/null || echo "0")
    memos=$(grep -c "memo(" "$file" 2>/dev/null || echo "0")
    lazy=$(grep -c "React.lazy" "$file" 2>/dev/null || echo "0")
    
    if [ "$useEffects" -gt 30 ]; then
      echo "⚠️  $file"
    else
      echo "✓ $file"
    fi
    echo "   useEffect: $useEffects | useCallback: $useCallbacks | memo: $memos | lazy: $lazy"
    echo ""
  fi
done

echo "📊 DATABASE QUERY ANALYSIS"
echo ""

file="src/main/lib/trpc/routers/chats.ts"
if [ -f "$file" ]; then
  syncOps=$(grep -c "\.get()\|\.all()\|\.run()" "$file" 2>/dev/null || echo "0")
  selects=$(grep -c "db.select()" "$file" 2>/dev/null || echo "0")
  
  echo "$file:"
  echo "   Synchronous operations: $syncOps"
  echo "   Total SELECT queries: $selects"
  echo ""
fi

echo "📊 BUNDLE SIZE"
echo ""
du -sh node_modules 2>/dev/null || echo "node_modules: N/A"
du -sh out 2>/dev/null || echo "out: Not built"
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  BASELINE COMPLETE"
echo "═══════════════════════════════════════════════════════"

