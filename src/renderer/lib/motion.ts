// Shared animation constants for consistent, snappy motion across the app.
// Inspired by Linear/Raycast — fast ease-out curves, tight durations, no bounce.

// ── Easing Curves ────────────────────────────────────────────────────

/** Standard ease-out for most UI transitions. Fast start, gentle settle. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** Faster ease-out for width/height expand/collapse (sidebar, sections). */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

// ── Durations (seconds) ──────────────────────────────────────────────

/** Micro interactions: badge swaps, icon transitions (100ms) */
export const DURATION_INSTANT = 0.1

/** Standard transitions: sidebar open/close, view changes (150ms) */
export const DURATION_FAST = 0.15

/** Expand/collapse: workspace sections, height animations (180ms) */
export const DURATION_NORMAL = 0.18

// ── Reusable Transition Presets ──────────────────────────────────────

/** Standard fade — overlays, badges, view crossfades */
export const TRANSITION_FADE = {
  duration: DURATION_FAST,
  ease: EASE_OUT,
} as const

/** Expand/collapse — sidebar width, section height */
export const TRANSITION_EXPAND = {
  duration: DURATION_NORMAL,
  ease: EASE_OUT_EXPO,
} as const

// ── Stagger ──────────────────────────────────────────────────────────

/** Delay between staggered children (25ms) */
export const STAGGER_DELAY = 0.025

/** Delay before first staggered child (20ms) */
export const STAGGER_DELAY_CHILDREN = 0.02
