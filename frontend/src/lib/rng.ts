// Seeded PRNG (LCG) — deterministic so a given seed always reproduces the same
// fixture. Relocated verbatim from the original App.tsx.

export const lcg = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
}
