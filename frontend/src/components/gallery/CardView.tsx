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
import type { VocabPoint } from '../../types'
import ToggleCard from './ToggleCard'
import TurnsCard from './TurnsCard'
import MixedFeaturedCard from './MixedFeaturedCard'
import MixedInlineCard from './MixedInlineCard'

// The one model the gallery ships (spec §1) — same asset-dir naming
// convention as the local app's ModelEntry.dir / MAP_LIMITS keys.
const GALLERY_MODEL_DIR = 'mlx-community__Llama-3.2-3B-Instruct-4bit'

// Spec §6, verbatim.
export const SCATTER_INFO_TEXT =
  "This is a 2D view of the model's embedding space. Embeddings are vector — numeric — representations of words, and this shows the model's whole internal vocabulary as a cloud. It's been squished from many dimensions down to two so it can be drawn at all, so keep in mind the real thing is far more complex than the map can show."

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
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px 40px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 14,
          fontSize: 9,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-muted)',
        }}
      >
        ← All conversations
      </button>

      <h1 style={{ margin: '0 0 6px', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontWeight: 400, fontSize: 22, color: 'var(--ink)' }}>
        {card.title}
      </h1>
      <p style={{ margin: '0 0 18px', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-muted)', maxWidth: 640 }}>{card.subtitle}</p>

      {card.explainer && (
        <p
          style={{
            margin: '0 0 20px',
            padding: '10px 14px',
            border: '1px solid var(--hairline)',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--ink-muted)',
            maxWidth: 720,
          }}
        >
          {card.explainer}
        </p>
      )}

      {error && <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{error}</p>}

      {!vocabPoints ? (
        <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading…</p>
      ) : (
        (() => {
          const layoutProps: LayoutProps = { card, vocabPoints, mapLimits: MAP_LIMITS[GALLERY_MODEL_DIR], isDark }
          switch (card.layout) {
            case 'toggle':
              return <ToggleCard {...layoutProps} />
            case 'turns':
              return <TurnsCard {...layoutProps} />
            case 'mixed_featured':
              return <MixedFeaturedCard {...layoutProps} />
            case 'mixed_inline':
              return <MixedInlineCard {...layoutProps} />
            default:
              return <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Unknown layout "{card.layout}".</p>
          }
        })()
      )}
    </div>
  )
}
