// Both crosspollinate layouts — "mixed_inline" (art) and "mixed_featured"
// (universe) — now render identically: baseline + mixed pinned left, the
// individual pollinators toggleable past a break in the grid. Universe
// used to get its own two-row treatment (baseline+mixed on top, lenses in
// their own row below) specifically to make the mixed answer read as "the
// point of the card" — dropped in favor of the same toggle pattern every
// other layout uses, so CardView routes both layout values here rather
// than to two components that would just be identical copies of each
// other. Five turns on art via repeated "follow up" (one turn, no
// follow-up, on universe); the breaker's own hasNext
// (current.turnIndex < card.turns.length - 1) already covers both.

import type { LayoutProps } from './CardView'
import { SCATTER_INFO_TEXT } from './CardView'
import { useGalleryTurns, panelText, titleSuppressed } from '../../lib/useGalleryTurns'
import { usePollinatorToggle } from '../../lib/usePollinatorToggle'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
import PollinatorToggleBar from './PollinatorToggleBar'
import GalleryQuestionBar from './GalleryQuestionBar'

export default function MixedInlineCard({ card, vocabPoints, mapLimits, isDark }: LayoutProps) {
  const { completed, current, reveal, hasNext, followUp, replay, loadingNext } = useGalleryTurns(card)
  const { visible, toggle } = usePollinatorToggle(card.lenses.map(l => l.panel_id))
  const defs = buildPanelDefs(card)
  const lensAccents = buildLensAccents(card)

  if (!current) return <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Loading…</p>

  // See TurnsCard for why this is the *next* turn's question, not the
  // current one — falls back to the current (last) question, dimmed via
  // questionActive, once there's nothing left to preview.
  const nextQuestion = hasNext ? card.turns[current.turnIndex + 1].user_message : current.question

  const buildPanel = (panelId: string): GridPanel => ({
    def: panelId === 'baseline' ? defs.baseline : panelId === 'mixed' ? defs.mixed : defs.lenses[panelId],
    data: current.panels[panelId],
    activations: current.activations[panelId],
    history: completed.map(t => ({ question: titleSuppressed(t), answer: panelText(t.panels[panelId]) })),
    currentQuestion: titleSuppressed(current),
    revealCount: reveal.revealCount,
  })

  const pinned = ['baseline', 'mixed'].map(buildPanel)
  const toggleable = card.lenses.filter(l => visible.has(l.panel_id)).map(l => buildPanel(l.panel_id))

  return (
    <PanelGrid
      pinned={pinned}
      toggleable={toggleable}
      toggleBar={<PollinatorToggleBar lenses={card.lenses.map(l => defs.lenses[l.panel_id])} visible={visible} onToggle={toggle} />}
      vocabPoints={vocabPoints}
      mapLimits={mapLimits}
      isDark={isDark}
      lensAccents={lensAccents}
      mapInfo={SCATTER_INFO_TEXT}
      breaker={
        <GalleryQuestionBar
          question={nextQuestion}
          questionActive={hasNext}
          done={reveal.done}
          replay={replay}
          hasNext={hasNext}
          onFollowUp={followUp}
          loadingNext={loadingNext}
        />
      }
    />
  )
}
