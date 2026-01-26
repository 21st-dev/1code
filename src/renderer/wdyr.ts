/// <reference types="@welldone-software/why-did-you-render" />
import React from "react"
import whyDidYouRender from "@welldone-software/why-did-you-render"

// ============================================================================
// WDYR (Why Did You Render) - React Re-render Debugging
// ============================================================================
// Set to true to enable re-render tracking and infinite loop detection.
// See DEBUG-WDYR.md for usage instructions.
// ============================================================================
const WDYR_ENABLED = false

if (import.meta.env.DEV && WDYR_ENABLED) {
  // Track render counts per component to detect infinite loops
  const renderCounts: Record<string, { count: number; lastTime: number }> = {}
  const THRESHOLD = 10 // Max renders before triggering debugger
  const TIME_WINDOW = 1000 // Time window in ms

  whyDidYouRender(React, {
    trackAllPureComponents: true,
    trackHooks: true,
    logOwnerReasons: true, // Shows parent chain causing re-renders
    logOnDifferentValues: true, // Log ALL re-renders
    collapseGroups: true,

    notifier: (info) => {
      const name = info.displayName || (info.Component as any)?.name || "Unknown"
      const now = Date.now()

      // Reset count if outside time window
      if (!renderCounts[name] || now - renderCounts[name].lastTime > TIME_WINDOW) {
        renderCounts[name] = { count: 0, lastTime: now }
      }

      renderCounts[name].count++
      renderCounts[name].lastTime = now

      // Log every render with prop names (safely handle different data types)
      const getDiffNames = (diff: any) => {
        if (!diff) return []
        if (Array.isArray(diff)) return diff.map((d: any) => d?.pathString || d?.name || 'unknown')
        if (typeof diff === 'object') return Object.keys(diff)
        return []
      }
      const propNames = getDiffNames(info.reason?.propsDifferences)
      const stateNames = getDiffNames(info.reason?.stateDifferences)
      const hookNames = getDiffNames(info.reason?.hookDifferences)
      console.log(`[WDYR] ${name} render #${renderCounts[name].count}`, {
        props: propNames.length > 0 ? propNames : false,
        state: stateNames.length > 0 ? stateNames : false,
        hooks: hookNames.length > 0 ? hookNames : false,
      })

      // Trigger debugger before crash if threshold exceeded
      if (renderCounts[name].count >= THRESHOLD) {
        console.error(
          `[ERROR] INFINITE LOOP DETECTED: ${name} rendered ${THRESHOLD}+ times in ${TIME_WINDOW}ms`
        )
        console.error("Full info:", info)
        console.error("Props diff:", info.reason?.propsDifferences)
        console.error("State diff:", info.reason?.stateDifferences)
        console.error("Hook diff:", info.reason?.hookDifferences)
        debugger // Pause here - inspect call stack!
      }
    },
  })

  console.log("[WDYR] Why Did You Render initialized with loop detection")
}

export {}
