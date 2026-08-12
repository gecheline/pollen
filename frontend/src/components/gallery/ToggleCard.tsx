// "toggle" layout (2+2): baseline always shown, pinned left, un-toggleable;
// each pollinator independently on/off on the right, past a break in the
// grid; no mixed panel, no combine-mode UI anywhere — this card never
// constructs a mixed panel at all, so there's nothing to hide (§8: absent
// beats greyed out).
//
// Single turn, so "fetch panel files per turn, on demand" (spec §2) means
// fetching once, here, when the card opens — not per toggle. Toggling
// only changes visibility and (the first time) triggers that one panel's
// own reveal; the data's already in hand.
//
// Its own toggle state, not the shared usePollinatorToggle other layouts
// use: this card additionally needs `everShown` (so a lens revealed once
// never replays just from toggling off and back on), which the other
// three layouts — where every panel shares one turn-level reveal, not an
// independent per-panel one — have no use for.

import { useEffect, useState } from 'react'
import type { LayoutProps } from './CardView'
import { loadPanelFile } from '../../lib/gallery'
import { useReveal } from '../../lib/useReveal'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
import PollinatorToggleBar from './PollinatorToggleBar'
import GalleryQuestionBar from './GalleryQuestionBar'
import { SCATTER_INFO_TEXT } from './CardView'
import type { PanelData, VocabActivation } from '../../types'

type Loaded = Record<string, { data: PanelData; activations: VocabActivation[] }>

export default function ToggleCard({ card, vocabPoints, mapLimits, isDark }: LayoutProps) {
  const turn = card.turns[0]
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // Baseline is never in these sets — it's unconditional, handled
  // separately below. Starting with just the first lens visible gives the
  // toggle interaction something to actually do (add more, watch them
  // reveal) rather than dumping every answer at once with nothing left to
  // explore.
  const [visible, setVisible] = useState<Set<string>>(() => new Set(card.lenses.slice(0, 1).map(l => l.panel_id)))
  const [everShown, setEverShown] = useState<Set<string>>(() => new Set(visible))

  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    Promise.all(
      Object.entries(turn.panels).map(async ([panelId, path]) => [panelId, await loadPanelFile(path)] as const),
    ).then(entries => {
      if (!cancelled) setLoaded(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  const toggle = (panelId: string) => {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(panelId)) next.delete(panelId)
      else next.add(panelId)
      return next
    })
    setEverShown(prev => (prev.has(panelId) ? prev : new Set(prev).add(panelId)))
  }

  const defs = buildPanelDefs(card)
  const lensAccents = buildLensAccents(card)

  const baselineReveal = useReveal(turn.n_tokens.baseline ?? 0, loaded ? 'baseline' : null)
  // card.lenses has a fixed length for the lifetime of this component (the
  // same card never changes its lens list), so mapping it to hook calls is
  // safe — the number of hook calls per render never varies.
  const lensReveals = card.lenses.map(lens =>
    useReveal(turn.n_tokens[lens.panel_id] ?? 0, loaded && everShown.has(lens.panel_id) ? lens.panel_id : null),
  )

  if (!loaded) return <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Loading…</p>

  const pinned: GridPanel[] = [{ def: defs.baseline, ...loaded.baseline, revealCount: baselineReveal.revealCount }]
  const toggleable: GridPanel[] = []
  let allDone = baselineReveal.done
  card.lenses.forEach((lens, i) => {
    if (!visible.has(lens.panel_id)) return
    toggleable.push({ def: defs.lenses[lens.panel_id], ...loaded[lens.panel_id], revealCount: lensReveals[i].revealCount })
    allDone = allDone && lensReveals[i].done
  })

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
      breaker={<GalleryQuestionBar question={turn.user_message} questionActive={false} done={allDone} />}
    />
  )
}
