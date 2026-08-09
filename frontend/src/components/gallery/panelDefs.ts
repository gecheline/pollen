// PanelDef/accent construction shared by all four gallery layouts — the
// only thing that actually varies layout to layout is which of these get
// arranged into which rows.
//
// Keyed by panel_id ("lens_0", not "poet"): a mixed panel file's
// dominantLensId values are positional ("lens_0"/"lens_1", confirmed
// against the real baked files), the same convention the live app's SSE
// stream uses — so accent lookups have to key the same way, not by the
// lens's own semantic id.

import type { PanelDef, LensId } from '../../types'
import type { GalleryCard } from '../../lib/gallery'
import { BASELINE_ACCENT, MIXED_ACCENT, accentForLens } from '../../lib/galleryAccents'

export function buildPanelDefs(card: GalleryCard): { baseline: PanelDef; mixed: PanelDef; lenses: Record<string, PanelDef> } {
  const lenses: Record<string, PanelDef> = {}
  card.lenses.forEach((lens, i) => {
    lenses[lens.panel_id] = { id: lens.panel_id, label: lens.name, accent: accentForLens(lens.lens_id, i) }
  })
  return {
    baseline: { id: 'baseline', label: 'Baseline', accent: BASELINE_ACCENT },
    mixed: { id: 'mixed', label: 'Mixed', accent: MIXED_ACCENT },
    lenses,
  }
}

export function buildLensAccents(card: GalleryCard): Record<LensId, string> {
  const map: Record<LensId, string> = { baseline: BASELINE_ACCENT, mixed: MIXED_ACCENT }
  card.lenses.forEach((lens, i) => {
    map[lens.panel_id] = accentForLens(lens.lens_id, i)
  })
  return map
}
