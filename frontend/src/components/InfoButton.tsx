// A small "i" affordance that reveals a deeper explanation on hover, and
// stays open on click (for touch, or for reading at leisure without holding
// the pointer still). Click elsewhere closes it. Minimal chrome: a hairline
// circle and a hairline-edged plate for the popover — no shadow, no radius
// beyond the circle itself, consistent with the rest of the app.

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface InfoButtonProps {
  children: ReactNode
  align?: 'left' | 'right' // which edge of the button the popover hangs from
  side?: 'above' | 'below' // which direction the popover opens
  width?: number
}

export default function InfoButton({ children, align = 'right', side = 'below', width = 220 }: InfoButtonProps) {
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

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        onClick={() => setPinned(p => !p)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        aria-label="More detail"
        aria-expanded={open}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: `1px solid ${open ? 'var(--ink-muted)' : 'var(--hairline)'}`,
          background: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 7.5,
          lineHeight: '10px',
          fontFamily: 'Instrument Sans, sans-serif',
          color: 'var(--ink-muted)',
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
            fontSize: 9,
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
