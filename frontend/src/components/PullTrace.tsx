// The pull trace (§4.2) — one D3 ribbon per non-baseline panel. x = token
// index, y (signed, around a hairline zero) = log p_lens - log p_baseline,
// thickness = KL(lens ‖ baseline). Never called for the baseline panel — see
// Panel.tsx, which simply omits this block there.
//
// D3 computes the path geometry (area generator, scales) as a pure function;
// React owns the DOM (the <path>/<text>/<rect> elements it's handed). No dual
// ownership of nodes.
//
// The SVG is sized to its real measured pixel width (via ResizeObserver)
// rather than stretched through a viewBox with preserveAspectRatio="none" —
// non-uniform stretching would visually distort the peak-word <text>
// elements this version adds. 1 SVG unit = 1 css px, so text renders true.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LensToken, LensId } from '../types'
import { TRACE_HEIGHT, LABEL_MARGIN } from '../lib/scales'
import { findPeaks, placePeakLabels } from '../lib/peaks'

const LEFT_MARGIN = 22 // reserves room for the "0" / axis-extreme labels
const RIGHT_MARGIN = 4
const MIN_LABEL_GAP = 46 // px, minimum x-distance between two same-side peak labels

interface PullTraceProps {
  tokens: LensToken[]
  accent: string
  dominantLensIds?: LensId[] // same length as tokens; when present, ribbon is segmented/colored by these instead of `accent`
  lensAccents?: Record<LensId, string>
  yScale: d3.ScaleSymLog<number, number>
  thicknessScale: d3.ScaleLinear<number, number>
  revealCount: number
  hoveredTokenIndex: number | null
  hoveredFromTrace: boolean
  onHoverToken: (i: number | null) => void
  // Baseline feeds this component an all-zero LensToken array so it renders
  // the same flat hairline the other panels are measured against, in the
  // same visual language — but with nothing to peak-label, so that part is
  // switched off rather than showing arbitrary tokens at y=0.
  showPeaks?: boolean
}

interface RibbonPoint {
  i: number
  y: number
  kl: number
}

