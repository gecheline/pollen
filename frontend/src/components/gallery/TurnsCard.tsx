// "turns" layout (war): baseline + the two lenses, no mixed panel ever —
// turn 0 on open, "follow up" reveals turn 1 appended below rather than
// replacing it, so the point (how the answer shifts across the exchange)
// stays visible the whole time.

import type { LayoutProps } from './CardView'
import { SCATTER_INFO_TEXT } from './CardView'
import { useGalleryTurns, panelText } from '../../lib/useGalleryTurns'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
import GalleryQuestionBar from './GalleryQuestionBar'

export default function TurnsCard({ card, vocabPoints, mapLimits, isDark }: LayoutProps) {
  const { completed, current, reveal, hasNext, followUp, replay, loadingNext } = useGalleryTurns(card)
  const defs = buildPanelDefs(card)
  const lensAccents = buildLensAccents(card)

  if (!current) return <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading…</p>

  // The breaker mirrors the local app's own input box: whatever you'd
  // submit next, not whatever's currently answered above. Once there's no
  // next turn, there's nothing to preview — fall back to the last-asked
  // question so the slot isn't empty, dimmed via questionActive to read as
  // leftover rather than a live prompt.
  const nextQuestion = hasNext ? card.turns[current.turnIndex + 1].user_message : current.question

  const order = ['baseline', ...card.lenses.map(l => l.panel_id)] // no mixed, per spec
  const panels: GridPanel[] = order.map(panelId => ({
    def: panelId === 'baseline' ? defs.baseline : defs.lenses[panelId],
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
