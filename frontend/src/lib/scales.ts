// Shared scale builders — computed ONCE per Generation (memoize the result of
// these in the component that owns the Generation, e.g. via useMemo keyed on
// the generation object), never per-panel. This is the mechanism that enforces
// the spec's "scale must be shared across panels, fixed once per generation"
// rule: if each panel computed its own domain from its own tokens, that would
// silently reproduce the exact per-panel-autoscaling bug the spec forbids.
//
// Token-index (x) is deliberately NOT shared here — the pull trace is a
// self-contained horizontal timeline under each panel's own (possibly
// wrapped, multi-line) answer text, not a ruler pixel-aligned to individual
// words. Sharing the token index means sharing the data linkage (same array,
// same index, for hover crosslinking), not a shared pixel coordinate system.

import * as d3 from 'd3'
import type { Generation, LensId } from '../types'

export const TRACE_HEIGHT = 112 // px, fixed so the y-domain range is stable across panels
export const LABEL_MARGIN = 16 // px reserved top/bottom for peak-word labels and (in the expanded state) axis extremes
export const MIN_RIBBON_THICKNESS = 0.75 // px
export const MAX_RIBBON_THICKNESS = 28 // px

export interface TraceScales {
  yScale: d3.ScaleSymLog<number, number>
  thicknessScale: d3.ScaleLinear<number, number>
}

function nonBaselineTokens(generation: Generation, panelIds: LensId[]) {
  return panelIds
    .map(id => generation.panels[id])
    .filter(p => p && p.kind !== 'baseline')
    .flatMap(p => (p.kind === 'lens' || p.kind === 'mixed' ? p.tokens : []))
}

// The actual scale construction, as a pure function of the domain extremes
// rather than a full Generation — this is what lets the same math serve two
// callers: buildSharedTraceScales below (scans a fully-known Generation up
// front) and App.tsx's live streaming path (tracks a running domain that
// only grows as SSE frames arrive, since the full token set isn't known
// until the stream ends).
export function buildTraceScales(maxAbsLogRatio: number, maxKl: number): TraceScales {
  const yScale = d3
    .scaleSymlog()
    .domain([-maxAbsLogRatio, maxAbsLogRatio])
    .range([TRACE_HEIGHT - LABEL_MARGIN, LABEL_MARGIN]) // symmetric domain + odd transform => scale(0) lands exactly at TRACE_HEIGHT/2, the hairline zero; LABEL_MARGIN top/bottom keeps the ribbon off the peak-label zone

  const thicknessScale = d3.scaleLinear().domain([0, maxKl]).range([MIN_RIBBON_THICKNESS, MAX_RIBBON_THICKNESS]).clamp(true)

  return { yScale, thicknessScale }
}

export function buildSharedTraceScales(generation: Generation, panelIds: LensId[]): TraceScales {
  const tokens = nonBaselineTokens(generation, panelIds)
  const maxAbsLogRatio = d3.max(tokens, t => Math.abs(t.logRatio)) ?? 1
  const maxKl = d3.max(tokens, t => t.kl) ?? 1
  return buildTraceScales(maxAbsLogRatio, maxKl)
}

export interface SurprisalScale {
  opacityScale: d3.ScaleLinear<number, number>
}

// High surprisal pops (opacity 1), low surprisal recedes toward ink-muted —
// confirmed direction: surprising tokens should visually stand out.
export function buildSurprisalScale(min: number, max: number): SurprisalScale {
  const opacityScale = d3.scaleLinear().domain([min, max]).range([0.55, 1]).clamp(true)
  return { opacityScale }
}

// "All panels: modulate token weight or opacity by surprisal" (§4.1) — this
// covers baseline too, so the domain is computed across every panel's tokens,
// not just the non-baseline ones.
export function buildSharedSurprisalScale(generation: Generation, panelIds: LensId[]): SurprisalScale {
  const surprisals = panelIds.map(id => generation.panels[id]).flatMap(p => (p ? p.tokens.map(t => t.surprisal) : []))
  const [min, max] = d3.extent(surprisals)
  return buildSurprisalScale(min ?? 0, max ?? 1)
}
