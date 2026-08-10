import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Same entry point, same CSS tokens, two possible roots — which one is a
// build-time decision (vite.config.ts's `mode`), not a runtime branch.
// Dynamic import rather than importing both LocalRoot and GalleryApp
// statically up top: Vite replaces import.meta.env.MODE with a literal
// string at build time, so the unreachable import() call gets dropped
// entirely — the packaged local app's bundle never evaluates (or even
// fetches) GalleryApp's module, and vice versa, guaranteed by the build
// itself rather than relying on a minifier to tree-shake an unused
// component tree out of a static import. LocalRoot itself just switches
// between the splash (LandingPage) and the workspace (App) — App.tsx is
// unmodified.
async function boot() {
  const Root =
    import.meta.env.MODE === 'gallery' ? (await import('./GalleryApp')).default : (await import('./LocalRoot')).default

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  )
}

boot()
