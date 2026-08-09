// Bottom half of a specimen: the pull trace only. Split from PanelTop (tag +
// map + answer text) so the question/New-Chat breaker can sit between them
// as one full-width bar across every panel column — see App.tsx's
// three-row layout. Content and behavior otherwise unchanged from the
// pre-split Panel.tsx.

import type * as d3 from 'd3'
import type { PanelData, LensId } from '../types'
import type { Hover } from './hover'
import PullTrace from './PullTrace'
import InfoButton from './InfoButton'

interface PanelBottomProps {
  data: PanelData
  accent: string
  revealCount: number
  yScale: d3.ScaleSymLog<number, number>
  thicknessScale: d3.ScaleLinear<number, number>
  lensAccents: Record<LensId, string>
  narrow: boolean
  traceVisible: boolean
  hover: Hover | null
  onHover: (h: Hover | null) => void
}

const CAPTION_ROW_HEIGHT = 20 // reserved for the one-line caption + info button, above the chart

const TRACE_CAPTION =
  "line above 0 mean this pollinator favored the word more than baseline, below 0 favored less. a thicker line means the pollinator's whole set of likely next words differed more from baseline's."

const TRACE_DEEP_EXPLANATION =
  "At each word, the model isn't just picking one word — it's weighing many possible next words at once, each with its own odds. The vertical position compares one thing: how likely this pollinator was to pick the exact word that ended up here, versus how likely the plain baseline model was to pick that same word. Above zero, this pollinator favored it more; below, less. Thickness measures something else entirely: not this one word, but how different the pollinator's whole weighing of options was from baseline's at that moment — every word it was considering and how strongly. A thick ribbon sitting near zero means the pollinator was seriously considering a different set of words than baseline, and still happened to land on the same one. A thin ribbon far from zero means the pollinator's options looked a lot like baseline's, but it pushed hard for this specific word anyway."

const BASELINE_TRACE_CAPTION = "the baseline has nothing to compare itself to — this flat line at 0 is the reference every other panel's line is measured against"

export default function PanelBottom({
  data,
  accent,
  revealCount,
  yScale,
  thicknessScale,
  lensAccents,
  narrow,
  traceVisible,
  hover,
  onHover,
}: PanelBottomProps) {
  const hoveredTokenIndex = hover?.index ?? null
  const hoveredFromTrace = hover?.source === 'trace'
  const onHoverFromTrace = (i: number | null) => onHover(i === null ? null : { index: i, source: 'trace' })

  const dominantLensIds = data.kind === 'mixed' ? data.tokens.map(t => t.dominantLensId) : undefined

  // Top/bottom padding sized so this block's total height matches the
  // rail's bottom Combine/Weight/History block (measured at 180.5px) —
  // both are bottom-anchored in equal-height columns, so matching heights
  // is what makes their top edges land level instead of the trace block
  // starting visibly lower. Horizontal padding still follows narrow, same
  // as everywhere else.
  const tracePadding = narrow ? '22px 10px 26px' : '22px 12px 26px'

  if (!traceVisible) return <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid var(--hairline)' }} />

  // Baseline gets the same chart, flattened to 0: seeing the reference
  // line drawn, not just its absence, is what makes "this is what the
  // other panels are measured against" legible.
  if (data.kind === 'baseline') {
    return (
      <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid var(--hairline)' }}>
        <div style={{ padding: tracePadding, borderTop: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, height: CAPTION_ROW_HEIGHT }}>
            <p style={{ margin: 0, fontSize: 8, lineHeight: 1.4, color: 'var(--ink-muted)', fontFamily: 'Instrument Sans, sans-serif', flex: 1 }}>
              {BASELINE_TRACE_CAPTION}
            </p>
          </div>
          <PullTrace
            // No lens to compare itself against, so every token is pinned
            // to logRatio 0 / kl 0 — the same component, flattened, so it
            // lines up exactly with the zero every other panel is
            // measured against, in the same visual language.
            tokens={data.tokens.map(t => ({ ...t, logRatio: 0, kl: 0 }))}
            accent={accent}
            yScale={yScale}
            thicknessScale={thicknessScale}
            revealCount={revealCount}
            hoveredTokenIndex={hoveredTokenIndex}
            hoveredFromTrace={hoveredFromTrace}
            onHoverToken={onHoverFromTrace}
            showPeaks={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid var(--hairline)' }}>
      <div style={{ padding: tracePadding, borderTop: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, height: CAPTION_ROW_HEIGHT }}>
          <p style={{ margin: 0, fontSize: 8, lineHeight: 1.4, color: 'var(--ink-muted)', fontFamily: 'Instrument Sans, sans-serif', flex: 1 }}>
            {TRACE_CAPTION}
          </p>
          <InfoButton side="above" align="right" width={240}>
            {TRACE_DEEP_EXPLANATION}
          </InfoButton>
        </div>
        <PullTrace
          tokens={data.tokens}
          accent={accent}
          dominantLensIds={dominantLensIds}
          lensAccents={data.kind === 'mixed' ? lensAccents : undefined}
          yScale={yScale}
          thicknessScale={thicknessScale}
          revealCount={revealCount}
          hoveredTokenIndex={hoveredTokenIndex}
          hoveredFromTrace={hoveredFromTrace}
          onHoverToken={onHoverFromTrace}
        />
      </div>
    </div>
  )
}
