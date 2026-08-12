// Shared shell for all four card layouts: back link, title, explainer (if
// the card has one), and the vocab coords — fetched once when the card
// opens (not on landing, not per turn) and handed down to whichever layout
// component `card.layout` selects. The layouts themselves only decide
// which panels go in which rows; everything else (loading, header, the
// scatter-map explainer text) lives here once.

import { useEffect, useState } from 'react'
import type { GalleryIndex, GalleryCard } from '../../lib/gallery'
import { assertGalleryModelMatches } from '../../lib/gallery'
import { loadVocabMap, type VocabManifest } from '../../lib/loadVocabMap'
import { MAP_LIMITS } from '../../lib/mapLimits'
import { SkipAnimationsProvider } from '../../lib/useSkipAnimations'
import { SCATTER_INFO_TEXT } from '../../lib/scatterInfo'
import type { VocabPoint } from '../../types'
import ToggleCard from './ToggleCard'
import TurnsCard from './TurnsCard'
import MixedInlineCard from './MixedInlineCard'
import ObservationsPanel from './ObservationsPanel'

// The one model the gallery ships (spec §1) — same asset-dir naming
// convention as the local app's ModelEntry.dir / MAP_LIMITS keys.
const GALLERY_MODEL_DIR = 'mlx-community__Llama-3.2-3B-Instruct-4bit'

// Re-exported for the other gallery layout files, which already import it
// from here — the shared copy itself now lives in lib/scatterInfo.ts so
// the local app can use the identical text on its own map.
export { SCATTER_INFO_TEXT }

export interface LayoutProps {
  card: GalleryCard
  vocabPoints: VocabPoint[]
  mapLimits: typeof MAP_LIMITS[string]
  isDark: boolean
}

export default function CardView({
  index,
  card,
  onBack,
  isDark,
}: {
  index: GalleryIndex
  card: GalleryCard
  onBack: () => void
  isDark: boolean
}) {
  const [vocabPoints, setVocabPoints] = useState<VocabPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showObservations, setShowObservations] = useState(false)

  useEffect(() => {
    let cancelled = false
    setVocabPoints(null)
    setError(null)
    loadVocabMap(GALLERY_MODEL_DIR)
      .then(({ manifest, points }: { manifest: VocabManifest; points: VocabPoint[] }) => {
        if (cancelled) return
        assertGalleryModelMatches(index.model_name, manifest)
        setVocabPoints(points)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [card.id, index.model_name])

  return (
    // One provider per card view (see useSkipAnimations.tsx) — CardView
    // remounts fresh every time a card is opened (always via Landing in
    // between, never card-to-card directly), so this naturally resets to
    // "animations on" every time rather than needing to be reset by hand.
    <SkipAnimationsProvider>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 10.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
            }}
          >
            ← All conversations
          </button>
          <button
            onClick={() => setShowObservations(true)}
            style={{
              background: 'none',
              border: '1px solid var(--hairline)',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: 10.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
            }}
          >
            Observations
          </button>
        </div>

        <h1 style={{ margin: '0 0 6px', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontWeight: 400, fontSize: 25.5, color: 'var(--ink)' }}>
          {card.title}
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: 640 }}>{card.subtitle}</p>

        {/* card.explainer (a short "what this chart does" line) used to
            render here as its own bordered paragraph — dropped now that
            it's redundant with the (i) info popovers on each panel: two
            places saying almost the same thing read as clutter, not
            reinforcement. The field stays in the data/type — just unused
            here — rather than requiring a rebake to remove it. */}

        {error && <p style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{error}</p>}

        {!vocabPoints ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Loading…</p>
        ) : (
          (() => {
            const layoutProps: LayoutProps = { card, vocabPoints, mapLimits: MAP_LIMITS[GALLERY_MODEL_DIR], isDark }
            switch (card.layout) {
              case 'toggle':
                return <ToggleCard {...layoutProps} />
              case 'turns':
                return <TurnsCard {...layoutProps} />
              // mixed_featured (universe) and mixed_inline (art) render
              // identically now — see MixedInlineCard's file comment.
              case 'mixed_featured':
              case 'mixed_inline':
                return <MixedInlineCard {...layoutProps} />
              default:
                return <p style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Unknown layout "{card.layout}".</p>
            }
          })()
        )}

        <ObservationsPanel open={showObservations} onClose={() => setShowObservations(false)} />
      </div>
    </SkipAnimationsProvider>
  )
}
