// The answer text as a plottable object (§4.1) — one styled span per token
// instead of a flat string slice. Opacity means surprisal for plain-ink
// tokens (every panel falls back to this — it's how baseline shows which
// words were more/less expected). Color: the mixed panel tints every token
// by whichever lens dominated it; a single lens panel has no "which lens"
// question to answer (it's already all one lens), so instead it tints its
// own already-emphasized words — the same ones surprisal already pushes
// toward the top of the tint range — toward its own accent, reusing that
// signal as the tint strength rather than introducing a second metric.
// Baseline has no accent worth popping toward, so it stays plain ink
// regardless. The genuine standouts (top of that same tint range) also go
// bold — a second, coarser cue on top of the continuous color/tint ones,
// reserved for a minority of words on purpose: bolding everything the
// tint touches would just make the passage heavier, not more legible.
//
// Once a token actually carries a lens color — mixed panel identity, or a
// lens panel's own tint — that color renders at full opacity, not the
// surprisal-driven fade. The color itself already carries the meaning
// there (which lens, or how much this word diverged, via the tint's own
// color-mix percentage); layering the surprisal fade on top of it as well
// just washed the color back out toward the background for every
// unsurprising token — which is most of them — leaving only the rare
// high-surprisal outlier looking like the "real" color and everything
// else looking like a faded mistake, even though they're the identical
// hex. Surprisal-as-opacity stays exactly as before for plain ink, where
// it's still the only signal being carried.
//
// Both the mixed panel's dominant-lens color and the lens panel's own
// divergence-tint highlight are run through textSafeAccent before they
// touch a token's `color` — several accents on their own sit under WCAG's
// 4.5:1 minimum for text against pollen's surfaces (magenta as low as
// 3.54:1 in light mode), which was a real, reported "hard to read"
// problem, not a theoretical one. Decorative uses of these same accents —
// dots, vocab map points, trace fills — stay on the raw, un-adjusted hex;
// only text goes through textSafeAccent, so "the same shade as the
// pollinator dots" holds (same hue/family) while the text itself reads
// noticeably more vividly than the dot's own muted fill.
//
// Rendered as real DOM spans (not canvas) so the answer stays selectable and
// copyable, per spec.

import * as d3 from 'd3'
import type { Token, LensId, GenState } from '../types'
import { textSafeAccent } from '../lib/textSafeAccent'

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
  isDark: boolean
}

// How far a lens panel's tint can go at maximum emphasis — short of a full
// 100% swap so a run of standout words still reads as text, not a wash of
// solid color.
const MAX_LENS_TINT = 0.65

// Bold kicks in only for the top slice of that same tint range — most
// tokens get some tint (surprisal is rarely exactly at the domain
// floor), but bolding all of them would read as "the whole panel is
// bold," not "these particular words are."
const BOLD_TINT_THRESHOLD = 0.6

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
  isDark,
}: TokenTextProps) {
  if (genState === 'idle') {
    return <span style={{ color: 'var(--ink-faint)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>—</span>
  }

  const visibleCount = Math.min(tokens.length, revealCount)
  // opacityScale's own range, not a hardcoded [0.55, 1] — reused here so
  // the tint-strength normalization can't silently drift out of sync with
  // whatever range buildSurprisalScale actually hands us.
  const [opacityMin, opacityMax] = opacityScale.range()

  return (
    <p style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: narrow ? 11.5 : 12.5, lineHeight: 1.65, color: 'var(--ink)' }}>
      {tokens.slice(0, visibleCount).map((t, i) => {
        const lensId = dominantLensIds?.[i]
        const opacity = opacityScale(t.surprisal)
        let color = 'var(--ink)'
        let bold = false
        if (lensId && lensAccents) {
          // Mixed panel: color is lens identity, full stop — unaffected by
          // this token's own surprisal. textSafeAccent, not the raw
          // decorative accent (see file comment).
          color = textSafeAccent(lensAccents[lensId], isDark)
        } else if ('logRatio' in t) {
          // A lens panel's own token (baseline tokens have no logRatio and
          // fall through to plain ink instead).
          const tint = opacityMax > opacityMin ? (opacity - opacityMin) / (opacityMax - opacityMin) : 0
          if (tint > 0) color = `color-mix(in srgb, ${textSafeAccent(accent, isDark)} ${Math.round(tint * MAX_LENS_TINT * 100)}%, var(--ink))`
          bold = tint > BOLD_TINT_THRESHOLD
        }
        // Plain ink still fades with surprisal; an actual lens color is
        // never diluted by it (see file comment) — that's what kept
        // reading as "most of the passage is a duller, different orange."
        const spanOpacity = color === 'var(--ink)' ? opacity : 1
        return (
          <span
            key={i}
            onMouseEnter={() => onHoverToken(i)}
            onMouseLeave={() => onHoverToken(null)}
            style={{
              color,
              opacity: spanOpacity,
              fontWeight: bold ? 700 : 400,
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
