// A full-width breaker between a turn's answer text and its traces — the
// same role the local app's own QuestionBar plays between the PanelTop row
// and the PanelBottom row (same bordered-segment layout, same visual
// language), adapted for a gallery that has nothing to submit: the middle
// slot is a plain readout of the question instead of an editable input.
// Skip animations sits where New Chat sits in the local app (far left,
// deliberately apart from the primary action); Replay and Follow up sit
// where Submit sits (far right).
//
// Persisted, not per-turn: "Skip animations" flips the same global
// preference every useReveal ticker already watches (see
// useSkipAnimations), so it also completes whatever's revealing right now
// and starts every future reveal already complete — not just this turn's.
// It only shows while there's something left to skip; once done, Replay
// (and Follow up, if there's a next turn) take its place.
import type { CSSProperties } from 'react'
import { useSkipAnimations } from '../../lib/useSkipAnimations'

const textControlStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
  whiteSpace: 'nowrap',
}

const primaryButtonStyle: CSSProperties = {
  background: 'none',
  border: '1px solid var(--hairline)',
  borderRadius: 0,
  cursor: 'pointer',
  padding: '7px 16px',
  fontFamily: 'Instrument Sans, sans-serif',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  whiteSpace: 'nowrap',
}

export interface GalleryQuestionBarProps {
  question: string
  done: boolean
  // Toggle cards have no single "replay the whole thing" or "next turn"
  // concept (each lens reveals independently, on its own toggle, and
  // there's only ever one turn) — omitting these two just leaves that side
  // of the bar with nothing but Skip while it's relevant, matching what
  // there actually is to do.
  replay?: () => void
  hasNext?: boolean
  onFollowUp?: () => void
  loadingNext?: boolean
}

export default function GalleryQuestionBar({ question, done, replay, hasNext, onFollowUp, loadingNext }: GalleryQuestionBarProps) {
  const { setSkip } = useSkipAnimations()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        minHeight: 44,
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface-raised)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', flexShrink: 0, borderRight: '1px solid var(--hairline)' }}>
        {!done && (
          <button onClick={() => setSkip(true)} style={textControlStyle}>
            Skip animations →
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', minWidth: 0 }}>
        <span
          style={{
            fontFamily: "'Lora', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--ink-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {question}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px', flexShrink: 0, borderLeft: '1px solid var(--hairline)' }}>
        {done && (
          <>
            {replay && (
              <button onClick={replay} style={textControlStyle}>
                Replay
              </button>
            )}
            {hasNext && onFollowUp && (
              <button onClick={onFollowUp} disabled={loadingNext} style={{ ...primaryButtonStyle, cursor: loadingNext ? 'wait' : 'pointer' }}>
                {loadingNext ? 'Loading…' : 'Follow up →'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
