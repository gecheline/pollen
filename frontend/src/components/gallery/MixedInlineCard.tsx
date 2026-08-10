// "mixed_inline" layout (art): one row, in card.panel_order — baseline,
// mixed, then the lenses, same arrangement as the local app's own panel
// row. Five turns via repeated "follow up"; the breaker's own hasNext
// (current.turnIndex < card.turns.length - 1) already hides Follow up on
// the last turn, nothing extra needed here for that. card.explainer is
// rendered by CardView, above the row.

import type { LayoutProps } from './CardView'
import { SCATTER_INFO_TEXT } from './CardView'
import { useGalleryTurns, panelText } from '../../lib/useGalleryTurns'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
import GalleryQuestionBar from './GalleryQuestionBar'

export default function MixedInlineCard({ card, vocabPoints, mapLimits, isDark }: LayoutProps) {
  const { completed, current, reveal, hasNext, followUp, replay, loadingNext } = useGalleryTurns(card)
  const defs = buildPanelDefs(card)
  const lensAccents = buildLensAccents(card)

  if (!current) return <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading…</p>

  // See TurnsCard for why this is the *next* turn's question, not the
  // current one — falls back to the current (last) question, dimmed via
  // questionActive, once there's nothing left to preview.
  const nextQuestion = hasNext ? card.turns[current.turnIndex + 1].user_message : current.question

  const order = card.panel_order ?? ['baseline', 'mixed', ...card.lenses.map(l => l.panel_id)]
  const panels: GridPanel[] = order.map(panelId => ({
    def: panelId === 'baseline' ? defs.baseline : panelId === 'mixed' ? defs.mixed : defs.lenses[panelId],
    data: current.panels[panelId],
    activations: current.activations[panelId],
    history: completed.map(t => ({ question: t.question, answer: panelText(t.panels[panelId]) })),
    currentQuestion: current.question,
    revealCount: reveal.revealCount,
  }))

  return (
    <PanelGrid
      panels={panels}
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
