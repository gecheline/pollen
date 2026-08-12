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
//
// The popover portals into document.body instead of rendering as a normal
// absolutely-positioned sibling. Both of App.tsx's panel rows (the map row
// and the trace row) set overflow: hidden on themselves — needed so the
// flex/minHeight:0 layout actually clips each panel's own internal scroll
// region instead of overflowing the viewport — and a plain in-place
// popover positioned to open "above" the trace row got silently clipped
// by exactly that overflow:hidden, i.e. it rendered but was invisible
// behind the row above it. A portal escapes that ancestor entirely: it's
// positioned in fixed/viewport coordinates computed from the button's own
// getBoundingClientRect, so no ancestor's overflow or stacking context
// can clip or bury it.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { textSafeAccent } from '../lib/textSafeAccent'

interface InfoButtonProps {
  children: ReactNode
  align?: 'left' | 'right' // which edge of the button the popover hangs from
  side?: 'above' | 'below' // which direction the popover opens
  width?: number
  accent?: string
  isDark?: boolean
}

// Comfortably above anything else in the app (the Observations sidebar's
// backdrop/panel sit at 40/41) — a portaled popover should never lose to
// another overlay by accident.
const POPOVER_Z_INDEX = 2000

export default function InfoButton({ children, align = 'right', side = 'below', width = 220, accent, isDark = false }: InfoButtonProps) {
  const [pinned, setPinned] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const open = pinned || hovering

  // Outside-click unpins — has to check both the button and the portaled
  // popover, since the popover is no longer a DOM descendant of the button
  // once it's rendered into document.body.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setPinned(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pinned])

  // Measure the button's viewport position whenever the popover opens, and
  // keep it in sync with scrolling/resizing while it's open — capture:true
  // so scroll events from a nested scroll container (e.g. a panel's own
  // answer text) are caught too, since scroll doesn't bubble by default.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const measure = () => setRect(buttonRef.current?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  const glyphColor = accent ? textSafeAccent(accent, isDark) : 'var(--ink-muted)'
  const borderColor = accent ?? (open ? 'var(--ink-muted)' : 'var(--hairline)')

  const popoverStyle = rect
    ? {
        position: 'fixed' as const,
        ...(side === 'below' ? { top: rect.bottom + 5 } : { bottom: window.innerHeight - rect.top + 5 }),
        ...(align === 'left' ? { left: rect.left } : { right: window.innerWidth - rect.right }),
        width,
        background: 'var(--surface-raised)',
        border: '1px solid var(--hairline)',
        padding: '8px 10px',
        fontSize: 10.5,
        lineHeight: 1.55,
        color: 'var(--ink-muted)',
        fontFamily: 'Instrument Sans, sans-serif',
        zIndex: POPOVER_Z_INDEX,
      }
    : undefined

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        ref={buttonRef}
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
      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={popoverStyle}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  )
}
