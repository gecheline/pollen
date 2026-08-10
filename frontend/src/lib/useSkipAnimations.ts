// A single "skip animations" preference for the whole gallery session,
// persisted to localStorage (so it survives navigating between cards, and a
// reload) and broadcast via a plain window event so every mounted useReveal
// ticker — there can be several at once, one per active reveal — reacts
// immediately when it's flipped, not just on their next mount. Same
// same-tab-broadcast trick useTheme/useMediaQuery use for OS-driven
// preferences, just backed by localStorage instead of matchMedia since
// there's no platform signal for this one.
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pollen-gallery-skip-animations'
const CHANGE_EVENT = 'pollen:skip-animations-change'

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function write(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // localStorage unavailable (private browsing, etc.) — the preference
    // just won't persist across reloads; still works for the session via
    // the broadcast event below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useSkipAnimations() {
  const [skip, setSkip] = useState(read)

  useEffect(() => {
    const onChange = () => setSkip(read())
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])

  return { skip, setSkip: write, toggle: () => write(!read()) }
}
