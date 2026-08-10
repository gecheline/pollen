// Landing page intro — three "beats" introducing what the gallery is and why
// it exists, above the card sections. Copy is fixed editorial content (not
// index.json data, unlike the card grid below it — there's nothing per-model
// or per-deploy about it), provided verbatim; this component only lays it
// out. The source copy included bracketed "[visual: ...]" notes describing
// what each placeholder should eventually show — those are authoring notes,
// not copy, so they're not rendered; a plain placeholder box stands in for
// the real image until one exists.

const BEATS: { title: string; body: string }[] = [
  {
    title: 'why this gallery',
    body: "We talk to LLMs every day now, but most of us have no real picture of what's happening when we do. This gallery is an attempt to build one — not a diagram, something you can actually watch. Each answer comes with a live sketch of the model's internal vocabulary, the space it's pulling words from, lighting up as it writes.",
  },
  {
    title: 'one pollinator changes everything',
    body: 'We\'re increasingly telling models how to answer — be a "skeptic," a "socratic partner," an "expert." Each one of those instructions drives the answer to a different spot in that space. It\'s not a neutral framing device — it\'s a real move, and sometimes the plain, un-prompted answer is actually the better one. Here, you can toggle a single pollinator on and off against the baseline and watch exactly where it lands.',
  },
  {
    title: 'what happens when you cross-pollinate',
    body: 'Most tools that mix perspectives do it as a conversation — one expert speaks, then another, then someone summarizes. This works differently. Before a single word is chosen, the probabilities from several perspectives are blended together directly, under the hood. Not a panel discussion — one answer, made of more than one mind at once.',
  },
]

function VisualPlaceholder() {
  return (
    <div
      style={{
        aspectRatio: '4 / 3',
        border: '1px dashed var(--hairline)',
        background: 'var(--surface-inset)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-faint)',
        marginTop: 14,
      }}
    >
      image
    </div>
  )
}

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
                fontSize: 16,
                color: 'var(--ink)',
              }}
            >
              {beat.title}
            </h2>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-muted)' }}>{beat.body}</p>
            <VisualPlaceholder />
          </div>
        ))}
      </div>
    </div>
  )
}
