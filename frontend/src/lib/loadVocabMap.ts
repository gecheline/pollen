// Loads the precomputed vocab-map assets built by build_assets.py.
//
// coords.u16.bin is interleaved uint16 xy in token-id order, so
// vocabPoints[tokenId] is the point for that token — which is exactly what
// VocabMap assumes when it does vocabPoints[activation.pointIndex].
//
// tokens.json is fetched separately and only when hover labels are needed;
// it's several times larger than the coords themselves.

import type { VocabPoint } from '../types'

export interface ModelEntry {
  model_name: string
  dir: string
  vocab_size: number
  embedding_hash: string
}

export interface VocabManifest {
  asset_version: number
  model_name: string
  embedding_hash: string
  vocab_size: number
  embedding_dim: number
  files: Record<string, { path: string; count: number }>
}

const ASSET_ROOT = '/assets'

export async function listModels(): Promise<ModelEntry[]> {
  const res = await fetch(`${ASSET_ROOT}/models.json`)
  if (!res.ok) throw new Error(`models.json: ${res.status}`)
  return (await res.json()).models
}

export async function loadVocabMap(
  dir: string,
): Promise<{ manifest: VocabManifest; points: VocabPoint[] }> {
  const manifest: VocabManifest = await (await fetch(`${ASSET_ROOT}/${dir}/manifest.json`)).json()

  const buf = await (await fetch(`${ASSET_ROOT}/${dir}/coords.u16.bin`)).arrayBuffer()
  const raw = new Uint16Array(buf)

  if (raw.length !== manifest.vocab_size * 2) {
    throw new Error(
      `coords length ${raw.length / 2} != vocab_size ${manifest.vocab_size} — assets are inconsistent`,
    )
  }

  const points: VocabPoint[] = new Array(manifest.vocab_size)
  for (let i = 0; i < manifest.vocab_size; i++) {
    points[i] = { x: raw[i * 2] / 65535, y: raw[i * 2 + 1] / 65535 }
  }

  return { manifest, points }
}

// Fetch only when the map actually needs hover labels.
export async function loadTokenStrings(dir: string): Promise<string[]> {
  return (await fetch(`${ASSET_ROOT}/${dir}/tokens.json`)).json()
}

// The guard that makes the Llama/Qwen class of bug impossible: the backend
// reports the fingerprint of the embedding table it actually loaded, and it
// must match the one these coords were projected from. Mismatched assets
// still render a plausible map — they just describe a different vocabulary.
export function assertAssetsMatchModel(manifest: VocabManifest, backendEmbeddingHash: string): void {
  if (manifest.embedding_hash !== backendEmbeddingHash) {
    throw new Error(
      `Vocab map was built from a different model than the one loaded ` +
        `(assets: ${manifest.embedding_hash}, running: ${backendEmbeddingHash}). ` +
        `Rebuild with: python build_assets.py --models ${manifest.model_name} --force`,
    )
  }
}
