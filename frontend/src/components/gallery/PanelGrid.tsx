// Desktop: one row of PanelTops, an optional breaker (GalleryQuestionBar —
// passed in by the card layout, not owned here, since a turn can span more
// than one PanelGrid — see MixedFeaturedCard), then one row of
// PanelBottoms — the same two/three-row split App.tsx uses for the local
// app (PanelTop row, QuestionBar, PanelBottom row).
//
// Narrow viewports (phone widths): each panel becomes its own full-width
// block — PanelTop immediately followed by its own PanelBottom — stacked
// top to bottom instead of squeezed side by side. Same components either
// way, just a different arrangement of the same JSX; PanelTop/PanelBottom's
// own `flex: 1` styling is inert outside a flex row, so no CSS fights
// happen switching between the two.
//
// Owns hover state itself (App.tsx's hoverByPanel, but self-contained here
// since no other gallery component needs to coordinate hover across
// panels).

import { useState, type ReactNode } from 'react'
import type * as d3 from 'd3'
import type { PanelDef, PanelData, VocabPoint, VocabActivation, GenState, LensId } from '../../types'
import type { AxisLimits } from '../../lib/mapLimits'
import type { Hover } from '../hover'
import type { TurnRecord } from '../PanelTop'
import PanelTop from '../PanelTop'
import PanelBottom from '../PanelBottom'
import { buildSurprisalScale, buildTraceScales } from '../../lib/scales'
import { useMediaQuery } from '../../lib/useMediaQuery'

export interface GridPanel {
  def: PanelDef
  data: PanelData
  activations: VocabActivation[]
  history?: TurnRecord[]
  currentQuestion?: string
  // Per-panel, not grid-level: turn-based layouts pass every panel the
  // same shared value (one ticker per turn), but the toggle layout needs
  // each panel revealing independently as it's toggled on — unifying both
  // into "every panel names its own revealCount" covers both without two
  // different grid APIs.
  revealCount: number
}

interface PanelGridProps {
  panels: GridPanel[]
  vocabPoints: VocabPoint[]
  mapLimits?: AxisLimits
  isDark: boolean
  lensAccents: Record<LensId, string>
  mapInfo?: string
  // Rendered between the top (text) row and the bottom (trace) row on
  // desktop; on the stacked mobile layout, where there's no single trace
  // row to sit "between", it renders once after every panel's own
  // top+bottom pair instead.
  breaker?: ReactNode
}

const MOBILE_QUERY = '(max-width: 700px)'

export default function PanelGrid({ panels, vocabPoints, mapLimits, isDark, lensAccents, mapInfo, breaker }: PanelGridProps) {
  const [hoverByPanel, setHoverByPanel] = useState<Record<string, Hover | null>>({})
  const isMobile = useMediaQuery(MOBILE_QUERY)
  // Stacked mobile panels are each full device width — the cramped-width
  // "narrow" treatment (smaller font/padding, for >= 4 columns squeezed
  // side by side) doesn't apply there regardless of how many panels exist.
  const narrow = !isMobile && panels.length >= 4
  const genState: GenState = 'complete' // gallery panels are always fully-loaded, never "generating" mid-stream

  // Domains sized to what's actually in these panels (their full,
  // completed token set — known up front here, unlike the live app's
  // streaming grow-only domain) so the shared trace/opacity scales are
  // correct from the very first frame of the reveal, not just by the end.
  let maxAbsLogRatio = 2
  let maxKl = 2
  let minSurprisal = 0
  let maxSurprisal = 4
  for (const p of panels) {
    for (const t of p.data.tokens) {
      minSurprisal = Math.min(minSurprisal, t.surprisal)
      maxSurprisal = Math.max(maxSurprisal, t.surprisal)
      if ('logRatio' in t) {
        maxAbsLogRatio = Math.max(maxAbsLogRatio, Math.abs(t.logRatio))
        maxKl = Math.max(maxKl, t.kl)
      }
    }
  }
  const { yScale, thicknessScale } = buildTraceScales(maxAbsLogRatio, maxKl)
  const { opacityScale } = buildSurprisalScale(minSurprisal, maxSurprisal)

  const onHover = (id: string) => (h: Hover | null) => setHoverByPanel(prev => ({ ...prev, [id]: h }))

  const top = (p: GridPanel) => (
    <PanelTop
      key={p.def.id}
      def={p.def}
      data={p.data}
      vocabPoints={vocabPoints}
      mapLimits={mapLimits}
      activations={p.activations}
      genState={genState}
      revealCount={p.revealCount}
      opacityScale={opacityScale}
      lensAccents={lensAccents}
      isDark={isDark}
      narrow={narrow}
      history={p.history ?? []}
      currentQuestion={p.currentQuestion ?? ''}
      hover={hoverByPanel[p.def.id] ?? null}
      onHover={onHover(p.def.id)}
      mapInfo={mapInfo}
      // The gallery page scrolls itself (see GalleryApp.tsx) — an inner
      // scroll trap on top of that is what read as "cut off, not
      // scrollable" rather than intentional. Let the text grow naturally
      // and the page handle the rest, on both desktop and mobile.
      answerOverflow="visible"
    />
  )

  const bottom = (p: GridPanel) => (
    <PanelBottom
      key={p.def.id}
      data={p.data}
      accent={p.def.accent}
      revealCount={p.revealCount}
      yScale={yScale}
      thicknessScale={thicknessScale}
      lensAccents={lensAccents}
      narrow={narrow}
      traceVisible={true}
      hover={hoverByPanel[p.def.id] ?? null}
      onHover={onHover(p.def.id)}
    />
  )

  if (isMobile) {
    return (
      <div style={{ border: '1px solid var(--hairline)', marginBottom: 24 }}>
        {panels.map((p, i) => (
          <div key={p.def.id} style={{ borderBottom: i < panels.length - 1 || breaker ? '1px solid var(--hairline)' : 'none' }}>
            {top(p)}
            {bottom(p)}
          </div>
        ))}
        {breaker}
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--hairline)', borderBottom: 'none', marginBottom: 24 }}>
      <div style={{ display: 'flex' }}>{panels.map(top)}</div>
      {breaker}
      <div style={{ display: 'flex', borderTop: breaker ? 'none' : '1px solid var(--hairline)' }}>{panels.map(bottom)}</div>
    </div>
  )
}
