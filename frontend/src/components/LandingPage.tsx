// The very first screen a fresh launch shows — logo, name, a short "what
// this is," and one way forward (Start pollinating). Everything after this
// is the existing workspace (App.tsx), completely untouched; this is a new
// screen in front of it, not a rework of it. See LocalRoot.tsx for how the
// two are switched between.

import { useState } from 'react'

const GALLERY_URL = 'https://pollen-liart.vercel.app/'

export default function LandingPage({ onStart }: { onStart: () => void }) {
  const [logoFailed, setLogoFailed] = useState(false)

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: 24,
        background: 'var(--surface)',
        color: 'var(--ink)',
        textAlign: 'center',
      }}
    >
      {!logoFailed && (
        <img src="/logo.png" onError={() => setLogoFailed(true)} alt="pollen" style={{ width: 84, height: 84, objectFit: 'contain' }} />
      )}

      <h1
        style={{
          margin: 0,
          fontFamily: "'Lora', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 40,
          color: 'var(--ink)',
        }}
      >
        pollen
      </h1>

      <p style={{ margin: 0, maxWidth: 440, fontSize: 13, lineHeight: 1.65, color: 'var(--ink-muted)' }}>
        pollen asks one question through several lenses — personas layered onto the same model — and shows, word by
        word, how far each one's answer drifts from a plain baseline. Toggle pollinators on and off, blend them
        together, and watch exactly where each choice lands in the model's own vocabulary.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 6 }}>
        <button
          onClick={onStart}
          style={{
            background: 'none',
            border: '1px solid var(--hairline)',
            borderRadius: 0,
            cursor: 'pointer',
            padding: '10px 22px',
            fontFamily: 'Instrument Sans, sans-serif',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
          }}
        >
          Start pollinating →
        </button>
        <a
          href={GALLERY_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            textDecoration: 'none',
          }}
        >
          See the gallery
        </a>
      </div>
    </div>
  )
}
