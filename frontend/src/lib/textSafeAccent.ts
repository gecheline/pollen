// Text-safe variants of the lens accent palette. The decorative accent
// hexes (dots, vocab map points, trace fills) are untouched — this only
// covers accent colors actually rendered *as text* (currently: the mixed
// panel's per-token dominant-lens color, and the small "ACTIVATING"
// caption on the vocab map), which is where WCAG contrast actually
// matters and where "the mixed text is hard to read against the
// background" was a real, measured problem: several of the plain accents
// sit well under the 4.5:1 minimum for normal text against pollen's own
// surfaces (magenta as low as 3.54:1 in light mode, teal 3.49:1 in dark).
//
// A lookup table, not a runtime HSL-adjustment function: the accent
// palette is a small, fixed set (see LENS_UI in App.tsx / the gallery's
// galleryAccents.ts), so precomputing once — darkened in light mode,
// lightened in dark mode, same hue/saturation, just enough to clear
// 4.5:1 against --surface — is simpler and more predictable than
// adjusting arbitrary colors at render time. A handful (coral, rose,
// baseline grey in dark mode) already passed and are left unchanged.
const LIGHT_SAFE: Record<string, string> = {
  '#7b5ea7': '#785ba5', // plum (scientist)
  '#b06090': '#9e4e7e', // magenta (poet)
  '#5a7a5a': '#547154', // sage (naturalist)
  '#c07060': '#a25140', // coral (skeptic)
  '#b07080': '#995465', // rose (mixed / philosopher's teal pairing fallback)
  '#4a7a7a': '#447070', // teal (philosopher)
  '#8a8480': '#6d6865', // baseline grey
  // LensRail's CUSTOM_ACCENTS — a custom pollinator beyond the 5 presets
  // can end up as a mixed-panel dominant lens too, in the local app.
  '#a8863f': '#7f6530',
  '#4f6b8f': '#4f6b8f', // already passes
  '#8f4f8f': '#8f4f8f', // already passes
  '#4f8f6b': '#3f7155',
  '#8f6b4f': '#826148',
  '#6b4f8f': '#6b4f8f', // already passes
}

const DARK_SAFE: Record<string, string> = {
  '#7b5ea7': '#8e75b4',
  '#b06090': '#b36795',
  '#5a7a5a': '#658965',
  '#c07060': '#c07060', // already >= 4.5:1 against dark surface
  '#b07080': '#b07080', // already >= 4.5:1 against dark surface
  '#4a7a7a': '#548a8a',
  '#8a8480': '#8a8480', // already >= 4.5:1 against dark surface
  '#a8863f': '#a8863f', // already passes
  '#4f6b8f': '#6382a9',
  '#8f4f8f': '#ab66ab',
  '#4f8f6b': '#4f8f6b', // already passes
  '#8f6b4f': '#9f7758',
  '#6b4f8f': '#8f73b2',
}

export function textSafeAccent(hex: string, isDark: boolean): string {
  const table = isDark ? DARK_SAFE : LIGHT_SAFE
  return table[hex] ?? hex
}
