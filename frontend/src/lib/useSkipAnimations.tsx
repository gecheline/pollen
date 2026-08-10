// "Skip animations" for the card currently open — not a global, persisted
// preference anymore. It was, briefly (localStorage-backed, one switch for
// the whole gallery session) — in practice that meant clicking Skip once,
// on any card, silently pre-skipped every reveal on every card forever
// after, with no way back in the UI (the control only ever set it to true).
// Scoping it to CardView's own lifetime fixes both problems at once: a
// plain useState here, provided once per card view (see
// SkipAnimationsProvider in CardView.tsx) and consumed by every useReveal
// ticker and GalleryQuestionBar underneath it. Opening a different card —
// or this same card again — always starts back at "animations on," because
// CardView genuinely unmounts and remounts for that (every card open goes
// back through Landing in between; there's no direct card-to-card link).
import { createContext, useContext, useState, type ReactNode } from 'react'

interface SkipAnimationsValue {
  skip: boolean
  setSkip: (value: boolean) => void
}

const SkipAnimationsContext = createContext<SkipAnimationsValue | null>(null)

export function SkipAnimationsProvider({ children }: { children: ReactNode }) {
  const [skip, setSkip] = useState(false)
  return <SkipAnimationsContext.Provider value={{ skip, setSkip }}>{children}</SkipAnimationsContext.Provider>
}

export function useSkipAnimations(): SkipAnimationsValue {
  const ctx = useContext(SkipAnimationsContext)
  // No provider above (shouldn't happen inside the gallery, but useReveal
  // has no other caller to worry about) — behave as "never skipping"
  // rather than throwing.
  return ctx ?? { skip: false, setSkip: () => {} }
}
