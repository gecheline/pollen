// Local-app-only shell: the first thing a fresh launch shows is now a
// splash (LandingPage) rather than the workspace itself — App.tsx is
// completely unmodified, this just decides which of the two mounts. Not
// persisted across reloads on purpose: every fresh launch (or refresh)
// starts back at the splash, same as opening any other app.

import { useState } from 'react'
import LandingPage from './components/LandingPage'
import App from './App'

export default function LocalRoot() {
  const [started, setStarted] = useState(false)
  return started ? <App /> : <LandingPage onStart={() => setStarted(true)} />
}
