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

// Was 8ms, then 22ms (both too close to "instant" — turned out that was
// masked by a Skip-animations bug that got stuck on and never turned back
// off, see useSkipAnimations), then 200ms once that was fixed and the
// ticker was actually visible — that read as genuinely slow rather than
// deliberate. 25ms is the settled pace: a clearly-visible typing motion
// without dragging. Skip (GalleryQuestionBar) is still right there for
// anyone who'd rather not watch it.
const MS_PER_TOKEN = 25

export function useReveal(maxTokens: number, resetKey: string | number | null) {
  // "Skip animations" for the card currently open (see useSkipAnimations —
  // scoped to one CardView, not persisted) — read during render (not just
  // the effect's deps) because the render-phase reset below needs its
  // current value too.
  const { skip: skipAll } = useSkipAnimations()
  const [revealCount, setRevealCount] = useState(() => (resetKey === null || skipAll ? maxTokens : 0))
  const rafRef = useRef<number | null>(null)

  // Track which resetKey `revealCount` actually belongs to, and correct it
  // *during render* the moment resetKey changes — not in an effect. An
  // effect-based reset was the real bug behind "shows the whole answer,
  // then wipes it": on a Follow Up, `current` (and so resetKey and
  // maxTokens) update in one React state batch, but `revealCount` is a
  // separate piece of state that doesn't get reset until the effect below
  // runs *after* that render has already committed and painted — so the
  // new turn's first frame briefly showed the *previous* turn's leftover
  // revealCount applied to the *new* turn's tokens (min(newTokens.length,
  // oldRevealCount), often "most or all of it" since a just-finished turn's
  // revealCount sits at its own full length) before snapping back to 0.
  // Calling setState during render is React's own sanctioned pattern for
  // this exact case — it discards the render and retries immediately with
  // the corrected value, so nothing ever paints the stale combination.
  const trackedKeyRef = useRef(resetKey)
  if (resetKey !== trackedKeyRef.current) {
    trackedKeyRef.current = resetKey
    setRevealCount(resetKey === null || skipAll ? maxTokens : 0)
  }

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
