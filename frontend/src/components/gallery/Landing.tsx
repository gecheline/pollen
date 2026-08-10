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

// Logo isn't made yet — a plain lettermark-shaped placeholder holds the spot
// without pretending to be a real mark.
function Hero() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 4px 44px' }}>
      <div
        style={{
          width: 52,
          height: 52,
          margin: '0 auto 14px',
          borderRadius: '50%',
          border: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}
      >
        logo
      </div>
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
      {/* Real card images are being produced separately — cards/*.png may
          not exist yet. A plain hairline block reads as "no image" rather
          than a broken-image glyph, without ever hardcoding a path. */}
      {imgFailed ? (
        <div style={{ aspectRatio: '16 / 10', background: 'var(--surface-inset)', borderBottom: '1px solid var(--hairline)' }} />
      ) : (
        <img
          src={`/${card.image}`}
          onError={() => setImgFailed(true)}
          alt=""
          style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderBottom: '1px solid var(--hairline)' }}
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
          border: '1px solid var(--hairline)',
        }}
      >
        {index.sections.map((section, i) => (
          <div
            key={section.id}
            style={{
              borderLeft: !isMobile && i > 0 ? '1px solid var(--hairline)' : 'none',
              borderTop: isMobile && i > 0 ? '1px solid var(--hairline)' : 'none',
              padding: 24,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 16 }}>
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

      <div
        style={{
          padding: '28px 4px 40px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'baseline',
          justifyContent: 'space-between',
          gap: 20,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: 620 }}>{index.footer.text}</p>
        <a
          href={index.github_url}
          target="_blank"
          rel="noreferrer"
          style={{
            flexShrink: 0,
            border: '1px solid var(--hairline)',
            padding: '7px 14px',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
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
