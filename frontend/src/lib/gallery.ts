// Loads the baked gallery data (produced by bake_gallery.py, shipped as
// frontend/public-gallery/) — index.json plus one JSON file per panel per
// turn. No streaming, no backend: everything here is a plain fetch of a
// static file, resolved once and handed to the same PanelTop/PanelBottom
// components the local app uses.

import type { PanelData, VocabActivation, LensId } from '../types'
import type { VocabManifest } from './loadVocabMap'

export interface GalleryLens {
  panel_id: string
  lens_id: string
  name: string
  system_prompt: string
  weight: number
}

export interface GalleryTurn {
  index: number
  user_message: string
  combine_mode: string
  weight_mode: string
  panels: Record<string, string> // panel_id -> path, relative to the gallery root
  n_tokens: Record<string, number>
}

export type GalleryLayout = 'toggle' | 'turns' | 'mixed_featured' | 'mixed_inline'

export interface GalleryCard {
  id: string
  title: string
  subtitle: string
  image: string
  layout: GalleryLayout
  show_mixed: boolean
  lenses: GalleryLens[]
  turns: GalleryTurn[]
  bytes: number
  explainer?: string
  panel_order?: string[]
}

export interface GallerySection {
  id: string
  title: string
  cards: GalleryCard[]
}

export interface GalleryIndex {
  gallery_format_version: number
  generated_at: string
  model_name: string
  github_url: string
  footer: { text: string; cta: string }
  sections: GallerySection[]
}

export async function loadGalleryIndex(): Promise<GalleryIndex> {
  const res = await fetch('/index.json')
  if (!res.ok) throw new Error(`index.json: ${res.status}`)
  return res.json()
}

// Raw shape of one panel file — parallel arrays, index i across all of them
// describes token i. logRatio/kl absent on baseline, dominantLensId present
// only on mixed; see types.ts's PanelData hierarchy for why that absence
// is meaningful rather than something to fill in with zeros.
interface RawPanelFile {
  panel_id: string
  n_tokens: number
  tokens: string[]
  token_ids: number[]
  surprisal: number[]
  activations: { pointIndex: number; strength: number }[][]
  text: string
  logRatio?: number[]
  kl?: number[]
  dominantLensId?: LensId[]
}

export async function loadPanelFile(path: string): Promise<{ data: PanelData; activations: VocabActivation[] }> {
  const res = await fetch(`/${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  const raw: RawPanelFile = await res.json()

  // atTokenIndex isn't stored in the file — same rule the live app uses
  // for SSE arrival order, applied here to array position instead.
  const activations: VocabActivation[] = raw.activations.flatMap((perToken, atTokenIndex) =>
    perToken.map(a => ({ ...a, atTokenIndex })),
  )

  if (raw.dominantLensId) {
    const data: PanelData = {
      kind: 'mixed',
      tokens: raw.tokens.map((text, i) => ({
        text,
        surprisal: raw.surprisal[i],
        logRatio: raw.logRatio![i],
        kl: raw.kl![i],
        dominantLensId: raw.dominantLensId![i],
      })),
    }
    return { data, activations }
  }

  if (raw.logRatio) {
    const data: PanelData = {
      kind: 'lens',
      lensId: raw.panel_id,
      tokens: raw.tokens.map((text, i) => ({ text, surprisal: raw.surprisal[i], logRatio: raw.logRatio![i], kl: raw.kl![i] })),
    }
    return { data, activations }
  }

  const data: PanelData = {
    kind: 'baseline',
    tokens: raw.tokens.map((text, i) => ({ text, surprisal: raw.surprisal[i] })),
  }
  return { data, activations }
}

// The gallery's version of loadVocabMap.ts's assertAssetsMatchModel: that
// one needs a *live* backend-reported embedding hash to compare against,
// which doesn't exist here — there's no backend. The gallery only has two
// strings on hand (index.json's model_name, the coords manifest's own),
// so that's the check: catches shipping the wrong model's coords alongside
// a given index.json, the same class of bug, with the evidence actually
// available in a static deploy.
export function assertGalleryModelMatches(indexModelName: string, manifest: VocabManifest): void {
  if (manifest.model_name !== indexModelName) {
    throw new Error(
      `Gallery index.json says model_name "${indexModelName}", but the shipped coords were built from ` +
        `"${manifest.model_name}" — assets and index are out of sync. Rebake with bake_gallery.py.`,
    )
  }
}
