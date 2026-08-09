// Deterministic fixture generator — stands in for the real backend (§6 of the
// viz spec). Given a seed and a set of panel ids, produces a full `Generation`:
// per-panel token streams with surprisal / signed log-ratio / KL, per-token
// vocab-map activations, and a shared vocab point cloud. Everything is derived
// from `seed` via the seeded LCG in `./rng` — no `Math.random()` anywhere — so
// the same config always reproduces the same fixture byte-for-byte.

import { lcg } from './rng'
import type { Generation, LensId, PanelData, Token, LensToken, MixedToken, VocabPoint, VocabActivation } from '../types'

// ── Curated flavor text ───────────────────────────────────────────────────────
//
// Real answer copy per lens, carried over from the original App.tsx. This is
// what gives each panel's token stream some personality instead of lorem
// ipsum; per-token metrics are synthesized on top of it.

const FLAVOR_TEXT: Record<string, string> = {
  baseline:
    "There are many ways to make money, depending on your skills, interests, and available capital. Common approaches include employment, freelancing, starting a business, investing in stocks or real estate, or creating and selling digital products. What's your area of interest?",
  scientist:
    'Wealth generation follows predictable economic principles. Labor income scales linearly with time; capital income scales geometrically. The empirically optimal strategy diversifies across uncorrelated asset classes — equities, fixed income, real property — while minimizing friction costs such as taxes and fees.',
  philosopher:
    'Before we answer how to make money, we must examine why — and from whom. Value is not intrinsic; it is relational, embedded in systems of exchange we did not choose. Every act of earning is also an act of participation in a particular arrangement of the world.',
  poet: 'Money blooms from seeds you plant in time — patient gardens of attention, tended with the quiet devotion of someone who knows the harvest is never only about the harvest. What you offer the world, freely and completely, returns transformed.',
  skeptic:
    'Most advice about making money is survivorship bias dressed as wisdom. The paths that reliably work — inheriting capital, leveraging existing assets, or capturing structural rent — are rarely mentioned because they are not universally available. Everything else is a lottery with better branding.',
  naturalist:
    'In the natural world, the answer lies in symbiosis. Organisms thrive not through isolated accumulation but through exchange of value within ecological networks. Your capacity to generate income is proportional to the niche you occupy and the density of relationships you cultivate.',
  mixed:
    "There are empirically sound approaches — capital allocation, skill development, network cultivation — but something is lost when livelihood reduces to optimization. Perhaps the truest wealth is the question itself: not what you can extract, but what you can offer that the world hasn't yet learned it needs.",
}

const FALLBACK_TEXT =
  'This lens has no curated answer yet, so this is placeholder text standing in for a real generation, long enough to exercise the same per-token metrics as every other panel.'

function tokenizeText(text: string): string[] {
  // Split on spaces, folding the separator into the following word so
  // concatenating token.text values reproduces the original string exactly —
  // spans can be rendered back-to-back with no manual spacing logic.
  return text.split(' ').map((w, i) => (i === 0 ? w : ' ' + w))
}

// ── Bounded random walk ───────────────────────────────────────────────────────
//
// Same "clamp and perturb" shape as the original sparkline data, generalized
// to an arbitrary range/step so it can produce surprisal, log-ratio, or KL
// values that look like plausible, noisy-but-continuous per-token metrics.

function boundedWalk(rand: () => number, n: number, opts: { start: number; min: number; max: number; step: number }): number[] {
  let v = opts.start
  return Array.from({ length: n }, () => {
    v = Math.max(opts.min, Math.min(opts.max, v + (rand() - 0.5) * opts.step))
    return v
  })
}

// Ranges chosen to be "plausible" rather than calibrated to any real model —
// this is fixture data, not a claim about actual surprisal/KL magnitudes.
const SURPRISAL_RANGE = { min: 0.1, max: 4.5, step: 1.1 }
const LOG_RATIO_RANGE = { min: -3.2, max: 3.2, step: 1.4 }
const KL_RANGE = { min: 0.02, max: 3.0, step: 1.0 }

// The two cases the trace exists to distinguish (spec §4.2 / §6), forced into
// every non-baseline panel's stream so they're visible during development
// rather than only in theory.
function injectSpecialCases(rand: () => number, logRatio: number[], kl: number[]) {
  const n = logRatio.length
  if (n < 6) return
  const iThin = Math.max(1, Math.min(n - 2, Math.floor(n / 3)))
  let iThick = Math.max(1, Math.min(n - 2, Math.floor((2 * n) / 3)))
  if (iThick === iThin) iThick = Math.min(n - 2, iThin + 1)

  const sign = () => (rand() < 0.5 ? -1 : 1)

  // Thin but far from zero: the lens strongly preferred this specific word
  // while otherwise agreeing with the baseline's distribution.
  logRatio[iThin] = sign() * (2.3 + rand() * 0.5)
  kl[iThin] = 0.03 + rand() * 0.05

  // Thick but near zero: the lens massively reshaped the distribution and
  // still landed on the baseline's word.
  logRatio[iThick] = sign() * (rand() * 0.08)
  kl[iThick] = 2.5 + rand() * 0.45
}

// ── Vocab cloud ───────────────────────────────────────────────────────────────

