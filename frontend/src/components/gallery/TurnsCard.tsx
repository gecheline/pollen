// "turns" layout (war): baseline pinned left, no mixed panel ever, the two
// lenses toggleable past a break in the grid — turn 0 on open, "follow up"
// reveals turn 1 appended below rather than replacing it, so the point
// (how the answer shifts across the exchange) stays visible the whole
// time.

import type { LayoutProps } from './CardView'
import { SCATTER_INFO_TEXT } from './CardView'
import { useGalleryTurns, panelText, titleSuppressed } from '../../lib/useGalleryTurns'
import { usePollinatorToggle } from '../../lib/usePollinatorToggle'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
import PollinatorToggleBar from './PollinatorToggleBar'
import GalleryQuestionBar from './GalleryQuestionBar'

export default function TurnsCard({ card, vocabPoints, mapLimits, isDark }: LayoutProps) {
  const { completed, current, reveal, hasNext, followUp, replay, loadingNext } = useGalleryTurns(card)
  const { visible, toggle } = usePollinatorToggle(card.lenses.map(l => l.panel_id))
  const defs = buildPanelDefs(card)
  const lensAccents = buildLensAccents(card)

  if (!current) return <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Loading…</p>

  // The breaker mirrors the local app's own input box: whatever you'd
  // submit next, not whatever's currently answered above. Once there's no
  // next turn, there's nothing to preview — fall back to the last-asked
  // question so the slot isn't empty, dimmed via questionActive to read as
  // leftover rather than a live prompt.
  const nextQuestion = hasNext ? card.turns[current.turnIndex + 1].user_message : current.question

  const buildPanel = (panelId: string): GridPanel => ({
    def: panelId === 'baseline' ? defs.baseline : defs.lenses[panelId],
    data: current.panels[panelId],
    activations: current.activations[panelId],
    history: completed.map(t => ({ question: titleSuppressed(t), answer: panelText(t.panels[panelId]) })),
    currentQuestion: titleSuppressed(current),
    revealCount: reveal.revealCount,
  })

  const pinned = [buildPanel('baseline')]
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
