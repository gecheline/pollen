// Shared turn-progression logic for the three turn-based card layouts
// (turns, mixed_featured, mixed_inline) — the only thing that actually
// differs between them is which panels render in which rows (that's each
// layout component's own job). This hook owns: loading a turn's panel
// files on demand (fetched "per turn, on demand" per the spec, not
// prefetched), which turns are already complete (and so live in every
// panel's `history`), which one is currently revealing, and follow-up /
// skip / replay.

import { useEffect, useRef, useState } from 'react'
import { loadPanelFile, type GalleryCard } from './gallery'
import { useReveal } from './useReveal'
import type { PanelData, VocabActivation } from '../types'

// A completed turn's panel data is tokens, not a string — PanelTop's
// `history` prop wants the plain answer text, same as what panel_done
// carries live in the local app. Reconstructed by joining token spans
// (each one is a literal text fragment, so concatenation round-trips the
// original text exactly) rather than re-fetching anything.
export function panelText(data: PanelData): string {
  return data.tokens.map(t => t.text).join('')
}

export interface LoadedTurn {
  turnIndex: number
  question: string
  panels: Record<string, PanelData>
  activations: Record<string, VocabActivation[]>
  maxTokens: number
}

async function loadTurn(card: GalleryCard, turnIndex: number): Promise<LoadedTurn> {
  const turn = card.turns[turnIndex]
  const entries = await Promise.all(
    Object.entries(turn.panels).map(async ([panelId, path]) => [panelId, await loadPanelFile(path)] as const),
  )
  const panels: Record<string, PanelData> = {}
  const activations: Record<string, VocabActivation[]> = {}
  for (const [panelId, loaded] of entries) {
    panels[panelId] = loaded.data
    activations[panelId] = loaded.activations
  }
  return { turnIndex, question: turn.user_message, panels, activations, maxTokens: Math.max(...Object.values(turn.n_tokens)) }
}

export function useGalleryTurns(card: GalleryCard) {
  const [completed, setCompleted] = useState<LoadedTurn[]>([])
  const [current, setCurrent] = useState<LoadedTurn | null>(null)
  const [loadingNext, setLoadingNext] = useState(true)
  const replayNonce = useRef(0)
  const [replayTick, setReplayTick] = useState(0)

  // Card can change (in principle) without a full remount — reset and load
  // turn 0 fresh whenever it does.
  useEffect(() => {
    let cancelled = false
    setCompleted([])
    setCurrent(null)
    setLoadingNext(true)
    loadTurn(card, 0).then(t => {
      if (!cancelled) {
        setCurrent(t)
        setLoadingNext(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [card.id])

  const resetKey = current ? `${current.turnIndex}:${replayTick}` : null
  const reveal = useReveal(current?.maxTokens ?? 0, resetKey)

  const hasNext = current !== null && current.turnIndex < card.turns.length - 1

  const followUp = async () => {
    if (!current || !hasNext || loadingNext) return
    const finished = current
    setLoadingNext(true)
    const next = await loadTurn(card, finished.turnIndex + 1)
    setCompleted(prev => [...prev, finished])
    setCurrent(next)
    setLoadingNext(false)
  }

  const replay = () => {
    replayNonce.current += 1
    setReplayTick(replayNonce.current)
  }

  return { completed, current, reveal, hasNext, followUp, replay, loadingNext }
}
