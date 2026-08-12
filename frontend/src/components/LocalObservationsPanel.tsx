// The local app's own Observations sidebar — editable, unlike the
// gallery's read-only version (curated copy for a fixed set of cards):
// this is the user's own free-text notes on the conversation they just
// ran, which App.tsx threads into the Save payload alongside the request
// and frames (see handleSaveCapture) so a capture file is a complete,
// self-contained record. The eventual point: if the gallery opens up to
// submissions, a submission *is* someone's capture file — their
// observations travel with it rather than needing a separate form.
//
// Controlled from outside (value/onChange), not its own state — App.tsx
// owns `observations` the same way it owns `question`, since Save needs
// to read the current value regardless of whether the sidebar happens to
// be open at that moment.

interface LocalObservationsPanelProps {
  open: boolean
  onClose: () => void
  value: string
  onChange: (value: string) => void
}

export default function LocalObservationsPanel({ open, onClose, value, onChange }: LocalObservationsPanelProps) {
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
          display: 'flex',
          flexDirection: 'column',
          zIndex: 41,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Observations</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 20.5, lineHeight: 1, color: 'var(--ink-muted)' }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-faint)' }}>
          Your own notes on this conversation — saved alongside it when you hit Save.
        </p>
        <textarea
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="What stood out here?"
          style={{
            flex: 1,
            width: '100%',
            resize: 'none',
            background: 'none',
            border: '1px solid var(--hairline)',
            outline: 'none',
            borderRadius: 0,
            padding: '10px 12px',
            fontFamily: 'Instrument Sans, sans-serif',
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--ink)',
            boxSizing: 'border-box',
          }}
        />
      </aside>
    </>
  )
}
