// A small "i" affordance that reveals a deeper explanation on hover, and
// stays open on click (for touch, or for reading at leisure without holding
// the pointer still). Click elsewhere closes it. Minimal chrome: a hairline
// circle and a hairline-edged plate for the popover — no shadow, no radius
// beyond the circle itself, consistent with the rest of the app.
//
// `accent`, when given, colors the circle's border and "i" glyph with the
// panel's own pollinator color instead of the neutral ink-muted/hairline
// default — every info button now visually belongs to the specific panel
// it's attached to. The glyph goes through textSafeAccent (it's real text,
// same WCAG treatment as TokenText's mixed-panel color); the border
// doesn't need that (a shape, not text — WCAG's looser 3:1 UI-component
// threshold already clears for the whole palette).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { textSafeAccent } from '../lib/textSafeAccent'

interface InfoButtonProps {
  children: ReactNode
  align?: 'left' | 'right' // which edge of the button the popover hangs from
  side?: 'above' | 'below' // which direction the popover opens
  width?: number
  accent?: string
  isDark?: boolean
}

export default function InfoButton({ children, align = 'right', side = 'below', width = 220, accent, isDark = false }: InfoButtonProps) {
  const [pinned, setPinned] = useState(false)
  const [hovering, setHovering] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const open = pinned || hovering

  useEffect(() => {
    if (!pinned) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pinned])

  const glyphColor = accent ? textSafeAccent(accent, isDark) : 'var(--ink-muted)'
  const borderColor = accent ?? (open ? 'var(--ink-muted)' : 'var(--hairline)')

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        onClick={() => setPinned(p => !p)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        aria-label="More detail"
        aria-expanded={open}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `1.5px solid ${borderColor}`,
          background: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 11,
          lineHeight: '14px',
          fontFamily: 'Instrument Sans, sans-serif',
          color: glyphColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        i
      </button>
      {open && (
        <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            position: 'absolute',
            [side === 'below' ? 'top' : 'bottom']: '100%',
            [align === 'left' ? 'left' : 'right']: 0,
            marginTop: side === 'below' ? 5 : 0,
            marginBottom: side === 'above' ? 5 : 0,
            width,
            background: 'var(--surface-raised)',
            border: '1px solid var(--hairline)',
            padding: '8px 10px',
            fontSize: 10.5,
            lineHeight: 1.55,
            color: 'var(--ink-muted)',
            fontFamily: 'Instrument Sans, sans-serif',
            zIndex: 10,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
