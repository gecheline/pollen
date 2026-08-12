// The pill row for toggling individual pollinators on/off — shared by all
// four card layouts now (used to be 2+2-only). One pill per lens, filled
// with its own accent when active, hollow when not; larger dot to match
// the rest of this pass's "make the pollinator dots bigger" change.

import type { PanelDef } from '../../types'

export default function PollinatorToggleBar({ lenses, visible, onToggle }: { lenses: PanelDef[]; visible: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {lenses.map(lens => {
        const active = visible.has(lens.id)
        return (
          <button
            key={lens.id}
            onClick={() => onToggle(lens.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'none',
              border: '1px solid var(--hairline)',
              borderRadius: 0,
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                flexShrink: 0,
                background: active ? lens.accent : 'transparent',
                border: active ? 'none' : '1px solid var(--ink-faint)',
              }}
            />
            <span
              style={{
                fontFamily: "'Lora', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 13,
                color: active ? 'var(--ink)' : 'var(--ink-muted)',
              }}
            >
              {lens.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
