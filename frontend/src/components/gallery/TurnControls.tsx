// Split in two, not one control row at the bottom: Skip only matters while
// something's still animating, and needs to be visible *before* a viewer
// has scrolled past a tall card to find it — otherwise "skip the wait"
// arrives only after most of the wait is already over. SkipControl renders
// right below the title/explainer, above the panels. AfterTurnControls
// (Replay, and Follow up once a turn's done) stays below the panels,
// where "what's next" belongs.
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

export function SkipControl({ done, skip }: { done: boolean; skip: () => void }) {
  if (done) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={skip} style={textControlStyle}>
        Skip animation →
      </button>
    </div>
  )
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
