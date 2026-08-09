// The answer text as a plottable object (§4.1) — one styled span per token
// instead of a flat string slice. Color always means lens identity (mixed
// panel only); opacity always means surprisal (every panel). The two never
// share a channel: a mixed-panel token's color comes entirely from its
// dominant lens, its opacity entirely from its own surprisal.
//
// Rendered as real DOM spans (not canvas) so the answer stays selectable and
// copyable, per spec.

import * as d3 from 'd3'
import type { Token, LensId, GenState } from '../types'

interface TokenTextProps {
  tokens: Token[]
  dominantLensIds?: LensId[] // parallel array, mixed panel only
  lensAccents?: Record<LensId, string>
  opacityScale: d3.ScaleLinear<number, number>
  revealCount: number
  genState: GenState
  accent: string // caret color while generating
  hoveredTokenIndex: number | null
  onHoverToken: (i: number | null) => void
  narrow: boolean
}

export default function TokenText({
  tokens,
  dominantLensIds,
  lensAccents,
  opacityScale,
  revealCount,
  genState,
  accent,
  hoveredTokenIndex,
  onHoverToken,
  narrow,
}: TokenTextProps) {
  if (genState === 'idle') {
    return <span style={{ color: 'var(--ink-faint)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>—</span>
  }

  const visibleCount = Math.min(tokens.length, revealCount)

  return (
    <p style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: narrow ? 10 : 11, lineHeight: 1.65, color: 'var(--ink)' }}>
      {tokens.slice(0, visibleCount).map((t, i) => {
        const lensId = dominantLensIds?.[i]
        const color = lensId && lensAccents ? lensAccents[lensId] : 'var(--ink)'
        return (
          <span
            key={i}
            onMouseEnter={() => onHoverToken(i)}
            onMouseLeave={() => onHoverToken(null)}
            style={{
              color,
              opacity: opacityScale(t.surprisal),
              background: hoveredTokenIndex === i ? 'color-mix(in srgb, var(--ink) 10%, transparent)' : 'transparent',
              transition: 'background 0.1s',
            }}
          >
            {t.text}
          </span>
        )
      })}
      {genState === 'generating' && visibleCount < tokens.length && (
        <span
          style={{
            display: 'inline-block',
            width: 1.5,
            height: '1em',
            background: accent,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
          }}
        />
      )}
    </p>
  )
}