export default function PullTrace({
  tokens,
  accent,
  dominantLensIds,
  lensAccents,
  yScale,
  thicknessScale,
  revealCount,
  hoveredTokenIndex,
  hoveredFromTrace,
  onHoverToken,
  showPeaks = true,
}: PullTraceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, Math.max(1, tokens.length - 1)]).range([LEFT_MARGIN, width - RIGHT_MARGIN]),
    [tokens.length, width],
  )

  const visibleCount = Math.min(tokens.length, revealCount)

  const area = useMemo(
    () =>
      d3
        .area<RibbonPoint>()
        .x(d => xScale(d.i))
        .y0(d => yScale(d.y) - thicknessScale(d.kl) / 2)
        .y1(d => yScale(d.y) + thicknessScale(d.kl) / 2)
        .curve(d3.curveCatmullRom.alpha(0.5)),
    [xScale, yScale, thicknessScale],
  )

  const points: RibbonPoint[] = tokens.slice(0, visibleCount).map((t, i) => ({ i, y: t.logRatio, kl: t.kl }))
  const zeroY = yScale(0)

  const segments = useMemo(() => {
    if (!dominantLensIds || !lensAccents || points.length < 2) return null
    const runs: { lensId: LensId; start: number; end: number }[] = []
    let runStart = 0
    for (let i = 1; i <= points.length; i++) {
      const lensId = i < points.length ? dominantLensIds[i] : null
      if (i === points.length || lensId !== dominantLensIds[runStart]) {
        // include one boundary point past the run's own end so adjacent
        // ribbons abut with no visible seam
        runs.push({ lensId: dominantLensIds[runStart], start: runStart, end: Math.min(i, points.length - 1) })
        runStart = i
      }
    }
    return runs
  }, [points, dominantLensIds, lensAccents])

  const placedPeaks = useMemo(() => {
    if (!showPeaks) return []
    const peaks = findPeaks(tokens, visibleCount, 3)
    return placePeakLabels(peaks, i => xScale(i), MIN_LABEL_GAP)
  }, [tokens, visibleCount, xScale, showPeaks])

  const maxDomain = yScale.domain()[1]
  const hoveredToken = hoveredFromTrace && hoveredTokenIndex !== null ? tokens[hoveredTokenIndex] : null

  if (points.length < 2) {
    return <div ref={containerRef} style={{ height: TRACE_HEIGHT }} />
  }

  const hoverGuideVisible = hoveredTokenIndex !== null && hoveredTokenIndex < visibleCount
  const slot = xScale(1) - xScale(0)

  const anchorFor = (x: number): 'start' | 'middle' | 'end' => {
    if (x < LEFT_MARGIN + 24) return 'start'
    if (x > width - RIGHT_MARGIN - 24) return 'end'
    return 'middle'
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg width={width} height={TRACE_HEIGHT} viewBox={`0 0 ${width} ${TRACE_HEIGHT}`} style={{ display: 'block', overflow: 'visible' }}>
        {/* hairline zero — the reference every excursion is measured against */}
        <line x1={LEFT_MARGIN} x2={width - RIGHT_MARGIN} y1={zeroY} y2={zeroY} stroke="var(--hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={2} y={zeroY} dy="0.32em" fontSize={8} fontFamily="Instrument Sans, sans-serif" fill="var(--ink-muted)">
          0
        </text>

        {/* axis extremes — always on now; the deeper narrative lives in the
            caption + info-button popover Panel renders above this chart */}
        <text x={2} y={LABEL_MARGIN} dy="0.32em" fontSize={7.5} fontFamily="Instrument Sans, sans-serif" fill="var(--ink-faint)">
          +{maxDomain.toFixed(1)}
        </text>
        <text x={2} y={TRACE_HEIGHT - LABEL_MARGIN} dy="0.32em" fontSize={7.5} fontFamily="Instrument Sans, sans-serif" fill="var(--ink-faint)">
          −{maxDomain.toFixed(1)}
        </text>

        {segments
          ? segments.map(run => (
              <path
                key={`${run.lensId}-${run.start}`}
                d={area(points.slice(run.start, run.end + 1)) ?? undefined}
                fill={lensAccents?.[run.lensId] ?? accent}
                opacity={0.6}
              />
            ))
          : <path d={area(points) ?? undefined} fill={accent} opacity={0.55} />}

        {hoverGuideVisible && (
          <line
            x1={xScale(hoveredTokenIndex!)}
            x2={xScale(hoveredTokenIndex!)}
            y1={0}
            y2={TRACE_HEIGHT}
            stroke="var(--ink)"
            strokeWidth={1}
            opacity={0.45}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* peak-word annotations — the trace's actual payoff: not just that
            it moved, but which word moved it */}
        {placedPeaks.map(p => {
          const edgeY = p.side === 'above' ? yScale(p.y) - thicknessScale(p.kl) / 2 : yScale(p.y) + thicknessScale(p.kl) / 2
          const labelY = p.side === 'above' ? LABEL_MARGIN - 5 : TRACE_HEIGHT - LABEL_MARGIN + 12
          const leaderStartY = p.side === 'above' ? labelY + 3 : labelY - 9
          return (
            <g key={p.i}>
              <line x1={p.x} x2={p.x} y1={leaderStartY} y2={edgeY} stroke="var(--hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text
                x={p.x}
                y={labelY}
                textAnchor={anchorFor(p.x)}
                fontSize={8}
                fontFamily="'JetBrains Mono', monospace"
                fill="var(--ink-muted)"
              >
                {p.word}
              </text>
            </g>
          )
        })}

        {/* invisible full-height hit targets — the ribbon itself is often too
            thin/off-center to hover precisely */}
        {points.map(p => (
          <rect
            key={p.i}
            x={xScale(p.i) - slot / 2}
            y={0}
            width={slot}
            height={TRACE_HEIGHT}
            fill="transparent"
            onMouseEnter={() => onHoverToken(p.i)}
            onMouseLeave={() => onHoverToken(null)}
          />
        ))}
      </svg>

      {hoveredToken && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 0,
            fontSize: 8,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--ink-muted)',
            background: 'var(--surface)',
            paddingLeft: 6,
            pointerEvents: 'none',
          }}
        >
          {hoveredToken.text.trim()} · {hoveredToken.logRatio >= 0 ? '+' : ''}
          {hoveredToken.logRatio.toFixed(2)} · {hoveredToken.kl.toFixed(2)} wide
        </div>
      )}
    </div>
  )
}
