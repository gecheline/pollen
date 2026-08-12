// Per-card "observations" sidebar — a place for editorial notes about what a
// given conversation shows, opened on demand rather than always taking up
// room next to the panels. Overlays the page (backdrop + fixed panel)
// instead of pushing content around, so it works the same on a wide desktop
// layout or a stacked mobile one. Lorem ipsum for now — real, per-card copy
// comes later.

const PLACEHOLDER_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
]

export default function ObservationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 40 }} />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(360px, 100vw)',
          background: 'var(--surface-raised)',
          borderLeft: '1px solid var(--hairline)',
          padding: '20px 22px',
          overflowY: 'auto',
          zIndex: 41,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Observations
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 20.5, lineHeight: 1, color: 'var(--ink-muted)' }}
          >
            ×
          </button>
        </div>
        {PLACEHOLDER_PARAGRAPHS.map((p, i) => (
          <p key={i} style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.65, color: 'var(--ink-muted)' }}>
            {p}
          </p>
        ))}
      </aside>
    </>
  )
}
