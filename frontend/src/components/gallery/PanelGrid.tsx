// Desktop: an optional toggle bar (right-aligned, full width, above
// everything — so pinned and toggleable panels still start at the same
// vertical position below it, rather than the toggleable columns sitting
// lower than the pinned ones), then one row of PanelTops split into two
// groups — `pinned` (baseline, and mixed for the crosspollinate layouts;
// always visible, never toggleable) and `toggleable` (individual
// pollinators, already filtered down to just the currently-visible ones
// by the caller) — with a shaded gap column between them when there's
// anything to separate. An optional breaker (GalleryQuestionBar — passed
// in by the card layout, not owned here, since a turn can span more than
// one PanelGrid — see MixedFeaturedCard), then one row of PanelBottoms,
// same two-group split.
//
// Narrow viewports (phone widths): each panel becomes its own full-width
// block — PanelTop immediately followed by its own PanelBottom — stacked
// top to bottom instead of squeezed side by side. Pinned panels stack
// first, then a shaded break, then the toggle bar, then the (visible)
// toggleable panels. Same components either way, just a different
// arrangement of the same JSX; PanelTop/PanelBottom's own `flex: 1`
// styling is inert outside a flex row, so no CSS fights happen switching
// between the two.
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
import PanelTop, { PanelMap } from '../PanelTop'
import WordShifts from './WordShifts'
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
  // Always visible, never toggleable — baseline, and mixed for the
  // crosspollinate layouts.
  pinned: GridPanel[]
  // Individual pollinators — already filtered down to just the ones
  // currently toggled on; PanelGrid doesn't own toggle state itself.
  toggleable: GridPanel[]
  // The pill row — rendered once, above both groups (see file comment for
  // why it isn't scoped to sit only above the toggleable columns).
  toggleBar?: ReactNode
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

// The visible "break in the grid" between pinned and toggleable panels —
// a shaded, double-bordered column (desktop) or full-width strip
// (mobile), distinct from the hairline seams between individual panels so
// it reads as a structural divide, not just another column boundary.
function GridGap({ vertical }: { vertical: boolean }) {
  return (
    <div
      style={
        vertical
          ? { width: 28, flexShrink: 0, borderLeft: '1px solid var(--hairline)', borderRight: '1px solid var(--hairline)', background: 'var(--surface-inset)' }
          : { height: 20, borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-inset)' }
      }
    />
  )
}

// A full-width disclosure bar for one opt-in section. Same bordered,
// raised-surface treatment as the question bar so it reads as part of
// the grid's own structure.
function SectionToggle({ open, onToggle, title, hint }: { open: boolean; onToggle: () => void; title: string; hint: string }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        flexWrap: 'wrap',
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        background: 'var(--surface-raised)',
        border: 'none',
        borderBottom: '1px solid var(--hairline)',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      }}
    >
      <span style={{ fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', width: 14, color: 'var(--ink-muted)' }}>{open ? '▾' : '▸'}</span>
        {title}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{hint}</span>
    </button>
  )
}

// One panel's column within an opt-in section: repeats the panel's tag
// (dot + name) so a section scrolled well away from the text row still
// says whose column is whose. `flush` drops the padding for charts that
// manage their own.
function Cell({
  def,
  data,
  lensAccents,
  narrow,
  flush,
  headerRule = flush,
  divider = true,
  children,
}: {
  def: PanelDef
  data: PanelData
  lensAccents: Record<LensId, string>
  narrow: boolean
  flush?: boolean
  // Rule under the tag (defaults on for flush charts) / under the cell.
  headerRule?: boolean
  divider?: boolean
  children: ReactNode
}) {
  // Same equal-wedge pie as PanelTop's mixed dot, over the lenses that
  // actually won a token.
  const contributors = data.kind === 'mixed' ? Array.from(new Set(data.tokens.map(t => t.dominantLensId))) : []
  const dot =
    contributors.length > 0
      ? `conic-gradient(${contributors.map((id, i) => `${lensAccents[id] ?? 'var(--ink-faint)'} ${(i / contributors.length) * 360}deg ${((i + 1) / contributors.length) * 360}deg`).join(', ')})`
      : def.accent
  const pad = narrow ? '10px' : '12px'
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--hairline)', borderBottom: divider ? '1px solid var(--hairline)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `8px ${pad}`, borderBottom: headerRule ? '1px solid var(--hairline)' : 'none' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 12.5, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {def.label}
        </span>
      </div>
      <div style={{ flex: 1, padding: flush ? 0 : `4px ${pad} 14px` }}>{children}</div>
    </div>
  )
}

