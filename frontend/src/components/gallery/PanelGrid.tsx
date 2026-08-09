// Renders one row of PanelTops followed immediately by one row of
// PanelBottoms — the same two-row split App.tsx uses for the local app,
// minus the QuestionBar breaker between them (the gallery has no question
// input; there's nothing to break up the panels with). Owns hover state
// itself (App.tsx's hoverByPanel, but self-contained here since no other
// gallery component needs to coordinate hover across panels).

import { useState } from 'react'
import type * as d3 from 'd3'
import type { PanelDef, PanelData, VocabPoint, VocabActivation, GenState, LensId } from '../../types'
import type { AxisLimits } from '../../lib/mapLimits'
import type { Hover } from '../hover'
import type { TurnRecord } from '../PanelTop'
import PanelTop from '../PanelTop'
import PanelBottom from '../PanelBottom'
import { buildSurprisalScale, buildTraceScales } from '../../lib/scales'

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
}

export default function PanelGrid({ panels, vocabPoints, mapLimits, isDark, lensAccents, mapInfo }: PanelGridProps) {
  const [hoverByPanel, setHoverByPanel] = useState<Record<string, Hover | null>>({})
  const narrow = panels.length >= 4
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

  return (
    <div style={{ border: '1px solid var(--hairline)', borderBottom: 'none', marginBottom: 24 }}>
      <div style={{ display: 'flex' }}>
        {panels.map(p => (
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
          />
        ))}
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--hairline)' }}>
        {panels.map(p => (
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
        ))}
      </div>
    </div>
  )
}
