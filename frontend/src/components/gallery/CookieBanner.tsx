// Fixed bottom banner, shown once until acknowledged. Owns both the
// acknowledgement state (persisted to localStorage) and the PrivacyNotice
// modal it opens, so GalleryApp just mounts <CookieBanner /> with no props
// and no state of its own.
//
// "Privacy Notice" is a real <button> inline in the sentence rather than a
// separate control next to Acknowledge — it keeps the copy as one sentence
// while still being keyboard-reachable and screen-reader-announced as a
// button (an <a> with no href would be neither).

import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery'
import PrivacyNotice from './PrivacyNotice'

const MOBILE_QUERY = '(max-width: 700px)'

// Versioned: if the notice itself materially changes later, bumping this
// key re-prompts everyone instead of silently treating an old
// acknowledgement as covering new terms.
const ACK_STORAGE_KEY = 'pollen.privacy-ack.v1'

// Below the observations sidebar (40/41) on purpose — while that sidebar is
// open its backdrop should dim this banner like everything else on the page,
// not have the banner punch through it.
const BANNER_Z_INDEX = 30

// Every access is guarded: localStorage throws on access (not just returns
// null) in a Safari private window or with site data blocked, and that must
// not take the page down with it. Failing "not acknowledged" is the safe
// direction — worst case the banner shows again.
function readAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(ACK_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeAcknowledged() {
  try {
    window.localStorage.setItem(ACK_STORAGE_KEY, 'true')
  } catch {
    // Dismissal still holds for this page view via React state; it just
    // won't survive a reload. Nothing useful to do about it here.
  }
}

export default function CookieBanner() {
  // Read in the initializer, not an effect, so an already-acknowledged
  // visitor never sees a frame of banner. Safe here: this is a
  // client-rendered SPA, so there's no server render to mismatch against.
  const [acknowledged, setAcknowledged] = useState(readAcknowledged)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const bannerRef = useRef<HTMLDivElement>(null)

  // A fixed banner covers whatever is at the bottom of the page, and no
  // amount of scrolling reveals it — on the landing page that's exactly the
  // "get pollen" CTA. Reserve matching space at the end of the document
  // while the banner is up, measured rather than hardcoded since the copy
  // wraps to different heights across viewports.
  useEffect(() => {
    if (acknowledged) return
    const banner = bannerRef.current
    if (!banner) return
    const previousPadding = document.body.style.paddingBottom
    const sync = () => {
      document.body.style.paddingBottom = `${banner.offsetHeight}px`
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(banner)
    return () => {
      observer.disconnect()
      document.body.style.paddingBottom = previousPadding
    }
  }, [acknowledged])

  const acknowledge = () => {
    writeAcknowledged()
    setAcknowledged(true)
  }

  return (
    <>
      {!acknowledged && (
        <div
          ref={bannerRef}
          // region + label so a screen-reader user can find (and leave) it
          // deliberately, rather than it being an unlabelled slab of text.
          role="region"
          aria-label="Cookie notice"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: BANNER_Z_INDEX,
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: isMobile ? 14 : 24,
            padding: isMobile ? '16px 20px' : '14px 20px',
            background: 'var(--surface-raised)',
            borderTop: '1px solid var(--hairline)',
          }}
        >
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: 760 }}>
            We use cookies to enable authentication and save your session state. By continuing to use this site, you acknowledge our{' '}
            <button
              onClick={() => setNoticeOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: 'var(--ink)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
                cursor: 'pointer',
              }}
            >
              Privacy Notice
            </button>
            .
          </p>
          <button
            onClick={acknowledge}
            style={{
              flexShrink: 0,
              background: 'none',
              border: '1px solid var(--ink-muted)',
              padding: '8px 16px',
              fontSize: 11.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'Instrument Sans, sans-serif',
              color: 'var(--ink)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* Outside the !acknowledged block: opening the notice from the banner
          and then acknowledging shouldn't rip the modal out mid-read, and
          this keeps the component reusable as the notice's single mount. */}
      <PrivacyNotice open={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </>
  )
}
