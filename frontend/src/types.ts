// ── Identity ─────────────────────────────────────────────────────────────────

export type LensId = string // 'baseline' | 'mixed' | a custom lens id

export type GenState = 'idle' | 'generating' | 'complete'

// ── Token-level data ───────────────────────────────────────────────────────────
//
// A discriminated hierarchy rather than one flat type with optional fields: the
// baseline panel never gets logRatio/kl (it has no trace), and only the mixed
// panel gets a dominantLensId (only it needs per-token color). Modeling that as
// three shapes lets the type checker catch "render a trace for baseline" or
// "tint by lens on a non-mixed panel" at compile time.

export interface Token {
  text: string // literal text fragment, rendered verbatim into a span
  surprisal: number // -log2 p(token | context), >= 0; drives text opacity
}

export interface LensToken extends Token {
  logRatio: number // log p_lens(token) - log p_baseline(token); signed, drives trace y
  kl: number // KL(lens ‖ baseline) at this step, >= 0; drives trace ribbon thickness
}

export interface MixedToken extends LensToken {
  dominantLensId: LensId // which lens's logits dominated this token
}

// ── Per-panel generation payloads ────────────────────────────────────────────

export interface BaselinePanelData {
  kind: 'baseline'
  tokens: Token[]
}

export interface LensPanelData {
  kind: 'lens'
  lensId: LensId
  tokens: LensToken[]
}

export interface MixedPanelData {
  kind: 'mixed'
  tokens: MixedToken[]
}

export type PanelData = BaselinePanelData | LensPanelData | MixedPanelData

// ── Vocab map ─────────────────────────────────────────────────────────────────

export interface VocabPoint {
  x: number // normalized 0..1, static layout position shared by every panel
  y: number
}

// Which points light up, and how strongly, as a function of tokens emitted so
// far. Kept separate from Token rather than embedded on it: the map's point
// count is independent of the token count, and a single token can plausibly
// activate zero, one, or several points at once.
export interface VocabActivation {
  pointIndex: number
  strength: number // 0..1
  atTokenIndex: number // which token index in the stream caused this activation
}

// ── Generation (the fixture / eventual API response shape) ──────────────────

export interface Generation {
  seed: number
  vocabPoints: VocabPoint[] // one shared cloud, identical across all panels
  panels: Record<LensId, PanelData> // keyed by 'baseline' | 'mixed' | lens id
  activations: Record<LensId, VocabActivation[]>
}

// ── UI state (unrelated to the flower grammar, but shared across components) ─

export interface Lens {
  id: string
  name: string
  desc: string
  accent: string
  weight: number
  active: boolean
}

export interface PanelDef {
  id: string
  label: string
  accent: string
}
