// Hero (title + logo placeholder), a fixed editorial intro (see Intro.tsx),
// then two sections side by side (two cards each) and a footer pointing at
// the local app. The card-grid content itself still reads entirely from
// index.json (§8: nothing in §3-§6 is hardcoded in components), including
// which two sections exist and what they're called — the hero/intro above
// it are fixed page copy, not per-deploy data, so they're not.

import { useState } from 'react'
import type { GalleryIndex, GalleryCard } from '../../lib/gallery'
import { useMediaQuery } from '../../lib/useMediaQuery'
import IntroSection from './Intro'

const MOBILE_QUERY = '(max-width: 700px)'

// Reads /logo.png (frontend/public-gallery/logo.png) if it's there; falls
// back to a plain lettermark-shaped placeholder if it 404s, same onError
// pattern CardTile uses for card thumbnails — so this never needs a code
// change again once the real logo is dropped in, and doesn't break if it's
// ever removed.
function Hero() {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div style={{ textAlign: 'center', padding: '56px 4px 48px' }}>
      {imgFailed ? (
        <div
          style={{
            width: 96,
            height: 96,
            margin: '0 auto 20px',
            borderRadius: '50%',
            border: '1px solid var(--hairline)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}
        >
          logo
        </div>
      ) : (
        <img
          src="/logo.png"
          onError={() => setImgFailed(true)}
          alt="pollen"
          style={{ width: 96, height: 96, margin: '0 auto 20px', display: 'block', objectFit: 'contain' }}
        />
      )}
      <h1
        style={{
          margin: 0,
          fontFamily: "'Lora', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 40,
          color: 'var(--ink)',
        }}
      >
        pollen
      </h1>
    </div>
  )
}

function CardTile({ card, onClick }: { card: GalleryCard; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: '1px solid var(--hairline)',
        borderRadius: 0,
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      }}
    >
      {/* Card art is square at the source, so the frame is square too rather
          than cropping into a wide aspect ratio. If an image 404s (not
          produced yet), a plain hairline block reads as "no image" rather
          than a broken-image glyph, without ever hardcoding a path. */}
      {imgFailed ? (
        <div style={{ aspectRatio: '1 / 1', background: 'var(--surface-inset)', borderBottom: '1px solid var(--hairline)' }} />
      ) : (
        <img
          src={`/${card.image}`}
          onError={() => setImgFailed(true)}
          alt=""
          style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderBottom: '1px solid var(--hairline)' }}
        />
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink)' }}>{card.title}</div>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--ink-muted)', marginTop: 5 }}>{card.subtitle}</div>
      </div>
    </button>
  )
}

export default function Landing({ index, onOpenCard }: { index: GalleryIndex; onOpenCard: (cardId: string) => void }) {
  const isMobile = useMediaQuery(MOBILE_QUERY)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px' }}>
      <Hero />
      <IntroSection />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: !isMobile && index.sections.length > 1 ? '1fr 1fr' : '1fr',
          gap: 0,
          border: '1px solid var(--ink-faint)',
        }}
      >
        {index.sections.map((section, i) => (
          <div
            key={section.id}
            style={{
              borderLeft: !isMobile && i > 0 ? '1px solid var(--ink-faint)' : 'none',
              borderTop: isMobile && i > 0 ? '1px solid var(--ink-faint)' : 'none',
              padding: 24,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 16 }}>
              {section.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              {section.cards.map(card => (
                <CardTile key={card.id} card={card} onClick={() => onOpenCard(card.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed, not themed with everything else — the one place on the page
          meant to read as a distinct destination rather than blend in. Uses
          the --banner-* tokens (index.css), a deliberately muted pairing —
          not a full swap to the opposite theme's own surface/ink, which
          read as jarring, especially bright-beige-on-a-dark-page. Fixed
          means it stays this same muted look in both themes without
          threading isDark down as a prop. */}
      <div
        style={{
          margin: '28px 0 40px',
          padding: isMobile ? '22px 20px' : '26px 32px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 20,
          background: 'var(--banner-surface)',
        }}
      >
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--banner-ink)', maxWidth: 620 }}>{index.footer.text}</p>
        <a
          href={index.github_url}
          target="_blank"
          rel="noreferrer"
          style={{
            flexShrink: 0,
            border: '1px solid var(--banner-ink)',
            padding: '8px 16px',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--banner-ink)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {index.footer.cta}
        </a>
      </div>
    </div>
  )
}
