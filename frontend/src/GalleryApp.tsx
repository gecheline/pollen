// Root of the hosted gallery build (--mode gallery) — no backend, no
// inference, everything read from the baked frontend/public-gallery/.
// Same components as the local app (PanelTop, PanelBottom, PullTrace,
// VocabMap, TokenText, InfoButton), same CSS tokens (index.css, shared
// with App.tsx), different shell: a two-view site (landing, card) instead
// of the live generation workspace.

import { useEffect, useState } from 'react'
import { loadGalleryIndex, type GalleryIndex, type GalleryCard } from './lib/gallery'
import { useTheme } from './lib/useTheme'
import Landing from './components/gallery/Landing'
import CardView from './components/gallery/CardView'

type View = { kind: 'landing' } | { kind: 'card'; cardId: string }

function viewFromLocation(): View {
  const cardId = new URLSearchParams(window.location.search).get('card')
  return cardId ? { kind: 'card', cardId } : { kind: 'landing' }
}

export default function GalleryApp() {
  const { dark, toggle } = useTheme()
  const [index, setIndex] = useState<GalleryIndex | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => viewFromLocation())

  useEffect(() => {
    let cancelled = false
    loadGalleryIndex()
      .then(idx => {
        if (!cancelled) setIndex(idx)
      })
      .catch(e => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Browser back/forward — the one bit of routing this needs. No router
  // library: two views and a query param is well within what
  // history.pushState/popstate can do by hand.
  useEffect(() => {
    const onPopState = () => setView(viewFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openCard = (cardId: string) => {
    window.history.pushState({}, '', `?card=${encodeURIComponent(cardId)}`)
    setView({ kind: 'card', cardId })
    window.scrollTo(0, 0)
  }

  const goToLanding = () => {
    window.history.pushState({}, '', window.location.pathname)
    setView({ kind: 'landing' })
    window.scrollTo(0, 0)
  }

  let card: GalleryCard | undefined
  if (index && view.kind === 'card') {
    for (const section of index.sections) {
      card = section.cards.find(c => c.id === view.cardId)
      if (card) break
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', color: 'var(--ink)' }}>
      <header
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid var(--hairline)',
          background: 'var(--surface-raised)',
        }}
      >
        <button
          onClick={goToLanding}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 9,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
          }}
        >
          pollen
        </button>
        <button
          onClick={toggle}
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
          {dark ? '◑ Light' : '◐ Dark'}
        </button>
      </header>

      {loadError && (
        <div style={{ padding: '6px 20px', fontSize: 10, color: 'var(--ink-muted)', borderBottom: '1px solid var(--hairline)' }}>
          {loadError}
        </div>
      )}

      {!index ? null : view.kind === 'landing' ? (
        <Landing index={index} onOpenCard={openCard} />
      ) : card ? (
        <CardView index={index} card={card} onBack={goToLanding} isDark={dark} />
      ) : (
        <div style={{ padding: 40, fontSize: 12, color: 'var(--ink-muted)' }}>
          Card "{view.cardId}" not found. <button onClick={goToLanding}>Back</button>
        </div>
      )}
    </div>
  )
}
