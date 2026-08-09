// Skip / replay, and "follow up" once a turn's reveal is done — the same
// three controls every turn-based layout (turns, mixed_featured,
// mixed_inline) needs below its panels, factored once rather than
// tripled. "Someone comparing traces shouldn't have to sit through it
// again" (spec §5) is why Skip exists at all; Replay is the same idea in
// the other direction, for someone who wants to watch it again.

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
  skip,
  replay,
  hasNext,
  onFollowUp,
  loadingNext,
}: {
  done: boolean
  skip: () => void
  replay: () => void
  hasNext: boolean
  onFollowUp: () => void
  loadingNext: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 2px 32px' }}>
      {!done && (
        <button onClick={skip} style={textControlStyle}>
          Skip
        </button>
      )}
      {done && (
        <button onClick={replay} style={textControlStyle}>
          Replay
        </button>
      )}
      {done && hasNext && (
        <button onClick={onFollowUp} disabled={loadingNext} style={{ ...primaryButtonStyle, cursor: loadingNext ? 'wait' : 'pointer' }}>
          {loadingNext ? 'Loading…' : 'Follow up →'}
        </button>
      )}
    </div>
  )
}
