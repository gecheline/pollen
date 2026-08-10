// The answer text as a plottable object (§4.1) — one styled span per token
// instead of a flat string slice. Opacity always means surprisal (every
// panel). Color: the mixed panel tints every token by whichever lens
// dominated it; a single lens panel has no "which lens" question to answer
// (it's already all one lens), so instead it tints its own already-
// emphasized words — the same ones surprisal already pushes to full
// opacity — toward its own accent, reusing that exact opacity signal as
// the tint strength rather than introducing a second metric. Baseline has
// no accent worth popping toward, so it stays plain ink regardless.
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
  accent: string // caret color while generating; also the lens-panel tint color
  hoveredTokenIndex: number | null
  onHoverToken: (i: number | null) => void
  narrow: boolean
}

// How far a lens panel's tint can go at maximum emphasis — short of a full
// 100% swap so a run of standout words still reads as text, not a wash of
// solid color.
const MAX_LENS_TINT = 0.65

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
  // opacityScale's own range, not a hardcoded [0.55, 1] — reused here so
  // the tint-strength normalization can't silently drift out of sync with
  // whatever range buildSurprisalScale actually hands us.
  const [opacityMin, opacityMax] = opacityScale.range()

  return (
    <p style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: narrow ? 10 : 11, lineHeight: 1.65, color: 'var(--ink)' }}>
      {tokens.slice(0, visibleCount).map((t, i) => {
        const lensId = dominantLensIds?.[i]
        const opacity = opacityScale(t.surprisal)
        let color = 'var(--ink)'
        if (lensId && lensAccents) {
          // Mixed panel: color is lens identity, full stop — unaffected by
          // this token's own surprisal.
          color = lensAccents[lensId]
        } else if ('logRatio' in t) {
          // A lens panel's own token (baseline tokens have no logRatio and
          // fall through to plain ink instead).
          const tint = opacityMax > opacityMin ? (opacity - opacityMin) / (opacityMax - opacityMin) : 0
          if (tint > 0) color = `color-mix(in srgb, ${accent} ${Math.round(tint * MAX_LENS_TINT * 100)}%, var(--ink))`
        }
        return (
          <span
            key={i}
            onMouseEnter={() => onHoverToken(i)}
            onMouseLeave={() => onHoverToken(null)}
            style={{
              color,
              opacity,
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
