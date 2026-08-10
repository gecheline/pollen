// The vocab map (§5) — canvas, not SVG: at real vocabulary scale (~130k
// points) SVG DOM nodes would stall the browser and this redraws every token
// during streaming. D3 supplies scale functions and a quadtree for pointer
// hit-testing only; the point cloud itself is drawn directly to canvas.
//
// Two stacked canvases, not one: the dormant cloud (all ~130k points) only
// actually changes when vocabPoints/mapLimits/isDark change — basically
// never during a single reveal. Redrawing it on every revealCount tick (as
// a single combined canvas used to) meant every ~12ms tick redid a
// 130k-point loop regardless of how few points had actually changed, and
// with several panels animating at once (a reveal shares one tick across a
// whole turn) that cost multiplied by panel count — the real reason
// multi-panel cards felt slower than the tick rate alone would suggest.
// The static layer now draws once per real change; each tick only touches
// the small activated-points layer on top of it.
//
// Light and dark mode use genuinely different encodings, not a color swap:
// light mode has no usable luminance headroom (paper-colored surface), so
// activated points read through saturation + density; dark mode's activated
// points glow, because luminance against a near-black surface actually reads.

import { useCallback, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { VocabPoint, VocabActivation, GenState } from '../types'
import type { AxisLimits } from '../lib/mapLimits'

const BASE_R = 0.65 // dormant-cloud dot radius, css px
const ACTIVATED_R = 1.7

interface VocabMapProps {
  vocabPoints: VocabPoint[]
  activations: VocabActivation[]
  revealCount: number
  accent: string
  genState: GenState
  isDark: boolean
  mapLimits?: AxisLimits // defaults to the full [0,1]x[0,1] cloud when absent
}

interface Transform {
  width: number
  height: number
  dpr: number
  xLo: number
  xHi: number
  yLo: number
  yHi: number
  xScale: d3.ScaleLinear<number, number>
  yScale: d3.ScaleLinear<number, number>
}

function computeTransform(width: number, height: number, mapLimits?: AxisLimits): Transform {
  const dpr = window.devicePixelRatio || 1
  const [xLo, xHi] = mapLimits?.x ?? [0, 1]
  const [yLo, yHi] = mapLimits?.y ?? [0, 1]

  // A "contain" fit, not two independent scales: the clip box's width and
  // height aren't necessarily equal (Llama's is 0.6 x 0.85, for instance),
  // and stretching each axis independently to fill the canvas would
  // distort the cloud's actual shape — circles would render as ellipses,
  // clusters would look stretched along whichever axis got squeezed more.
  // One shared scale keeps it isotropic; the shorter axis gets centered
  // with slack instead of stretched to fit.
  const marginX = width * 0.03
  const marginY = height * 0.04
  const availW = width - 2 * marginX
  const availH = height - 2 * marginY
  const scale = Math.min(availW / (xHi - xLo), availH / (yHi - yLo))
  const drawW = (xHi - xLo) * scale
  const drawH = (yHi - yLo) * scale
  const offsetX = marginX + (availW - drawW) / 2
  const offsetY = marginY + (availH - drawH) / 2

  return {
    width,
    height,
    dpr,
    xLo,
    xHi,
    yLo,
    yHi,
    xScale: d3.scaleLinear().domain([xLo, xHi]).range([offsetX, offsetX + drawW]),
    yScale: d3.scaleLinear().domain([yLo, yHi]).range([offsetY, offsetY + drawH]),
  }
}

function sizeCanvas(canvas: HTMLCanvasElement, t: Transform) {
  const targetW = Math.round(t.width * t.dpr)
  const targetH = Math.round(t.height * t.dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }
  const ctx = canvas.getContext('2d')
  ctx?.setTransform(t.dpr, 0, 0, t.dpr, 0, 0)
}

export default function VocabMap({ vocabPoints, activations, revealCount, accent, genState, isDark, mapLimits }: VocabMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const staticCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement>(null)
  const quadtreeRef = useRef<d3.Quadtree<VocabPoint> | null>(null)
  const transformRef = useRef<Transform | null>(null)

  // Quadtree rebuilt only when the point cloud itself changes (once per
  // generation) — cheap, and it's the mandated tool for pointer lookup even
  // though this pass doesn't yet define what hovering a point should show.
  useEffect(() => {
    quadtreeRef.current = d3
      .quadtree<VocabPoint>()
      .x(d => d.x)
      .y(d => d.y)
      .addAll(vocabPoints)
  }, [vocabPoints])

  // Activated points only — cheap, since activations.length is always
  // small relative to the ~130k-point vocabulary. Reuses whatever
  // transform the static layer last computed rather than recomputing it,
  // so a tick that doesn't touch layout stays layout-free.
  const drawActiveLayer = useCallback(() => {
    const canvas = activeCanvasRef.current
    const t = transformRef.current
    if (!canvas || !t) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(t.dpr, 0, 0, t.dpr, 0, 0)
    ctx.clearRect(0, 0, t.width, t.height)
    if (genState === 'idle') return

    const inView = (p: VocabPoint) => p.x >= t.xLo && p.x <= t.xHi && p.y >= t.yLo && p.y <= t.yHi
    const visible = activations.filter(a => a.atTokenIndex < revealCount)

    // Same accent color both modes, but a different rendering strategy:
    // saturation/density in light mode (no luminance headroom to spend), a
    // genuine glow in dark mode (luminance carries the signal there).
    if (isDark) {
      ctx.shadowColor = accent
      ctx.shadowBlur = 4
    }
    ctx.fillStyle = accent
    ctx.globalAlpha = isDark ? 0.95 : 0.9
    for (const a of visible) {
      const p = vocabPoints[a.pointIndex]
      if (!p || !inView(p)) continue
      ctx.beginPath()
      ctx.arc(t.xScale(p.x), t.yScale(p.y), ACTIVATED_R * (0.7 + 0.5 * a.strength), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }, [vocabPoints, activations, revealCount, accent, genState, isDark])

  // Dormant cloud — fine ink-dust on paper in light mode, dim dust against
  // warm black in dark mode. Never glows. Redrawn only when the cloud
  // itself, the clip box, dark mode, or the container size actually
  // change — this is the layer that used to redraw every ~12ms tick for
  // no reason.
  useEffect(() => {
    const container = containerRef.current
    const staticCanvas = staticCanvasRef.current
    const activeCanvas = activeCanvasRef.current
    if (!container || !staticCanvas || !activeCanvas) return

    const draw = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0) return

      const t = computeTransform(width, height, mapLimits)
      transformRef.current = t
      sizeCanvas(staticCanvas, t)
      sizeCanvas(activeCanvas, t)

      const ctx = staticCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)

      const inView = (p: VocabPoint) => p.x >= t.xLo && p.x <= t.xHi && p.y >= t.yLo && p.y <= t.yHi
      const styles = getComputedStyle(document.documentElement)
      const dormantColor = styles.getPropertyValue('--ink-faint').trim()

      // Points outside the clip box are skipped rather than drawn off-canvas
      // and wasted — with a tight box that can be most of the vocabulary.
      ctx.fillStyle = dormantColor
      ctx.globalAlpha = isDark ? 0.5 : 0.35
      for (const p of vocabPoints) {
        if (!inView(p)) continue
        ctx.beginPath()
        ctx.arc(t.xScale(p.x), t.yScale(p.y), BASE_R, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Size (and therefore the transform) may have just changed — keep
      // the activated layer in sync rather than leaving it stale until its
      // own next tick.
      drawActiveLayer()
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [vocabPoints, mapLimits, isDark, drawActiveLayer])

  useEffect(() => {
    drawActiveLayer()
  }, [drawActiveLayer])

  return (
    <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative', flexShrink: 0, overflow: 'hidden', background: 'var(--surface)' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        <canvas ref={staticCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
        <canvas ref={activeCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      </div>
      {genState === 'generating' && (
        <span
          style={{
            position: 'absolute',
            left: 5,
            bottom: 5,
            fontSize: 7,
            letterSpacing: '1.3px',
            fontFamily: 'Instrument Sans, sans-serif',
            color: accent,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        >
          ACTIVATING
        </span>
      )}
    </div>
  )
}
