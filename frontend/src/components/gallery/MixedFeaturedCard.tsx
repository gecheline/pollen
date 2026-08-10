// "mixed_featured" layout (universe): baseline + mixed on top, the
// individual pollinators in their own row below — a distinct treatment so
// the mixed answer reads as the point of the card, not just one more
// panel in a line. card.explainer is rendered by CardView, above both
// rows.

import type { LayoutProps } from './CardView'
import { SCATTER_INFO_TEXT } from './CardView'
import { useGalleryTurns, panelText } from '../../lib/useGalleryTurns'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
import TurnControls from './TurnControls'

export default function MixedFeaturedCard({ card, vocabPoints, mapLimits, isDark }: LayoutProps) {
  const { completed, current, reveal, hasNext, followUp, replay, loadingNext } = useGalleryTurns(card)
  const defs = buildPanelDefs(card)
  const lensAccents = buildLensAccents(card)

  if (!current) return <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading…</p>

  const buildPanel = (panelId: string): GridPanel => ({
    def: panelId === 'baseline' ? defs.baseline : panelId === 'mixed' ? defs.mixed : defs.lenses[panelId],
    data: current.panels[panelId],
    activations: current.activations[panelId],
    history: completed.map(t => ({ question: t.question, answer: panelText(t.panels[panelId]) })),
    currentQuestion: current.question,
    revealCount: reveal.revealCount,
  })

  const topRow = ['baseline', 'mixed'].map(buildPanel)
  const bottomRow = card.lenses.map(l => l.panel_id).map(buildPanel)

  return (
    <div>
      <PanelGrid panels={topRow} vocabPoints={vocabPoints} mapLimits={mapLimits} isDark={isDark} lensAccents={lensAccents} mapInfo={SCATTER_INFO_TEXT} />
      <PanelGrid panels={bottomRow} vocabPoints={vocabPoints} mapLimits={mapLimits} isDark={isDark} lensAccents={lensAccents} mapInfo={SCATTER_INFO_TEXT} />
      <TurnControls done={reveal.done} replay={replay} hasNext={hasNext} onFollowUp={followUp} loadingNext={loadingNext} />
    </div>
  )
}
