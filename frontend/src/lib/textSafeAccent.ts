// Text-safe variants of the lens accent palette. The decorative accent
// hexes (dots, vocab map points, trace fills) are untouched — this only
// covers accent colors actually rendered *as text* (the mixed panel's
// per-token dominant-lens color, the lens panel's divergence-tint
// highlight, and the small "ACTIVATING" caption on the vocab map), which
// is where WCAG contrast actually matters and where "the mixed text and
// the highlights are hard to read against the background" was a real,
// measured problem.
//
// Two things move together here, not just contrast: the first pass only
// pushed lightness far enough to clear the bare 4.5:1 AA minimum, which
// technically passed but still read as muted/washed out next to the
// punchier dot it's supposedly the same color as. This pass targets a
// stronger ~5.5:1+ and also boosts saturation (capped well short of a
// pure/primary color) — same hue as the dot, same "family," just a more
// vivid, more legible version of it as text specifically. Baseline grey
// is deliberately excluded from the saturation boost (see SAT_BOOST's
// near-grey guard in the generating script) since it has ~no hue signal
// to begin with — boosting it would invent a random tint, not vibrancy.
//
// A lookup table, not a runtime HSL-adjustment function: the accent
// palette is a small, fixed set (see LENS_UI in App.tsx / the gallery's
// galleryAccents.ts), so precomputing once is simpler and more
// predictable than adjusting arbitrary colors at render time.
const LIGHT_SAFE: Record<string, string> = {
  '#7b5ea7': '#703dbe', // plum (scientist)
  '#b06090': '#a02e72', // magenta (poet)
  '#5a7a5a': '#2f672f', // sage (naturalist)
  '#c07060': '#a23722', // coral (skeptic)
  '#b07080': '#a0344f', // rose (mixed / philosopher's teal pairing fallback)
  '#4a7a7a': '#246363', // teal (philosopher)
  '#8a8480': '#605b58', // baseline grey
  // LensRail's CUSTOM_ACCENTS — a custom pollinator beyond the 5 presets
  // can end up as a mixed-panel dominant lens too, in the local app.
  '#a8863f': '#755617',
  '#4f6b8f': '#305c94',
  '#8f4f8f': '#943094',
  '#4f8f6b': '#21663f',
  '#8f6b4f': '#81502a',
  '#6b4f8f': '#6837a7',
}

const DARK_SAFE: Record<string, string> = {
  '#7b5ea7': '#a07cd5',
  '#b06090': '#d46aaa',
  '#5a7a5a': '#499f49',
  '#c07060': '#dc6e58',
  '#b07080': '#d1738a',
  '#4a7a7a': '#3a9f9f',
  '#8a8480': '#948e8b',
  '#a8863f': '#c18f26',
  '#4f6b8f': '#6391cc',
  '#8f4f8f': '#ce67ce',
  '#4f8f6b': '#37a768',
  '#8f6b4f': '#c37e48',
  '#6b4f8f': '#a47ed5',
}

export function textSafeAccent(hex: string, isDark: boolean): string {
  const table = isDark ? DARK_SAFE : LIGHT_SAFE
  return table[hex] ?? hex
}
