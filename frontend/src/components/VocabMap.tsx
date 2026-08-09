// The vocab map (§5) — canvas, not SVG: at real vocabulary scale (~130k
// points) SVG DOM nodes would stall the browser and this redraws every token
// during streaming. D3 supplies scale functions and a quadtree for pointer
// hit-testing only; the point cloud itself is drawn directly to canvas.
//
// Light and dark mode use genuinely different encodings, not a color swap:
// light mode has no usable luminance headroom (paper-colored surface), so
// activated points read through saturation + density; dark mode's activated
// points glow, because luminance against a near-black surface actually reads.

import { useEffect, useRef } from 'react'
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

export default function VocabMap({ vocabPoints, activations, revealCount, accent, genState, isDark, mapLimits }: VocabMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const quadtreeRef = useRef<d3.Quadtree<VocabPoint> | null>(null)

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

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0) return

      const dpr = window.devicePixelRatio || 1
      const targetW = Math.round(width * dpr)
      const targetH = Math.round(height * dpr)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const [xLo, xHi] = mapLimits?.x ?? [0, 1]
      const [yLo, yHi] = mapLimits?.y ?? [0, 1]

      // A "contain" fit, not two independent scales: the clip box's width
      // and height aren't necessarily equal (Llama's is 0.6 x 0.85, for
      // instance), and stretching each axis independently to fill the
      // canvas would distort the cloud's actual shape — circles would
      // render as ellipses, clusters would look stretched along whichever
      // axis got squeezed more. One shared scale keeps it isotropic; the
      // shorter axis gets centered with slack instead of stretched to fit.
      const marginX = width * 0.03
      const marginY = height * 0.04
      const availW = width - 2 * marginX
      const availH = height - 2 * marginY
      const scale = Math.min(availW / (xHi - xLo), availH / (yHi - yLo))
      const drawW = (xHi - xLo) * scale
      const drawH = (yHi - yLo) * scale
      const offsetX = marginX + (availW - drawW) / 2
      const offsetY = marginY + (availH - drawH) / 2

      const xScale = d3.scaleLinear().domain([xLo, xHi]).range([offsetX, offsetX + drawW])
      const yScale = d3.scaleLinear().domain([yLo, yHi]).range([offsetY, offsetY + drawH])
      const inView = (p: VocabPoint) => p.x >= xLo && p.x <= xHi && p.y >= yLo && p.y <= yHi

      const styles = getComputedStyle(document.documentElement)
      const dormantColor = styles.getPropertyValue('--ink-faint').trim()

      // Dormant cloud — fine ink-dust on paper in light mode, dim dust
      // against warm black in dark mode. Never glows. Points outside the
      // clip box are skipped rather than drawn off-canvas and wasted —
      // with a tight box that can be most of the vocabulary.
      ctx.shadowBlur = 0
      ctx.fillStyle = dormantColor
      ctx.globalAlpha = isDark ? 0.5 : 0.35
      for (const p of vocabPoints) {
        if (!inView(p)) continue
        ctx.beginPath()
        ctx.arc(xScale(p.x), yScale(p.y), BASE_R, 0, Math.PI * 2)
        ctx.fill()
      }

      if (genState === 'idle') {
        ctx.globalAlpha = 1
        return
      }

      // Activated points — same accent color both modes, but a different
      // rendering strategy: saturation/density in light mode (no luminance
      // headroom to spend), a genuine glow in dark mode (luminance carries
      // the signal there).
      const visible = activations.filter(a => a.atTokenIndex < revealCount)
      if (isDark) {
        ctx.shadowColor = accent
        ctx.shadowBlur = 4
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.95
        for (const a of visible) {
          const p = vocabPoints[a.pointIndex]
          if (!p || !inView(p)) continue
          ctx.beginPath()
          ctx.arc(xScale(p.x), yScale(p.y), ACTIVATED_R * (0.7 + 0.5 * a.strength), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.shadowBlur = 0
      } else {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.9
        for (const a of visible) {
          const p = vocabPoints[a.pointIndex]
          if (!p || !inView(p)) continue
          ctx.beginPath()
          ctx.arc(xScale(p.x), yScale(p.y), ACTIVATED_R * (0.7 + 0.5 * a.strength), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [vocabPoints, activations, revealCount, accent, genState, isDark, mapLimits])

  return (
    <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative', flexShrink: 0, overflow: 'hidden', background: 'var(--surface)' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
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
