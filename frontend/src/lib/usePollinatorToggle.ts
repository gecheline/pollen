// Shared "which individual pollinators are currently shown" state for all
// four gallery card layouts — previously only the toggle (2+2) layout had
// this; now every layout with more than one individual pollinator does,
// so the interaction (and its convention: start with just the first one
// visible, add more) is the same everywhere rather than 2+2-only.
import { useState } from 'react'

export function usePollinatorToggle(lensIds: string[]) {
  const [visible, setVisible] = useState<Set<string>>(() => new Set(lensIds.slice(0, 1)))

  const toggle = (id: string) => {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return { visible, toggle }
}