export default function PanelGrid({ pinned, toggleable, toggleBar, vocabPoints, mapLimits, isDark, lensAccents, mapInfo, breaker }: PanelGridProps) {
  const [hoverByPanel, setHoverByPanel] = useState<Record<string, Hover | null>>({})
  // Both opt-in sections start closed and open independently — the answer
  // text alone is the default view.
  const [showShifts, setShowShifts] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const allPanels = [...pinned, ...toggleable]
  // Stacked mobile panels are each full device width — the cramped-width
  // "narrow" treatment (smaller font/padding, for >= 4 columns squeezed
  // side by side) doesn't apply there regardless of how many panels exist.
  const narrow = !isMobile && allPanels.length >= 4
  const genState: GenState = 'complete' // gallery panels are always fully-loaded, never "generating" mid-stream

  // Domains sized to what's actually in these panels (their full,
  // completed token set — known up front here, unlike the live app's
  // streaming grow-only domain) so the shared trace/opacity scales are
  // correct from the very first frame of the reveal, not just by the end.
  let maxAbsLogRatio = 2
  let maxKl = 2
  let minSurprisal = 0
  let maxSurprisal = 4
  for (const p of allPanels) {
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
      // The gallery page scrolls itself (see GalleryApp.tsx) — an inner
      // scroll trap on top of that is what read as "cut off, not
      // scrollable" rather than intentional. Let the text grow naturally
      // and the page handle the rest, on both desktop and mobile.
      answerOverflow="visible"
      // The map lives in the opt-in "under the hood" section instead.
      showMap={false}
    />
  )

  const shifts = (p: GridPanel) => (
    <Cell key={p.def.id} def={p.def} lensAccents={lensAccents} data={p.data} narrow={narrow}>
      <WordShifts
        data={p.data}
        label={p.def.label}
        accent={p.def.accent}
        revealCount={p.revealCount}
        isDark={isDark}
        narrow={narrow}
        onHover={onHover(p.def.id)}
      />
    </Cell>
  )

  const map = (p: GridPanel) => (
    <Cell key={p.def.id} def={p.def} lensAccents={lensAccents} data={p.data} narrow={narrow} flush divider={isMobile}>
      <PanelMap
        vocabPoints={vocabPoints}
        mapLimits={mapLimits}
        activations={p.activations}
        revealCount={p.revealCount}
        accent={p.def.accent}
        genState={genState}
        isDark={isDark}
        mapInfo={mapInfo}
      />
    </Cell>
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
      isDark={isDark}
    />
  )

  const hasGap = toggleable.length > 0 && pinned.length > 0

  // One row of per-panel cells, with the same pinned | gap | toggleable
  // split as the text row so every section's columns line up under it.
  const row = (render: (p: GridPanel) => ReactNode) =>
    isMobile ? (
      <div>
        {pinned.map(render)}
        {hasGap && <GridGap vertical={false} />}
        {toggleable.map(render)}
      </div>
    ) : (
      <div style={{ display: 'flex' }}>
        {pinned.map(render)}
        {hasGap && <GridGap vertical />}
        {toggleable.map(render)}
      </div>
    )

  const sections = (
    <>
      <SectionToggle
        open={showShifts}
        onToggle={() => setShowShifts(v => !v)}
        title="Standout words"
        hint="The highlighted words in each answer, and how likely the baseline model was to say them"
      />
      {showShifts && row(shifts)}
      <SectionToggle
        open={showCharts}
        onToggle={() => setShowCharts(v => !v)}
        title="Under the hood"
        hint="Embedding maps and pull traces, for a closer look"
      />
      {showCharts && (
        <>
          {row(map)}
          {isMobile ? (
            // Stacked: each trace directly under its own tag, not one
            // anonymous row of charts.
            <div>
              {[...pinned, ...toggleable].map(p => (
                <Cell key={p.def.id} def={p.def} lensAccents={lensAccents} data={p.data} narrow={narrow} flush headerRule={false}>
                  {bottom(p)}
                </Cell>
              ))}
            </div>
          ) : (
            <div style={{ borderBottom: '1px solid var(--hairline)' }}>{row(bottom)}</div>
          )}
        </>
      )}
    </>
  )

  if (isMobile) {
    return (
      <div style={{ border: '1px solid var(--hairline)', marginBottom: 24 }}>
        {pinned.map((p, i) => (
          <div key={p.def.id} style={{ borderBottom: i < pinned.length - 1 || hasGap || toggleBar ? '1px solid var(--hairline)' : 'none' }}>
            {top(p)}
          </div>
        ))}
        {hasGap && <GridGap vertical={false} />}
        {toggleBar && <div style={{ display: 'flex', justifyContent: 'center', padding: '10px', borderBottom: '1px solid var(--hairline)' }}>{toggleBar}</div>}
        {toggleable.map((p, i) => (
          <div key={p.def.id} style={{ borderBottom: i < toggleable.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
            {top(p)}
          </div>
        ))}
        {breaker}
        {sections}
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--hairline)', borderBottom: 'none', marginBottom: 24 }}>
      {toggleBar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--hairline)' }}>
          {toggleBar}
        </div>
      )}
      <div style={{ display: 'flex' }}>
        {pinned.map(top)}
        {hasGap && <GridGap vertical />}
        {toggleable.map(top)}
      </div>
      {breaker}
      {sections}
    </div>
  )
}
