// Gallery-only: a plain matchMedia hook, same live-updating pattern as
// useTheme.ts's prefers-color-scheme listener. Used to switch panel
// layout between desktop's two-row grid and mobile's stacked-per-panel
// arrangement — see PanelGrid.tsx.
import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches) // query itself can change between renders
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
