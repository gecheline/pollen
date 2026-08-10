// "toggle" layout (2+2): baseline always shown, un-toggleable; each
// pollinator independently on/off; no mixed panel, no combine-mode UI
// anywhere — this card never constructs a mixed panel at all, so there's
// nothing to hide (§8: absent beats greyed out).
//
// Single turn, so "fetch panel files per turn, on demand" (spec §2) means
// fetching once, here, when the card opens — not per toggle. Toggling
// only changes visibility and (the first time) triggers that one panel's
// own reveal; the data's already in hand.

import { useEffect, useState } from 'react'
import type { LayoutProps } from './CardView'
import { loadPanelFile } from '../../lib/gallery'
import { useReveal } from '../../lib/useReveal'
import { buildPanelDefs, buildLensAccents } from './panelDefs'
import PanelGrid, { type GridPanel } from './PanelGrid'
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

  if (!loaded) return <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading…</p>

  const panels: GridPanel[] = [{ def: defs.baseline, ...loaded.baseline, revealCount: baselineReveal.revealCount }]
  let allDone = baselineReveal.done
  card.lenses.forEach((lens, i) => {
    if (!visible.has(lens.panel_id)) return
    panels.push({ def: defs.lenses[lens.panel_id], ...loaded[lens.panel_id], revealCount: lensReveals[i].revealCount })
    allDone = allDone && lensReveals[i].done
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {card.lenses.map((lens, i) => {
          const active = visible.has(lens.panel_id)
          return (
            <button
              key={lens.panel_id}
              onClick={() => toggle(lens.panel_id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'none',
                border: '1px solid var(--hairline)',
                borderRadius: 0,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: active ? defs.lenses[lens.panel_id].accent : 'transparent',
                  border: active ? 'none' : '1px solid var(--ink-faint)',
                }}
              />
              <span
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: active ? 'var(--ink)' : 'var(--ink-muted)',
                }}
              >
                {lens.name}
              </span>
            </button>
          )
        })}
      </div>

      <PanelGrid
        panels={panels}
        vocabPoints={vocabPoints}
        mapLimits={mapLimits}
        isDark={isDark}
        lensAccents={lensAccents}
        mapInfo={SCATTER_INFO_TEXT}
        breaker={<GalleryQuestionBar question={turn.user_message} questionActive={false} done={allDone} />}
      />
    </div>
  )
}
