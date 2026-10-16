// The "standout words" list for one panel column — the plain-language
// middle step between the answer text (always shown) and the map + trace
// charts (opt-in, under the hood).
//
// Which words: the same ones the answer text highlights. TokenText tints
// and bolds a lens panel's words by surprisal (how unlikely the word was
// to this pollinator itself), so ranking by surprisal here, highest first,
// lists exactly the words that glow brightest above. Function words ("a",
// "of", "however") are skipped — they're never what makes a choice
// interesting.
//
// What's shown per word: how this pollinator's odds of picking it compare
// with the baseline model's odds for the same word in the same spot. Note
// this can go either way — a standout word isn't necessarily one the
// pollinator pushed toward; sometimes baseline was even likelier to say it.
//
// Both odds come straight from the token data, no rebake needed: the
// backend's surprisal is -ln p(token) under this panel's own distribution
// and logRatio is ln p_panel(token) - ln p_baseline(token) (pollinator.py),
// so p_panel = e^-surprisal and p_baseline = p_panel / e^logRatio.
//
// Only counts tokens revealed so far, so the list fills in as the answer
// types out rather than spoiling words that haven't appeared yet.

import type { PanelData } from '../../types'
import type { Hover } from '../hover'
import { textSafeAccent } from '../../lib/textSafeAccent'

const HAS_WORD_CHAR = /[A-Za-z0-9]/
const MAX_WORDS = 6

// Grammar and connective words — never interesting as a standout, however
// surprising they happen to be at one spot.
const FUNCTION_WORDS = new Set(
  (
    'a an the and or but nor so yet if then than that this these those there here ' +
    'of in on at to for from by with without within into onto upon about above below over under ' +
    'between among through during before after since until while as like ' +
    'i me my mine we us our you your he him his she her it its they them their ' +
    'is am are was were be been being do does did have has had will would can could ' +
    'shall should may might must not no yes ' +
    'what which who whom whose when where why how ' +
    'all any each every some such both either neither more most other another ' +
    'also just only even very too much many however therefore thus hence moreover ' +
    'furthermore additionally indeed rather instead perhaps s'
  ).split(' '),
)

interface Shift {
  i: number
  word: string
  surprisal: number
  pPanel: number
  pBaseline: number
}

// Tokens are often word fragments ("sym" + "phony", "Art" + "'s"), so the
// label is the whole word the token sits in — glued-on neighbours with no
// whitespace between them — trimmed of surrounding punctuation. The
// numbers still belong to the token itself.
function wordAround(tokens: { text: string }[], i: number, n: number): string {
  const glued = (left: string, right: string) => !/\s$/.test(left) && !/^\s/.test(right)
  let start = i
  while (start > 0 && glued(tokens[start - 1].text, tokens[start].text) && HAS_WORD_CHAR.test(tokens[start - 1].text)) start--
  let end = i
  while (end + 1 < n && glued(tokens[end].text, tokens[end + 1].text) && /^[A-Za-z0-9']/.test(tokens[end + 1].text)) end++
  const raw = tokens.slice(start, end + 1).map(t => t.text).join('')
  return raw.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
}

function topShifts(data: PanelData, revealCount: number): Shift[] {
  if (data.kind === 'baseline') return []
  const best = new Map<string, Shift>()
  const n = Math.min(data.tokens.length, revealCount)
  for (let i = 0; i < n; i++) {
    const t = data.tokens[i]
    if (!HAS_WORD_CHAR.test(t.text)) continue
    const word = wordAround(data.tokens, i, n)
    if (!word || !/[A-Za-z]/.test(word)) continue
    const key = word.toLowerCase()
    if (FUNCTION_WORDS.has(key)) continue
    const prev = best.get(key)
    if (prev && prev.surprisal >= t.surprisal) continue
    const pPanel = Math.exp(-t.surprisal)
    best.set(key, { i, word, surprisal: t.surprisal, pPanel, pBaseline: pPanel / Math.exp(t.logRatio) })
  }
  // Pick by surprisal (so these are the highlighted words), then order
  // the picks from most pollinator-favored to most baseline-favored.
  return [...best.values()]
    .sort((a, b) => b.surprisal - a.surprisal)
    .slice(0, MAX_WORDS)
    .sort((a, b) => b.pPanel / b.pBaseline - a.pPanel / a.pBaseline)
}

// "3× likelier" from whichever side was likelier; near-equal odds read as
// a tie rather than a meaningless "1.1×".
function verdict(pPanel: number, pBaseline: number, panelLabel: string): string {
  const r = pPanel / pBaseline
  if (r < 1.25 && r > 0.8) return 'about the same odds'
  const mult = r >= 1 ? r : 1 / r
  const text = mult >= 100 ? '100×+' : `${mult < 10 ? mult.toFixed(1) : Math.round(mult)}×`
  return r >= 1 ? `${text} likelier from ${panelLabel}` : `${text} likelier from baseline`
}

function formatPercent(p: number): string {
  const pct = p * 100
  if (pct < 0.1) return '<0.1%'
  if (pct < 10) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

// Bars are scaled to the larger of the row's two odds, not to 100% —
// standout words are low-odds by nature (often under 5%), so absolute
// bars would just be two slivers. The percent beside each keeps the
// absolute value readable.
function OddsBar({ label, p, max, color }: { label: string; p: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--ink-faint)' }}>
      <span style={{ width: 52, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: 'var(--surface-inset)', minWidth: 30 }}>
        <div style={{ width: `${Math.max((p / max) * 100, 1)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ width: 40, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatPercent(p)}</span>
    </div>
  )
}

export default function WordShifts({
  data,
  label,
  accent,
  revealCount,
  isDark,
  narrow,
  onHover,
}: {
  data: PanelData
  label: string
  accent: string
  revealCount: number
  isDark: boolean
  narrow: boolean
  onHover: (h: Hover | null) => void
}) {
  if (data.kind === 'baseline') {
    return (
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
        The plain model, with no pollinator. Every other column is compared against this one.
      </p>
    )
  }

  const shifts = topShifts(data, revealCount)
  if (shifts.length === 0) {
    return <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>—</p>
  }

  const wordColor = textSafeAccent(accent, isDark)
  const shortLabel = label.toLowerCase()

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: narrow ? 10 : 12 }}>
      {shifts.map((s, idx) => {
        const max = Math.max(s.pPanel, s.pBaseline)
        // A hairline where the list flips from pollinator-favored to
        // baseline-favored words.
        const flips = idx > 0 && shifts[idx - 1].pPanel >= shifts[idx - 1].pBaseline && s.pPanel < s.pBaseline
        return (
          <li
            key={s.i}
            onMouseEnter={() => onHover({ index: s.i, source: 'text' })}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: 'default', ...(flips ? { borderTop: '1px solid var(--hairline)', paddingTop: narrow ? 10 : 12 } : {}) }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: narrow ? 12 : 13,
                  fontWeight: 700,
                  color: wordColor,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.word}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{verdict(s.pPanel, s.pBaseline, shortLabel)}</span>
            </div>
            <OddsBar label="baseline" p={s.pBaseline} max={max} color="var(--ink-faint)" />
            <OddsBar label={shortLabel} p={s.pPanel} max={max} color={accent} />
          </li>
        )
      })}
    </ol>
  )
}
