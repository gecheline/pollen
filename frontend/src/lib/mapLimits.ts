// Per-model x/y clip ranges for the vocab map, chosen by hand against
// notebooks/vocab_map_inspection.ipynb: a handful of outlier tokens in each
// model's UMAP projection sat far from the rest of the vocabulary, so the
// [0, 1] normalization stretched to fit them and compressed the real
// cluster into a fraction of the visible map. Clipping to these ranges
// throws away nothing on disk — coords.u16.bin is untouched — this only
// changes what VocabMap treats as its visible domain.
//
// Keyed by the asset `dir` (matches models.json / ModelEntry.dir), since
// that's the stable per-model identifier already used everywhere else.

export interface AxisLimits {
  x: [number, number]
  y: [number, number]
}

export const MAP_LIMITS: Record<string, AxisLimits> = {
  'mlx-community__Qwen3-4B-4bit': { x: [0.35, 0.75], y: [0.3, 0.7] },
  'mlx-community__Llama-3.2-3B-Instruct-4bit': { x: [0.4, 1.0], y: [0.15, 1.0] },
  'mlx-community__Mistral-7B-Instruct-v0.3-4bit': { x: [0.3, 1.0], y: [0.0, 0.85] },
}