function buildVocabPoints(rand: () => number, n: number): VocabPoint[] {
  return Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2
    const rho = Math.sqrt(rand())
    return {
      x: 0.5 + rho * Math.cos(a) * (0.6 + 0.18 * Math.cos(2 * a)) * 0.43,
      y: 0.5 + rho * Math.sin(a) * (0.8 + 0.12 * Math.sin(a)) * 0.43,
    }
  })
}

// Each panel's activations cluster around a per-panel "region" of the shared
// cloud, rather than sampling uniformly — this is the mechanism behind the
// product's core visual: different lenses light up different neighborhoods of
// the same landscape, not a random scatter that happens to be a different color.
function buildPanelNeighborhood(vocabPoints: VocabPoint[], centroid: VocabPoint, size: number): number[] {
  return vocabPoints
    .map((p, i) => ({ i, d: Math.hypot(p.x - centroid.x, p.y - centroid.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, size)
    .map(d => d.i)
}

function buildActivations(rand: () => number, tokens: Token[], neighborhood: number[]): VocabActivation[] {
  const out: VocabActivation[] = []
  tokens.forEach((t, atTokenIndex) => {
    const count = 1 + Math.floor(rand() * 4) // 1..4 points per token
    const normalizedSurprisal = (t.surprisal - SURPRISAL_RANGE.min) / (SURPRISAL_RANGE.max - SURPRISAL_RANGE.min)
    const strength = Math.max(0.15, 1 - normalizedSurprisal) // confident tokens light points more strongly
    for (let k = 0; k < count; k++) {
      const pointIndex = neighborhood[Math.floor(rand() * neighborhood.length)]
      out.push({ pointIndex, strength, atTokenIndex })
    }
  })
  return out
}

// ── Per-panel token stream ───────────────────────────────────────────────────

function buildBaselineTokens(rand: () => number, words: string[]): Token[] {
  const surprisal = boundedWalk(rand, words.length, { start: 1.0, ...SURPRISAL_RANGE })
  return words.map((text, i) => ({ text, surprisal: surprisal[i] }))
}

function buildLensTokens(rand: () => number, words: string[]): LensToken[] {
  const surprisal = boundedWalk(rand, words.length, { start: 1.0, ...SURPRISAL_RANGE })
  const logRatio = boundedWalk(rand, words.length, { start: 0, ...LOG_RATIO_RANGE })
  const kl = boundedWalk(rand, words.length, { start: 0.4, ...KL_RANGE })
  injectSpecialCases(rand, logRatio, kl)
  return words.map((text, i) => ({ text, surprisal: surprisal[i], logRatio: logRatio[i], kl: kl[i] }))
}

function buildMixedTokens(rand: () => number, words: string[], lensIds: LensId[]): MixedToken[] {
  const base = buildLensTokens(rand, words)
  const dominant: LensId[] = []
  const pool = lensIds.length > 0 ? lensIds : ['baseline']
  let i = 0
  while (i < words.length) {
    const runLen = Math.min(words.length - i, 2 + Math.floor(rand() * 4)) // runs of 2-5 tokens
    const lensId = pool[Math.floor(rand() * pool.length)]
    for (let j = 0; j < runLen; j++) dominant.push(lensId)
    i += runLen
  }
  return base.map((t, idx) => ({ ...t, dominantLensId: dominant[idx] }))
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FixtureConfig {
  seed: number
  panelIds: LensId[] // includes 'baseline' and, if >= 2 lenses are active, 'mixed'
  vocabPointCount?: number
  neighborhoodSize?: number
}

export function generateFixture(config: FixtureConfig): Generation {
  const { seed, panelIds, vocabPointCount = 3000, neighborhoodSize = 220 } = config

  const cloudRand = lcg(seed)
  const vocabPoints = buildVocabPoints(cloudRand, vocabPointCount)

  const lensIds = panelIds.filter(id => id !== 'baseline' && id !== 'mixed')
  const panels: Record<LensId, PanelData> = {}
  const activations: Record<LensId, VocabActivation[]> = {}

  panelIds.forEach((id, panelIndex) => {
    // Arithmetic offset of the top-level seed, same pattern as the original
    // per-lens `buildLit(11|22|33…)` seeds — deterministic, no Math.random.
    const subSeed = seed + (panelIndex + 1) * 7919
    const rand = lcg(subSeed)
    const words = tokenizeText(FLAVOR_TEXT[id] ?? FALLBACK_TEXT)

    if (id === 'baseline') {
      panels[id] = { kind: 'baseline', tokens: buildBaselineTokens(rand, words) }
    } else if (id === 'mixed') {
      panels[id] = { kind: 'mixed', tokens: buildMixedTokens(rand, words, lensIds) }
    } else {
      panels[id] = { kind: 'lens', lensId: id, tokens: buildLensTokens(rand, words) }
    }

    // Per-panel centroid picked from the same seeded stream, so activations
    // land in a stable, panel-specific region of the shared cloud.
    const a = rand() * Math.PI * 2
    const rho = Math.sqrt(rand()) * 0.75
    const centroid: VocabPoint = { x: 0.5 + rho * Math.cos(a) * 0.35, y: 0.5 + rho * Math.sin(a) * 0.35 }
    const neighborhood = buildPanelNeighborhood(vocabPoints, centroid, Math.min(neighborhoodSize, vocabPoints.length))
    activations[id] = buildActivations(rand, panels[id].tokens, neighborhood)
  })

  return { seed, vocabPoints, panels, activations }
}
