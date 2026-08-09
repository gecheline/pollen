// Left rail — pollinator list, weight sliders, Combine/Weight/History
// controls. Moved out of App.tsx for hygiene; content and behavior are
// unchanged from the Figma Make export (out of scope for this
// visualization pass) except for the working "+ Custom pollinator" form
// added here.

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import type { Lens } from '../types'
import Label from './Label'

interface RailProps {
  lenses: Lens[]
  setLenses: Dispatch<SetStateAction<Lens[]>>
  combine: string
  setCombine: (v: string) => void
  weightMode: string
  setWeightMode: (v: string) => void
  history: string
  setHistory: (v: string) => void
}

// Distinct from every preset lens's own accent (and from baseline/mixed) so
// a custom pollinator never silently reuses a color already meaning
// something else in the rail, on the maps, or in the traces.
const CUSTOM_ACCENTS = ['#a8863f', '#4f6b8f', '#8f4f8f', '#4f8f6b', '#8f6b4f', '#6b4f8f']

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom'
}

function uniqueId(base: string, existingIds: string[]): string {
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// Same interaction shape as TopBar's Save control: idle button -> inline
// fields (Enter on the name field submits, Escape cancels) -> back to
// idle. Owns only this transient form state; the actual lens list lives in
// App.tsx via setLenses, same as toggling or re-weighting an existing one.
function AddCustomLens({ lenses, setLenses }: { lenses: Lens[]; setLenses: Dispatch<SetStateAction<Lens[]>> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const close = () => {
    setOpen(false)
    setName('')
    setDesc('')
  }

  const commit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const id = uniqueId(slugify(trimmedName), lenses.map(l => l.id))
    const accent = CUSTOM_ACCENTS[lenses.length % CUSTOM_ACCENTS.length]
    const newLens: Lens = {
      id,
      name: trimmedName,
      desc: desc.trim() || `You are ${trimmedName}.`,
      accent,
      weight: 5,
      active: true,
    }
    setLenses(ls => [...ls, newLens])
    close()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '10px 14px',
          textAlign: 'left',
          fontSize: 11,
          color: 'var(--ink-faint)',
          letterSpacing: '0.04em',
        }}
      >
        + Custom pollinator
      </button>
    )
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    background: 'none',
    border: '1px solid var(--hairline)',
    outline: 'none',
    borderRadius: 0,
    padding: '4px 6px',
    fontFamily: 'Instrument Sans, sans-serif',
    fontSize: 11,
    color: 'var(--ink)',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') close()
          if (e.key === 'Enter') commit()
        }}
        placeholder="name"
        style={inputStyle}
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') close()
        }}
        placeholder="system prompt (optional)"
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', fontSize: 10, lineHeight: 1.4 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={commit}
          disabled={!name.trim()}
          style={{
            background: 'none',
            border: '1px solid var(--hairline)',
            cursor: name.trim() ? 'pointer' : 'default',
            padding: '3px 9px',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: name.trim() ? 'var(--ink)' : 'var(--ink-faint)',
            borderRadius: 0,
          }}
        >
          Add
        </button>
        <button
          onClick={close}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '3px 9px',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function LensRail({ lenses, setLenses, combine, setCombine, weightMode, setWeightMode, history, setHistory }: RailProps) {
  const toggle = (id: string) => setLenses(ls => ls.map(l => (l.id === id ? { ...l, active: !l.active } : l)))

  const setWeight = (id: string, v: number) => setLenses(ls => ls.map(l => (l.id === id ? { ...l, weight: v } : l)))

  // Combining/weighting/history only mean anything once there's more than
  // one active pollinator to combine — with zero or one, "Mixed" doesn't
  // exist as a panel at all (see App.tsx's panels useMemo), so showing
  // these controls would just be UI for a feature that isn't currently
  // doing anything.
  const activeCount = lenses.filter(l => l.active).length
  const showCombineControls = activeCount > 1

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-raised)',
        borderRight: '1px solid var(--hairline)',
        overflow: 'hidden',
      }}
    >
      {/* Pollinator list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {lenses.map(lens => (
          <div key={lens.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
            <button
              onClick={() => toggle(lens.id)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: lens.active ? 'none' : '1px solid var(--ink-faint)',
                  background: lens.active ? lens.accent : 'transparent',
                  transition: 'background 0.15s',
                }}
              />
              <span
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: lens.active ? 'var(--ink)' : 'var(--ink-muted)',
                  transition: 'color 0.15s',
                }}
              >
                {lens.name}
              </span>
            </button>

            {lens.active && (
              <div style={{ padding: '0 14px 11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <Label style={{ minWidth: 28, whiteSpace: 'nowrap' }}>WT {lens.weight}</Label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={lens.weight}
                    onChange={e => setWeight(lens.id, +e.target.value)}
                    style={{ flex: 1, margin: 0 }}
                  />
                </div>
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 10,
                    lineHeight: 1.55,
                    color: 'var(--ink-muted)',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {lens.desc}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 9,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-muted)',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    style={{
                      background: 'none',
                      border: '1px solid var(--hairline)',
                      cursor: 'pointer',
                      padding: '2px 7px',
                      fontSize: 9,
                      letterSpacing: '0.06em',
                      color: 'var(--ink-muted)',
                      borderRadius: 0,
                    }}
                  >
                    + .md
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <AddCustomLens lenses={lenses} setLenses={setLenses} />
      </div>

      {/* Controls */}
      {showCombineControls && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--hairline)',
            padding: '13px 14px 15px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <Label style={{ marginBottom: 4 }}>Combine</Label>
            <select value={combine} onChange={e => setCombine(e.target.value)} style={{ width: '100%' }}>
              <option>Find common ground</option>
              <option>Amplify disagreement</option>
              <option>Weighted average</option>
            </select>
            {combine === 'Amplify disagreement' && (
              <p style={{ margin: '5px 0 0', fontSize: 9, lineHeight: 1.5, color: 'var(--ink-muted)' }}>
                Explores the edges — may produce less-coherent output by design.
              </p>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <Label>Weight</Label>
              <span style={{ fontSize: 8, color: 'var(--ink-faint)' }}>Independent</span>
            </div>
            <select value={weightMode} onChange={e => setWeightMode(e.target.value)} style={{ width: '100%' }}>
              <option>Equal weight</option>
              <option>Manual</option>
              <option>Semantic similarity</option>
            </select>
          </div>

          <div>
            <Label style={{ marginBottom: 4 }}>History</Label>
            <select value={history} onChange={e => setHistory(e.target.value)} style={{ width: '100%' }}>
              <option>Only mixed</option>
              <option>Mixed + own</option>
              <option>All panels</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
