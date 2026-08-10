// "Skip this one reveal" used to live here as its own per-card control
// (SkipControl, above the panels). It's now a single persistent "Skip
// animations" toggle in the gallery header (see useSkipAnimations) instead —
// once on, every reveal on every card starts already complete until it's
// turned back off, so a per-card one-off control would just be a second,
// redundant way to do the same thing. What's left here is only the
// after-a-reveal controls: Replay, and Follow up once a turn's done.
import type { CSSProperties } from 'react'

const textControlStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
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
}

export default function TurnControls({
  done,
  replay,
  hasNext,
  onFollowUp,
  loadingNext,
}: {
  done: boolean
  replay: () => void
  hasNext: boolean
  onFollowUp: () => void
  loadingNext: boolean
}) {
  if (!done) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 2px 32px' }}>
      <button onClick={replay} style={textControlStyle}>
        Replay
      </button>
      {hasNext && (
        <button onClick={onFollowUp} disabled={loadingNext} style={{ ...primaryButtonStyle, cursor: loadingNext ? 'wait' : 'pointer' }}>
          {loadingNext ? 'Loading…' : 'Follow up →'}
        </button>
      )}
    </div>
  )
}
