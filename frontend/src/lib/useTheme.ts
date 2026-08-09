// Gallery-only: the local app's dark mode is a plain manual boolean (see
// App.tsx's `dark` state). The gallery needs to *default* to the OS
// preference and keep following it live — until someone touches the
// manual toggle, which then holds for the rest of the session (a reload
// goes back to following the OS; nothing here is persisted on purpose).

import { useEffect, useRef, useState } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

export function useTheme() {
  const [dark, setDark] = useState(() => window.matchMedia(QUERY).matches)
  const overridden = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => {
      if (!overridden.current) setDark(e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const toggle = () => {
    overridden.current = true
    setDark(d => !d)
  }

  return { dark, toggle }
}
