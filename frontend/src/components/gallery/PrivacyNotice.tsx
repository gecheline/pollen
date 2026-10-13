// The privacy policy itself, as a modal dialog — opened from CookieBanner's
// inline "Privacy Notice" affordance (and reusable from anywhere else that
// wants to link to it). Same visual language as ObservationsPanel: hairline
// edge, --surface-raised plate, uppercase letterspaced eyebrow heading, no
// shadow or radius.
//
// Unlike ObservationsPanel (a sidebar pinned to one edge) this is centered,
// so the backdrop and the plate are one element rather than the repo's usual
// separate backdrop div + fixed panel: a flex-centering wrapper that covers
// the viewport *is* the backdrop, which is what lets the plate size to its
// own content and stay centered at any viewport without magic offsets.
// Clicks are only treated as "backdrop clicks" when the wrapper itself is
// the event target, so a click inside the plate doesn't close it.
//
// Accessibility, since this is a true modal and not a popover like
// InfoButton: role="dialog" + aria-modal, labelled by its own heading,
// Escape closes, focus moves to the Close button on open and returns to
// whatever was focused before (the banner's trigger) on close, and Tab
// cycles within the dialog instead of escaping into the page behind it.

import { useEffect, useLayoutEffect, useRef } from 'react'

// Above every other layer in the app — the observations sidebar (40/41) and
// InfoButton's portaled popover (2000). A modal dialog should never lose to
// another overlay, and anything still open behind it sits under the backdrop.
const MODAL_Z_INDEX = 3000

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SECTIONS = [
  {
    heading: 'Authentication data',
    body:
      "When you sign in, we securely store your authentication data, including your email address. It identifies your account and keeps you signed in. We don't sell it or share it with advertisers.",
  },
  {
    heading: 'Text you enter',
    body:
      "Questions and other text inputs are processed temporarily to provide the app's functionality — producing the result you asked for. They are not used to train public AI models, and they aren't retained beyond what providing that functionality requires.",
  },
  {
    heading: 'Cookies and session state',
    body:
      'Cookies and similar local storage are what enable authentication and remember your session state between visits — including your acknowledgement of this notice, so it only has to be shown once.',
  },
]

export default function PrivacyNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // onClose lives in a ref so the focus effect below can depend on [open]
  // alone. GalleryApp passes an inline arrow, so a plain [open, onClose]
  // dependency would re-run the whole effect on every parent re-render —
  // yanking focus back to the Close button mid-read and running the
  // focus-restore cleanup against a stale element.
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  // Escape to close, Tab trapped inside, focus moved in on open and restored
  // on close. Listener is on document rather than the dialog so Escape works
  // even if focus has drifted somewhere unexpected.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      // offsetParent filters out anything hidden — querySelectorAll order is
      // DOM order, which here matches the visual tab order.
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open])

  // Hold the page still while the dialog is up. GalleryApp.tsx deliberately
  // sets body/documentElement overflow to 'auto' (overriding index.css's
  // fixed-viewport rules, which belong to the local app) — so restore
  // whatever was actually there rather than assuming a value.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.2)',
        zIndex: MODAL_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-notice-title"
        style={{
          width: 'min(560px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: 'var(--surface-raised)',
          border: '1px solid var(--hairline)',
          padding: '22px 24px 24px',
        }}
      >
        <h2
          id="privacy-notice-title"
          style={{
            margin: '0 0 18px',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}
        >
          Privacy Notice
        </h2>

        <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.65, color: 'var(--ink)' }}>
          What we store, and what happens to the text you type.
        </p>

        {SECTIONS.map(section => (
          <div key={section.heading} style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{section.heading}</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--ink-muted)' }}>{section.body}</p>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--ink-muted)',
              padding: '8px 16px',
              fontSize: 11.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'Instrument Sans, sans-serif',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
