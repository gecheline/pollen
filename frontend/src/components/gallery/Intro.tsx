import type { ReactNode } from 'react'

// Landing page intro — three "beats" introducing what the gallery is and why
// it exists, above the card sections. Copy is fixed editorial content (not
// index.json data, unlike the card grid below it — there's nothing per-model
// or per-deploy about it), provided verbatim; this component only lays it
// out. The source copy included bracketed "[visual: ...]" notes describing
// an image per beat — decided against them (text-only), so there's no
// placeholder here to eventually swap out.

const linkStyle = { color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 2 }

const BEATS: { title: string; body: ReactNode }[] = [
  {
    title: 'why this gallery',
    body: "We talk to LLMs every day now, but most of us have no real picture of what's happening when we do. This gallery is an attempt to build that intuition of what happens inside an LLM as it’s crafting an answer, and more importantly, how our own prompts can steer the answer one way or another. The goal isn’t to decide which answer is the “right one”, but use the different perspectives presented in each as an input into getting a bigger picture view than what one single answer would give you. And develop an understanding of the right breadth and depth of prompting you need to get there.",
  },
  {
    title: 'prompting as pollinating',
    body: 'We\'re increasingly telling models how to answer, like be a "skeptic," a "socratic partner," an "expert." Each one of those instructions drives the answer to certain spaces of the vocabulary that the LLM may not reach without that prompt. This often applies even in our basic questions, or how we talk, or certain phrases we may use unintentionally. In this sense, prompting is not a neutral framing device and it helps to think of it as pollinating — you, as an active influence that determines what grows through the LLM’s answer.',
  },
  {
    title: 'a new approach: cross-pollination',
    body: (
      <>
        Most tools available today that mix perspectives do it through choosing the best smaller{' '}
        <a href="https://huggingface.co/blog/moe" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          “expert” models
        </a>{' '}
        for a specific task; or through a conversation of{' '}
        <a href="https://fishbowl.show/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          multiple personas
        </a>{' '}
        that a prompter can follow or be a part of. Cross-pollination here works differently. Before a single
        word is chosen, the probabilities from several perspectives, derived from the same single underlying model, are blended together directly, under the
        hood, through different mechanisms, like amplifying agreement or disagreement, leading to new, and potentially unexpected answers.
      </>
    ),
  },
]

export default function IntroSection() {
  return (
    <div style={{ padding: '0 4px 40px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 32,
        }}
      >
        {BEATS.map(beat => (
          <div key={beat.title}>
            <h2
              style={{
                margin: '0 0 10px',
                fontFamily: "'Lora', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: 18.5,
                color: 'var(--ink)',
              }}
            >
              {beat.title}
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--ink-muted)' }}>{beat.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
