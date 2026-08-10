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
import { useEffect, useRef, useState } from 'react'
import { useSkipAnimations } from './useSkipAnimations'

// Was 8ms (sustainable once VocabMap/PullTrace stopped redoing O(n) work
// per tick), then 22ms — still too close to "instant" to read as an
// animation at all, especially on shorter answers where even 22ms/token
// is over in a second or two. This is a deliberately slow, unmissable
// typing pace, not a technical ceiling — Skip (GalleryQuestionBar) is
// right there for anyone who doesn't want to watch it.
const MS_PER_TOKEN = 200

export function useReveal(maxTokens: number, resetKey: string | number | null) {
  // Global, persisted "skip animations" preference (see useSkipAnimations) —
  // in the deps array below (unlike maxTokens) so flipping it on mid-reveal
  // completes whatever's currently ticking immediately, not just future
  // reveals.
  const { skip: skipAll } = useSkipAnimations()
  const [revealCount, setRevealCount] = useState(resetKey === null || skipAll ? maxTokens : 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)

    if (resetKey === null || skipAll) {
      setRevealCount(maxTokens)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealCount(maxTokens)
      return
    }

    setRevealCount(0)
    const start = performance.now()
    // requestAnimationFrame, not setInterval: this ticks against real
    // elapsed wall-clock time (Math.floor(elapsed / MS_PER_TOKEN)) instead
    // of counting fixed +1 steps. That distinction matters under load —
    // with several panels revealing at once, each tick's render (text
    // reflow, trace redraw, map redraw) can take longer than 8ms, and a
    // setInterval firing every 8ms regardless doesn't wait for that: the
    // callbacks queue up back-to-back, and the browser burns through them
    // in a tight, janky burst once the main thread frees up — visible
    // stutter, worse the more panels share the tick. rAF instead fires at
    // most once per actual paintable frame (~16ms at 60Hz) and computes
    // how many tokens *should* be visible by now from real elapsed time,
    // so a slow frame just means one bigger jump next frame — correct
    // total duration, no backlog, and no more paint work requested than
    // the display can actually show.
    const tick = (now: number) => {
      const next = Math.min(maxTokens, Math.floor((now - start) / MS_PER_TOKEN))
      setRevealCount(next)
      if (next < maxTokens) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, skipAll])

  return {
    revealCount,
    done: revealCount >= maxTokens,
    skip: () => setRevealCount(maxTokens),
  }
}
