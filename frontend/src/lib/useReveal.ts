// Drives the "replay" animation: every panel already renders off
// `revealCount` (PullTrace slices to `Math.min(tokens.length, revealCount)`,
// VocabMap filters `activation.atTokenIndex < revealCount`, TokenText
// slices the same way) — this hook is just the ticker that increments it,
// no new animation code in any of those components.
//
// `resetKey` identifies *which* reveal this is, not just whether one is
// happening — a plain "active: boolean" isn't enough because it can't
// distinguish "same reveal, still running" from "a new one just started"
// when the new one happens to need the same maxTokens as the last (two
// turns can coincidentally have the same token count). The ticker restarts
// exactly when resetKey changes; null means nothing to reveal yet (renders
// already-complete, ticker never starts). For the toggle layout, where
// panels appear independently and must never replay once shown, the
// caller passes each panel's own id as its resetKey the first time it's
// toggled on, and keeps passing that same id forever after — toggling off
// and back on doesn't change resetKey, so it doesn't restart anything.
import { useEffect, useState } from 'react'
import { useSkipAnimations } from './useSkipAnimations'

// Spec: aim ~8-15ms/token. Was 12ms, but VocabMap used to redraw its whole
// ~130k-point dormant cloud on every single tick regardless of how little
// had actually changed — with several panels animating at once (universe,
// art) that dropped ticks under the render load and made 12ms/token feel
// much slower than the number suggests. VocabMap now caches that layer and
// only repaints the small activated-points layer per tick, so the bottom
// of the spec's own range is sustainable rather than aspirational.
const MS_PER_TOKEN = 8

export function useReveal(maxTokens: number, resetKey: string | number | null) {
  // Global, persisted "skip animations" preference (see useSkipAnimations) —
  // in the deps array below (unlike maxTokens) so flipping it on mid-reveal
  // completes whatever's currently ticking immediately, not just future
  // reveals.
  const { skip: skipAll } = useSkipAnimations()
  const [revealCount, setRevealCount] = useState(resetKey === null || skipAll ? maxTokens : 0)

  useEffect(() => {
    if (resetKey === null || skipAll) {
      setRevealCount(maxTokens)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealCount(maxTokens)
      return
    }

    setRevealCount(0)
    const id = setInterval(() => {
      setRevealCount(c => {
        const next = Math.min(c + 1, maxTokens)
        if (next >= maxTokens) clearInterval(id)
        return next
      })
    }, MS_PER_TOKEN)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, skipAll])

  return {
    revealCount,
    done: revealCount >= maxTokens,
    skip: () => setRevealCount(maxTokens),
  }
}
