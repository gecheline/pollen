// Accent colors for the gallery's panels. Deliberately a small standalone
// module, not imported from App.tsx — main.tsx dynamic-imports App and
// GalleryApp separately specifically so neither bundle pulls in the
// other's component tree; importing App.tsx's palette here would defeat
// that. The preset values below are copied from App.tsx's LENS_UI /
// BASELINE_ACCENT / MIXED_ACCENT (kept in sync by hand — they're plain
// hex constants, not logic, so the duplication cost is low) so a lens that
// happens to share an id with a local-app preset (scientist, philosopher,
// poet, skeptic, naturalist all appear in gallery cards) reads as the same
// color in both places.

export const BASELINE_ACCENT = '#8a8480'
export const MIXED_ACCENT = '#b07080'

const PRESET_ACCENTS: Record<string, string> = {
  scientist: '#7b5ea7',
  philosopher: '#4a7a7a',
  poet: '#b06090',
  skeptic: '#c07060',
  naturalist: '#5a7a5a',
}

// Same fallback palette LensRail.tsx uses for custom lenses in the local
// app — a card lens with no preset match (historian, abraham-lincoln, ...)
// cycles through these instead.
const FALLBACK_ACCENTS = ['#a8863f', '#4f6b8f', '#8f4f8f', '#4f8f6b', '#8f6b4f', '#6b4f8f']

export function accentForLens(lensId: string, fallbackIndex: number): string {
  return PRESET_ACCENTS[lensId] ?? FALLBACK_ACCENTS[fallbackIndex % FALLBACK_ACCENTS.length]
}
