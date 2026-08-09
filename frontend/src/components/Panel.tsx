// One specimen: tag header + vocab map + answer text + pull trace. The three
// visualization surfaces (map, text, trace) share one hover slice of state so
// hovering a token highlights its trace position and vice versa — kept local
// to the panel, not lifted to App, since nothing in the spec asks for hover
// to sync across panels. The hover source (text vs. trace) is tracked too:
// only a trace-originated hover shows the numeric readout.
//
// The trace block sits at the panel's bottom (answer text is flex:1 above
// it), same rhythm as the rest of the chrome. A short, always-visible
// caption sits above each chart explaining what it shows in one line; an
// info button next to it opens a deeper explanation on hover or press.

import { useState } from 'react'
import * as d3 from 'd3'
import type { PanelDef, PanelData, VocabPoint, VocabActivation, GenState, LensId } from '../types'
import type { AxisLimits } from '../lib/mapLimits'
import VocabMap from './VocabMap'
import TokenText from './TokenText'
import PullTrace from './PullTrace'
import InfoButton from './InfoButton'

interface PanelProps {
  def: PanelDef
  data: PanelData
  vocabPoints: VocabPoint[]
  mapLimits?: AxisLimits
  activations: VocabActivation[]
  genState: GenState
  revealCount: number
  yScale: d3.ScaleSymLog<number, number>
  thicknessScale: d3.ScaleLinear<number, number>
  opacityScale: d3.ScaleLinear<number, number>
  lensAccents: Record<LensId, string>
  isDark: boolean
  narrow: boolean
  traceVisible: boolean
}

interface Hover {
  index: number
  source: 'text' | 'trace'
}

const CAPTION_ROW_HEIGHT = 20 // reserved for the one-line caption + info button, above the chart

const TRACE_CAPTION =
  "line above 0 mean this pollinator favored the word more than baseline, below 0 favored less. a thicker line means the pollinator's whole set of likely next words differed more from baseline's."

const TRACE_DEEP_EXPLANATION =
  "At each word, the model isn't just picking one word — it's weighing many possible next words at once, each with its own odds. The vertical position compares one thing: how likely this pollinator was to pick the exact word that ended up here, versus how likely the plain baseline model was to pick that same word. Above zero, this pollinator favored it more; below, less. Thickness measures something else entirely: not this one word, but how different the pollinator's whole weighing of options was from baseline's at that moment — every word it was considering and how strongly. A thick ribbon sitting near zero means the pollinator was seriously considering a different set of words than baseline, and still happened to land on the same one. A thin ribbon far from zero means the pollinator's options looked a lot like baseline's, but it pushed hard for this specific word anyway."

const MIXED_COLOR_DEEP_EXPLANATION =
  "Each word here is tinted by whichever pollinator's predictions actually drove the model's choice at that step — the same color that pollinator uses in the rail, on its map, and in its own trace below. A run of one color means that pollinator was steering the answer for that stretch; a change in color means a different pollinator took over. The ribbon in the trace is colored the same way, so you can see exactly which color produced which part of the shape."

const BASELINE_TRACE_CAPTION = "the baseline has nothing to compare itself to — this flat line at 0 is the reference every other panel's line is measured against"

export default function Panel({
  def,
  data,
  vocabPoints,
  mapLimits,
  activations,
  genState,
  revealCount,
  yScale,
  thicknessScale,
  opacityScale,
  lensAccents,
  isDark,
  narrow,
  traceVisible,
}: PanelProps) {
  const { label, accent } = def
  const [hover, setHover] = useState<Hover | null>(null)

  const hoveredTokenIndex = hover?.index ?? null
  const hoveredFromTrace = hover?.source === 'trace'

  const onHoverFromText = (i: number | null) => setHover(i === null ? null : { index: i, source: 'text' })
  const onHoverFromTrace = (i: number | null) => setHover(i === null ? null : { index: i, source: 'trace' })

  const dominantLensIds = data.kind === 'mixed' ? data.tokens.map(t => t.dominantLensId) : undefined
  // Top/bottom padding sized so this block's total height matches the
  // rail's bottom Combine/Weight/History block (measured at 180.5px) —
  // both are bottom-anchored in equal-height columns, so matching heights
  // is what makes their top edges land level instead of the trace block
  // starting visibly lower. Horizontal padding still follows narrow, same
  // as everywhere else.
  const tracePadding = narrow ? '22px 10px 26px' : '22px 12px 26px'

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--hairline)' }}>
      {/* Specimen tag */}
      <div style={{ flexShrink: 0, padding: '10px 12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
          <span
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontStyle: 'italic',
              fontSize: narrow ? 10 : 12,
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
          {data.kind === 'mixed' && (
            <InfoButton side="below" align="right" width={230}>
              {MIXED_COLOR_DEEP_EXPLANATION}
            </InfoButton>
          )}
        </div>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '0 -12px' }} />
      </div>

      <VocabMap
        vocabPoints={vocabPoints}
        mapLimits={mapLimits}
        activations={activations}
        revealCount={revealCount}
        accent={accent}
        genState={genState}
        isDark={isDark}
      />

      {/* Answer — fills whatever space the map and trace don't use, so the
          trace stays pinned to the panel's bottom regardless of text length. */}
      <div style={{ flex: 1, overflow: 'hidden', padding: narrow ? '8px 10px' : '10px 12px', borderTop: '1px solid var(--hairline)' }}>
        <TokenText
          tokens={data.tokens}
          dominantLensIds={dominantLensIds}
          lensAccents={lensAccents}
          opacityScale={opacityScale}
          revealCount={revealCount}
          genState={genState}
          accent={accent}
          hoveredTokenIndex={hoveredTokenIndex}
          onHoverToken={onHoverFromText}
          narrow={narrow}
        />
      </div>

      {/* Pull trace — baseline gets the same chart, flattened to 0: seeing
          the reference line drawn, not just its absence, is what makes
          "this is what the other panels are measured against" legible. */}
      {traceVisible &&
        (data.kind === 'baseline' ? (
          <div style={{ flexShrink: 0, padding: tracePadding, borderTop: '1px solid var(--hairline)' }}>
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
        ) : (
          <div style={{ flexShrink: 0, padding: tracePadding, borderTop: '1px solid var(--hairline)' }}>
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
        ))}
    </div>
  )
}
