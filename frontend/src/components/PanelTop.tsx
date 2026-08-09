// Top half of a specimen: tag header + vocab map + answer text (including
// this panel's own conversation history, oldest first, ending in the live
// turn). Split from the bottom half (PanelBottom, the pull trace) so the
// question/New-Chat breaker can sit between them as a single full-width
// bar spanning every panel column at once — see App.tsx's three-row layout.
//
// Hover state used to live inside one Panel component shared by both
// halves; now that top and bottom are siblings rendered in separate rows,
// App.tsx owns it per panel id and passes the current value + setter to
// both.

import type { ReactNode } from 'react'
import type * as d3 from 'd3'
import type { PanelDef, PanelData, VocabPoint, VocabActivation, GenState, LensId } from '../types'
import type { AxisLimits } from '../lib/mapLimits'
import type { Hover } from './hover'
import VocabMap from './VocabMap'
import TokenText from './TokenText'
import InfoButton from './InfoButton'

export interface TurnRecord {
  question: string
  answer: string
}

interface PanelTopProps {
  def: PanelDef
  data: PanelData
  vocabPoints: VocabPoint[]
  mapLimits?: AxisLimits
  activations: VocabActivation[]
  genState: GenState
  revealCount: number
  opacityScale: d3.ScaleLinear<number, number>
  lensAccents: Record<LensId, string>
  isDark: boolean
  narrow: boolean
  history: TurnRecord[]
  currentQuestion: string
  hover: Hover | null
  onHover: (h: Hover | null) => void
  // Gallery-only (§6 of the gallery spec): an explanation of the scatter
  // map itself, shown via an InfoButton pinned over its corner. Undefined
  // (the default, and the only value the local app ever passes) renders
  // the map exactly as it always has — nothing wraps it, nothing new
  // mounts. Added as a prop rather than touching VocabMap.tsx itself.
  mapInfo?: ReactNode
  // Gallery-only: the local app is a fixed-viewport workspace (App.tsx's
  // 100vh/overflow:hidden root) where each panel's answer text scrolls
  // internally, by design — 'auto' (the default) keeps that. The gallery
  // is a normal page that scrolls itself, so trapping a second scroll
  // region inside each panel on top of that reads as broken ("cut off,
  // not scrollable") rather than intentional — it passes 'visible' so
  // the text just grows and the page handles the rest.
  answerOverflow?: 'auto' | 'visible'
}

const MIXED_COLOR_DEEP_EXPLANATION =
  "Each word here is tinted by whichever pollinator's predictions actually drove the model's choice at that step — the same color that pollinator uses in the rail, on its map, and in its own trace below. A run of one color means that pollinator was steering the answer for that stretch; a change in color means a different pollinator took over. The ribbon in the trace is colored the same way, so you can see exactly which color produced which part of the shape."

export default function PanelTop({
  def,
  data,
  vocabPoints,
  mapLimits,
  activations,
  genState,
  revealCount,
  opacityScale,
  lensAccents,
  isDark,
  narrow,
  history,
  currentQuestion,
  hover,
  onHover,
  mapInfo,
  answerOverflow = 'auto',
}: PanelTopProps) {
  const { label, accent } = def

  const hoveredTokenIndex = hover?.index ?? null
  const onHoverFromText = (i: number | null) => onHover(i === null ? null : { index: i, source: 'text' })

  const dominantLensIds = data.kind === 'mixed' ? data.tokens.map(t => t.dominantLensId) : undefined

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

      {mapInfo ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <VocabMap
            vocabPoints={vocabPoints}
            mapLimits={mapLimits}
            activations={activations}
            revealCount={revealCount}
            accent={accent}
            genState={genState}
            isDark={isDark}
          />
          <div style={{ position: 'absolute', top: 6, right: 6 }}>
            <InfoButton side="below" align="right" width={240}>
              {mapInfo}
            </InfoButton>
          </div>
        </div>
      ) : (
        <VocabMap
          vocabPoints={vocabPoints}
          mapLimits={mapLimits}
          activations={activations}
          revealCount={revealCount}
          accent={accent}
          genState={genState}
          isDark={isDark}
        />
      )}

      {/* Answer — fills whatever space the map doesn't use. Past turns
          (oldest first) render as plain muted text above the live one;
          scrolls once history makes it taller than the panel, rather than
          clipping older turns silently out of view. */}
      <div style={{ flex: 1, overflowY: answerOverflow, padding: narrow ? '8px 10px' : '10px 12px', borderTop: '1px solid var(--hairline)' }}>
        {history.map((turn, i) => (
          <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--hairline)' }}>
            <p
              style={{
                margin: '0 0 4px',
                fontFamily: "'Lora', Georgia, serif",
                fontStyle: 'italic',
                fontSize: narrow ? 10 : 11,
                color: 'var(--ink-muted)',
                textAlign: 'right',
              }}
            >
              {turn.question}
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: narrow ? 10 : 11,
                lineHeight: 1.65,
                color: 'var(--ink-muted)',
              }}
            >
              {turn.answer}
            </p>
          </div>
        ))}

        {genState !== 'idle' && currentQuestion && (
          <p
            style={{
              margin: '0 0 4px',
              fontFamily: "'Lora', Georgia, serif",
              fontStyle: 'italic',
              fontSize: narrow ? 10 : 11,
              color: 'var(--ink)',
              textAlign: 'right',
            }}
          >
            {currentQuestion}
          </p>
        )}
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
    </div>
  )
}
