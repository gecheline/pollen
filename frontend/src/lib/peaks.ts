// Finds the tokens whose trace excursion is worth naming, and decides where
// their labels can sit without colliding. Pure logic, no rendering — kept
// separate from PullTrace so the "what counts as a peak" rule is easy to
// read and test on its own.

import type { LensToken } from '../types'

const HAS_WORD_CHAR = /[A-Za-z0-9]/

export interface Peak {
  i: number
  word: string
  y: number // signed logRatio
  kl: number
}

// Punctuation-only or whitespace-only tokens (" —", ",", " .") are never
// interesting as a labeled peak, even if their logRatio happens to spike.
function isContentToken(text: string): boolean {
  return HAS_WORD_CHAR.test(text)
}

export function findPeaks(tokens: LensToken[], visibleCount: number, maxCount = 3): Peak[] {
  const candidates: Peak[] = []
  for (let i = 0; i < Math.min(tokens.length, visibleCount); i++) {
    const t = tokens[i]
    if (!isContentToken(t.text)) continue
    candidates.push({ i, word: t.text.trim(), y: t.logRatio, kl: t.kl })
  }
  candidates.sort((a, b) => Math.abs(b.y) - Math.abs(a.y))
  return candidates.slice(0, maxCount)
}

export interface PlacedPeak extends Peak {
  side: 'above' | 'below'
  x: number
}

// Greedy placement in descending order of excursion size: a candidate is
// dropped rather than nudged if it would collide with an already-placed
// label on the same side — an approximate position would misstate which
// token the label belongs to, so skipping is the only honest option.
export function placePeakLabels(peaks: Peak[], xForIndex: (i: number) => number, minGapPx: number): PlacedPeak[] {
  const placedAboveX: number[] = []
  const placedBelowX: number[] = []
  const placed: PlacedPeak[] = []

  for (const peak of peaks) {
    const side: 'above' | 'below' = peak.y >= 0 ? 'above' : 'below'
    const x = xForIndex(peak.i)
    const bucket = side === 'above' ? placedAboveX : placedBelowX
    if (bucket.some(px => Math.abs(px - x) < minGapPx)) continue
    bucket.push(x)
    placed.push({ ...peak, side, x })
  }

  return placed
}
