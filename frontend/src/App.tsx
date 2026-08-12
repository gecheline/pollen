import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lens, PanelDef, GenState, LensId, PanelData, VocabPoint, VocabActivation } from './types'
import {
  getModels,
  getCurrentModel,
  switchModel,
  getPresets,
  streamChat,
  saveCapture,
  getDownloadStatus,
  resetSession,
  type SSEFrame,
  type ChatRequest,
  type CaptureResult,
  type DownloadStatus,
} from './lib/api'
import { loadVocabMap, assertAssetsMatchModel, type ModelEntry } from './lib/loadVocabMap'
import { buildTraceScales, buildSurprisalScale } from './lib/scales'
import { MAP_LIMITS } from './lib/mapLimits'
import TopBar, { type ModelStatus } from './components/TopBar'
import QuestionBar from './components/QuestionBar'
import LensRail from './components/LensRail'
import PanelTop, { type TurnRecord } from './components/PanelTop'
import PanelBottom from './components/PanelBottom'
import LocalObservationsPanel from './components/LocalObservationsPanel'
import type { Hover } from './components/hover'

// ── Initial data ───────────────────────────────────────────────────────────────
//
// Presentation-only config (accent color, default active state) for the
// backend's preset lenses — the actual name/system-prompt text is fetched
// from GET /api/presets on mount so the rail never shows different wording
// than what's actually sent to the model. This hardcoded Lens[] is only the
// fallback if that fetch fails (e.g. backend not running yet).

const LENS_UI: Record<string, { accent: string; active: boolean }> = {
  scientist: { accent: '#7b5ea7', active: false },
  philosopher: { accent: '#4a7a7a', active: false },
  poet: { accent: '#b06090', active: true },
  skeptic: { accent: '#c07060', active: false },
  naturalist: { accent: '#5a7a5a', active: true },
}

const FALLBACK_LENSES: Lens[] = [
  {
    id: 'scientist',
    name: 'Scientist',
    accent: LENS_UI.scientist.accent,
    weight: 5,
    active: LENS_UI.scientist.active,
    desc: 'You are a rigorous scientist. You value precision, evidence, and intellectual honesty. You cite mechanisms, not metaphors.',
  },
  {
    id: 'philosopher',
    name: 'Philosopher',
    accent: LENS_UI.philosopher.accent,
    weight: 5,
    active: LENS_UI.philosopher.active,
    desc: 'You are a philosopher who seeks first principles. You examine assumptions, trace implications, and resist easy answers.',
  },
  {
    id: 'poet',
    name: 'Poet',
    accent: LENS_UI.poet.accent,
    weight: 5,
    active: LENS_UI.poet.active,
    desc: 'You are a poet and creative writer. You think in images, metaphors, and emotional resonance. Precision yields to truth.',
  },
  {
    id: 'skeptic',
    name: 'Skeptic',
    accent: LENS_UI.skeptic.accent,
    weight: 5,
    active: LENS_UI.skeptic.active,
    desc: 'You question received wisdom. You probe for gaps, contradictions, and unstated assumptions. Careful, not cynical.',
  },
  {
    id: 'naturalist',
    name: 'Naturalist',
    accent: LENS_UI.naturalist.accent,
    weight: 5,
    active: LENS_UI.naturalist.active,
    desc: 'You are a naturalist who finds wisdom in the patterns of the natural world. You draw analogies between ecosystems and human systems.',
  },
]

const BASELINE_ACCENT = '#8a8480'
const MIXED_ACCENT = '#b07080'
// Used only when the server doesn't say otherwise — GET /api/models'
// `default` field (set via `pollen --model <id>`) always wins when present;
// this is just what dev mode falls back to without that flag.
const FALLBACK_MODEL_NAME = 'mlx-community/Llama-3.2-3B-Instruct-4bit'

function formatModelLoadingLabel(status: DownloadStatus | null): string {
  if (!status || status.state === 'absent') return 'Loading model…'
  if (status.state === 'downloading') {
    // First poll can land before the expected-size computation finishes,
    // in which case progress is still meaningfully 0 — show the state
    // without a misleading "0%" flash.
    const pct = Math.round(status.progress * 100)
    return status.progress > 0 ? `Downloading model… ${pct}%` : 'Downloading model…'
  }
  return 'Loading model…'
}

// UI labels the existing dropdowns already show (out of scope to redesign)
// -> what the backend actually understands.
const COMBINE_MODE_MAP: Record<string, string> = {
  'Find common ground': 'common_ground',
  'Amplify disagreement': 'amplify',
  'Weighted average': 'balance', // this literally is what "balance" computes
}
// Backend only implements 'equal' and a per-token 'confident' mode no UI
// option maps to yet. "Manual" already works regardless of this field —
// each lens's own weight slider flows through as ChatLens.weight either
// way. "Semantic similarity" has no backend counterpart yet.
const WEIGHT_MODE_MAP: Record<string, string> = {
  'Equal weight': 'equal',
  Manual: 'equal',
  'Semantic similarity': 'equal',
}
// session.py only implements these three modes. "All panels" has no true
// equivalent — mapped to the closest *distinct* real behavior rather than
// silently duplicating "Only mixed".
const HISTORY_MODE_MAP: Record<string, string> = {
  'Only mixed': 'only_mixed',
  'Mixed + own': 'mixed_own',
  'All panels': 'only_own',
}
const LENGTH_CONFIG: Record<string, { hint: string; maxTokens: number }> = {
  '1 sentence': { hint: 'Respond in exactly one sentence.', maxTokens: 40 },
  '2–3 sentences': { hint: 'Respond in 2 to 3 sentences.', maxTokens: 90 },
  '1 paragraph': { hint: 'Respond in one short paragraph.', maxTokens: 180 },
  '2 paragraphs': { hint: 'Respond in two short paragraphs.', maxTokens: 320 },
}

function stubPanelData(def: PanelDef): PanelData {
  if (def.id === 'baseline') return { kind: 'baseline', tokens: [] }
  if (def.id === 'mixed') return { kind: 'mixed', tokens: [] }
  return { kind: 'lens', lensId: def.id, tokens: [] }
}

// Backend panel ids are positional (lens_0, lens_1, … in the order the
// `lenses` array was sent), but Lens.id is semantic ("poet"). This is the
// one reconciliation point between the two: null when this panel def has no
// data from the most recent generation (not part of that snapshot yet, or
// no generation has run at all).
function resolveBackendPanelId(def: PanelDef, activeGeneration: { lensIds: string[] } | null): string | null {
  if (def.id === 'baseline') return 'baseline'
  if (def.id === 'mixed') return activeGeneration && activeGeneration.lensIds.length >= 2 ? 'mixed' : null
  if (!activeGeneration) return null
  const idx = activeGeneration.lensIds.indexOf(def.id)
  return idx === -1 ? null : `lens_${idx}`
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useState(false)
  const [lenses, setLenses] = useState<Lens[]>(FALLBACK_LENSES)
  const [question, setQuestion] = useState('how do i make money?')
  const [length, setLength] = useState('2–3 sentences')
  const [combine, setCombine] = useState('Find common ground')
  const [weightMode, setWeightMode] = useState('Equal weight')
  const [history, setHistory] = useState('Only mixed')
  const [traceVisible, setTraceVisible] = useState(true)

  // One id per conversation, not per page load — New Chat rolls this so the
  // backend's session store (which folds prior turns into every new prompt)
  // starts clean rather than quietly continuing whatever came before.
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())

  // Model bootstrap
  const [models, setModels] = useState<ModelEntry[]>([])
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null)
  const [selectedModelDir, setSelectedModelDir] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatus>('loading')
  const [modelError, setModelError] = useState<string | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null)
  const [vocabPoints, setVocabPoints] = useState<VocabPoint[]>([])

  // Live generation
  const [genState, setGenState] = useState<GenState>('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [activeGeneration, setActiveGeneration] = useState<{ lensIds: string[] } | null>(null)
  const [apiPanels, setApiPanels] = useState<Record<string, PanelData>>({})
  const [apiActivations, setApiActivations] = useState<Record<string, VocabActivation[]>>({})
  const [traceDomain, setTraceDomain] = useState({ maxAbsLogRatio: 2, maxKl: 2 })
  const [surprisalDomain, setSurprisalDomain] = useState({ min: 0, max: 4 })
  // atTokenIndex isn't sent by the backend ("derived frontend-side from
  // arrival order") — a plain ref counter, not state, so it's exact and
  // synchronous regardless of React's batching of the setState calls below.
  const tokenCountersRef = useRef<Record<string, number>>({})

  // Raw capture buffer — parallel to apiPanels/apiActivations, not derived
  // from them. Holds every frame exactly as parsed off the wire (including
  // error/done), plus the exact request body that produced them, so a save
  // is a byte-faithful record rather than a reconstruction from UI state.
  // One generation's worth; a new generation replaces it outright.
  const capturedFramesRef = useRef<SSEFrame[]>([])
  const capturedRequestRef = useRef<ChatRequest | null>(null)
  const [captureReady, setCaptureReady] = useState(false)

  // The Observations sidebar's own text — read by handleSaveCapture at
  // Save time regardless of whether the sidebar happens to be open then,
  // so state lives here rather than inside the (conditionally-rendered)
  // panel itself.
  const [observations, setObservations] = useState('')
  const [observationsOpen, setObservationsOpen] = useState(false)

  // Conversation history, shown inside each panel above its live turn.
  // Keyed by the same semantic id every panel already uses (lens.id,
  // 'baseline', 'mixed') — not the backend's positional lens_0/lens_1,
  // which only identifies a slot within one request and can point at a
  // different lens turn to turn if the active selection changes.
  const [turnHistory, setTurnHistory] = useState<Record<string, TurnRecord[]>>({})
  // The just-finished turn's completed answers, keyed positionally
  // (backend panel_id) exactly as they arrive — archived into turnHistory
  // (re-keyed to semantic ids) right before the *next* generation starts,
  // not as each frame arrives, since only then do we know the turn is over
  // and won't be overwritten by more tokens.
  const completedTextsRef = useRef<Record<string, string>>({})
  // The question that produced whatever's currently in apiPanels — distinct
  // from the live `question` state, which may already hold new text the
  // user typed before the previous turn finished archiving.
  const askedQuestionRef = useRef('')

  // Hover used to live inside one Panel component shared by its own text
  // and trace halves; now that PanelTop/PanelBottom are siblings in
  // separate rows, this owns one Hover per panel id and hands the value +
  // a setter to both halves for that panel.
  const [hoverByPanel, setHoverByPanel] = useState<Record<string, Hover | null>>({})

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  // Canonical lens text from the backend, so the rail never shows different
  // wording than what's actually sent to the model.
  useEffect(() => {
    let cancelled = false
    getPresets()
      .then(({ lenses: presets }) => {
        if (cancelled) return
        setLenses(
          presets.map(p => {
            const ui = LENS_UI[p.id] ?? { accent: MIXED_ACCENT, active: false }
            return { id: p.id, name: p.name, desc: p.system_prompt, accent: ui.accent, weight: 5, active: ui.active }
          }),
        )
      })
      .catch(() => {
        // Keep FALLBACK_LENSES — app stays usable, just shows
        // frontend-authored text that may drift from an unreachable backend.
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function loadModel(modelName: string, list: ModelEntry[]) {
    setModelStatus('loading')
    setModelError(null)
    setDownloadStatus(null)

    // switchModel's single await can take minutes on a cold cache — poll
    // /api/model/status concurrently with it (not after) so the real
    // download/load phase and percentage are visible the whole time, not
    // just a static "Loading model…" for the entire wait.
    const pollTimer = setInterval(() => {
      getDownloadStatus().then(setDownloadStatus).catch(() => {})
    }, 750)

    try {
      await switchModel(modelName)
      const current = await getCurrentModel()
      if (!current.model_name || !current.embedding_hash) throw new Error('backend reports no model loaded after switch')
      const entry = list.find(m => m.model_name === modelName)
      if (!entry) throw new Error(`${modelName} is not in the built asset list`)
      const { manifest, points } = await loadVocabMap(entry.dir)
      assertAssetsMatchModel(manifest, current.embedding_hash)
      setVocabPoints(points)
      setSelectedModelName(modelName)
      setSelectedModelDir(entry.dir)
      setModelStatus('ready')
    } catch (e) {
      setModelError(e instanceof Error ? e.message : String(e))
      setModelStatus('error')
    } finally {
      clearInterval(pollTimer)
      setDownloadStatus(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { models: list, default: serverDefault } = await getModels()
        if (cancelled) return
        setModels(list)
        if (list.length === 0) {
          setModelError('No models available — run `python -m pollen.build_assets` first.')
          setModelStatus('error')
          return
        }
        // `pollen --model <id>` (POLLEN_DEFAULT_MODEL) wins when set; the
        // hardcoded fallback only applies in dev, when the CLI flag isn't
        // in play at all.
        const wantedName = serverDefault ?? FALLBACK_MODEL_NAME
        const preferred = list.find(m => m.model_name === wantedName) ?? list[0]
        await loadModel(preferred.model_name, list)
      } catch (e) {
        if (cancelled) return
        setModelError(e instanceof Error ? e.message : String(e))
        setModelStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const panels: PanelDef[] = useMemo(() => {
    const active = lenses.filter(l => l.active)
    const out: PanelDef[] = [{ id: 'baseline', label: 'Baseline', accent: BASELINE_ACCENT }]
    active.forEach(l => out.push({ id: l.id, label: l.name, accent: l.accent }))
    if (active.length >= 2) out.push({ id: 'mixed', label: 'Mixed', accent: MIXED_ACCENT })
    return out
  }, [lenses])

  const narrow = panels.length >= 4

  const lensAccents = useMemo(() => {
    const map: Record<LensId, string> = { baseline: BASELINE_ACCENT, mixed: MIXED_ACCENT }
    lenses.forEach(l => (map[l.id] = l.accent))
    return map
  }, [lenses])

  // Real streaming can't know the full token set's extent up front the way
  // a fully-known fixture Generation could — this domain only grows as
  // frames arrive (reset per generation), and the scales it feeds stay
  // shared across every panel at any instant, same as the spec requires.
  const { yScale, thicknessScale } = useMemo(
    () => buildTraceScales(traceDomain.maxAbsLogRatio, traceDomain.maxKl),
    [traceDomain],
  )
  const { opacityScale } = useMemo(() => buildSurprisalScale(surprisalDomain.min, surprisalDomain.max), [surprisalDomain])
  const mapLimits = useMemo(() => (selectedModelDir ? MAP_LIMITS[selectedModelDir] : undefined), [selectedModelDir])

  function applyFrame(frame: SSEFrame, lensIds: string[]) {
    if (frame.type === 'token') {
      const panelId = frame.panel_id
      const atTokenIndex = tokenCountersRef.current[panelId] ?? 0
      tokenCountersRef.current[panelId] = atTokenIndex + 1

      setApiPanels(prev => {
        const panel = prev[panelId]
        if (!panel) return prev
        if (panel.kind === 'baseline') {
          return { ...prev, [panelId]: { ...panel, tokens: [...panel.tokens, { text: frame.token, surprisal: frame.surprisal }] } }
        }
        if (panel.kind === 'lens') {
          return {
            ...prev,
            [panelId]: {
              ...panel,
              tokens: [...panel.tokens, { text: frame.token, surprisal: frame.surprisal, logRatio: frame.logRatio ?? 0, kl: frame.kl ?? 0 }],
            },
          }
        }
        const idx = frame.dominantLensId ? Number(frame.dominantLensId.replace('lens_', '')) : -1
        const dominant = lensIds[idx] ?? lensIds[0] ?? panelId
        return {
          ...prev,
          [panelId]: {
            ...panel,
            tokens: [
              ...panel.tokens,
              { text: frame.token, surprisal: frame.surprisal, logRatio: frame.logRatio ?? 0, kl: frame.kl ?? 0, dominantLensId: dominant },
            ],
          },
        }
      })

      if (frame.activations.length > 0) {
        setApiActivations(prev => ({
          ...prev,
          [panelId]: [...(prev[panelId] ?? []), ...frame.activations.map(a => ({ ...a, atTokenIndex }))],
        }))
      }

      if (frame.logRatio !== undefined && frame.kl !== undefined) {
        setTraceDomain(d => {
          const maxAbsLogRatio = Math.max(d.maxAbsLogRatio, Math.abs(frame.logRatio!))
          const maxKl = Math.max(d.maxKl, frame.kl!)
          return maxAbsLogRatio === d.maxAbsLogRatio && maxKl === d.maxKl ? d : { maxAbsLogRatio, maxKl }
        })
      }
      setSurprisalDomain(d => {
        const min = Math.min(d.min, frame.surprisal)
        const max = Math.max(d.max, frame.surprisal)
        return min === d.min && max === d.max ? d : { min, max }
      })
    } else if (frame.type === 'panel_done') {
      // The exact backend-provided text for this panel's now-finished turn
      // — archived into turnHistory (re-keyed to this panel's semantic id)
      // right before the *next* generation starts, not here, since more
      // panels may still be mid-stream.
      completedTextsRef.current[frame.panel_id] = frame.text
    } else if (frame.type === 'error') {
      setGenerateError(frame.message)
    } else if (frame.type === 'done') {
      setGenState('complete')
    }
  }

  // Files the just-finished turn (if any) into turnHistory before the next
  // generation wipes apiPanels for it — uses askedQuestionRef (the question
  // that produced the current panels) and activeGeneration's lensIds (this
  // render's still-previous generation), not the live `question` state or
  // a freshly-built lensIds, both of which may already reflect what's
  // about to happen next.
  function archiveCurrentTurn() {
    const askedQuestion = askedQuestionRef.current
    const completed = completedTextsRef.current
    if (!askedQuestion || Object.keys(completed).length === 0) return

    setTurnHistory(h => {
      const next = { ...h }
      const record = (semanticId: string, panelKey: string) => {
        const answer = completed[panelKey]
        if (!answer) return
        next[semanticId] = [...(next[semanticId] ?? []), { question: askedQuestion, answer }]
      }
      record('baseline', 'baseline')
      ;(activeGeneration?.lensIds ?? []).forEach((semanticId, i) => record(semanticId, `lens_${i}`))
      record('mixed', 'mixed')
      return next
    })
  }

  async function handleGenerate() {
    if (genState === 'generating' || modelStatus !== 'ready') return

    archiveCurrentTurn()
    completedTextsRef.current = {}

    const active = lenses.filter(l => l.active)
    const lensIds = active.map(l => l.id)
    askedQuestionRef.current = question

    const initialPanels: Record<string, PanelData> = { baseline: { kind: 'baseline', tokens: [] } }
    active.forEach((l, i) => {
      initialPanels[`lens_${i}`] = { kind: 'lens', lensId: l.id, tokens: [] }
    })
    if (active.length >= 2) initialPanels.mixed = { kind: 'mixed', tokens: [] }

    setActiveGeneration({ lensIds })
    setApiPanels(initialPanels)
    setApiActivations({})
    setHoverByPanel({})
    tokenCountersRef.current = {}
    setTraceDomain({ maxAbsLogRatio: 2, maxKl: 2 })
    setSurprisalDomain({ min: 0, max: 4 })
    setGenerateError(null)
    setGenState('generating')
    capturedFramesRef.current = []
    capturedRequestRef.current = null
    setCaptureReady(false)

    const lengthConfig = LENGTH_CONFIG[length] ?? LENGTH_CONFIG['2–3 sentences']
    const request: ChatRequest = {
      session_id: sessionId,
      user_message: question,
      lenses: active.map(l => ({ id: l.id, name: l.name, system_prompt: l.desc, weight: l.weight })),
      model_name: selectedModelName ?? undefined,
      combine_mode: COMBINE_MODE_MAP[combine] ?? 'common_ground',
      weight_mode: WEIGHT_MODE_MAP[weightMode] ?? 'equal',
      history_mode: HISTORY_MODE_MAP[history] ?? 'only_mixed',
      max_new_tokens: lengthConfig.maxTokens,
      temperature: 1.0,
      length_hint: lengthConfig.hint,
    }

    capturedRequestRef.current = request

    try {
      for await (const frame of streamChat(request)) {
        capturedFramesRef.current.push(frame)
        applyFrame(frame, lensIds)
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e))
      setGenState('idle')
    } finally {
      // A run that errored partway still produced frames worth keeping —
      // capture eligibility only requires the buffer to be non-empty, not a
      // clean 'done'. A total connection failure (zero frames) leaves
      // nothing worth saving.
      if (capturedFramesRef.current.length > 0) setCaptureReady(true)
    }
  }

  // Clears the conversation only — session id, panel content, and turn
  // history. Deliberately leaves lenses/combine/weightMode/history/length
  // and the current question text untouched: those are workspace setup,
  // not part of "this conversation."
  function handleNewChat() {
    if (genState === 'generating') return
    resetSession(sessionId).catch(e => console.error('session reset failed', e)) // cleanup, not load-bearing
    setSessionId(crypto.randomUUID())
    setActiveGeneration(null)
    setApiPanels({})
    setApiActivations({})
    setHoverByPanel({})
    setTurnHistory({})
    completedTextsRef.current = {}
    askedQuestionRef.current = ''
    tokenCountersRef.current = {}
    setTraceDomain({ maxAbsLogRatio: 2, maxKl: 2 })
    setSurprisalDomain({ min: 0, max: 4 })
    setGenState('idle')
    setGenerateError(null)
    capturedFramesRef.current = []
    capturedRequestRef.current = null
    setCaptureReady(false)
    setObservations('') // notes on the old conversation don't belong to the new one
  }

  async function handleSaveCapture(slug: string, folder: string | null): Promise<CaptureResult> {
    if (!capturedRequestRef.current || capturedFramesRef.current.length === 0) {
      throw new Error('nothing to save yet')
    }
    return saveCapture({
      slug,
      request: capturedRequestRef.current,
      frames: capturedFramesRef.current,
      folder,
      observations: observations.trim() || undefined,
    })
  }

  const bannerMessage = modelError ?? generateError

  // Computed once, shared by both the top-row and bottom-row passes below
  // — same resolution either way, just rendered into two different rows
  // now that PanelTop/PanelBottom are siblings instead of one component.
  const resolvedPanels = panels.map(p => {
    const backendId = resolveBackendPanelId(p, activeGeneration)
    const hasData = Boolean(backendId && apiPanels[backendId])
    const data = (backendId && apiPanels[backendId]) || stubPanelData(p)
    const activations = (backendId && apiActivations[backendId]) || []
    const panelGenState: GenState = hasData ? genState : 'idle'
    return { def: p, data, activations, panelGenState }
  })

  const hasConversation = genState !== 'idle' || Object.keys(turnHistory).length > 0

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', overflow: 'hidden' }}>
      <TopBar
        length={length}
        setLength={setLength}
        genState={genState}
        panelCount={panels.length}
        dark={dark}
        setDark={setDark}
        traceVisible={traceVisible}
        setTraceVisible={setTraceVisible}
        models={models}
        selectedModelName={selectedModelName}
        onSelectModel={name => loadModel(name, models)}
        modelStatus={modelStatus}
        modelLoadingLabel={formatModelLoadingLabel(downloadStatus)}
        captureReady={captureReady}
        onSaveCapture={handleSaveCapture}
        observationsOpen={observationsOpen}
        onToggleObservations={() => setObservationsOpen(o => !o)}
      />

      {bannerMessage && (
        <div
          style={{
            flexShrink: 0,
            padding: '6px 16px',
            borderBottom: '1px solid var(--hairline)',
            fontSize: 11.5,
            color: 'var(--ink-muted)',
            fontFamily: 'Instrument Sans, sans-serif',
          }}
        >
          {bannerMessage}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <LensRail
          lenses={lenses}
          setLenses={setLenses}
          combine={combine}
          setCombine={setCombine}
          weightMode={weightMode}
          setWeightMode={setWeightMode}
          history={history}
          setHistory={setHistory}
        />

        {/* Answers — each panel's tag + map + text (including its own
            conversation history). The question breaker and traces sit
            below, outside the rail's column so the rail spans both. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
            {resolvedPanels.map(({ def, data, activations, panelGenState }) => (
              <PanelTop
                key={def.id}
                def={def}
                data={data}
                vocabPoints={vocabPoints}
                mapLimits={mapLimits}
                activations={activations}
                genState={panelGenState}
                revealCount={Infinity}
                opacityScale={opacityScale}
                lensAccents={lensAccents}
                isDark={dark}
                narrow={narrow}
                history={turnHistory[def.id] ?? []}
                currentQuestion={askedQuestionRef.current}
                hover={hoverByPanel[def.id] ?? null}
                onHover={h => setHoverByPanel(prev => ({ ...prev, [def.id]: h }))}
              />
            ))}
          </div>

          <QuestionBar
            question={question}
            setQuestion={setQuestion}
            genState={genState}
            onGenerate={handleGenerate}
            modelStatus={modelStatus}
            modelError={modelError}
            modelLoadingLabel={formatModelLoadingLabel(downloadStatus)}
            onNewChat={handleNewChat}
            hasConversation={hasConversation}
          />

          <div style={{ flexShrink: 0, display: 'flex', overflow: 'hidden' }}>
            {resolvedPanels.map(({ def, data }) => (
              <PanelBottom
                key={def.id}
                data={data}
                accent={def.accent}
                revealCount={Infinity}
                yScale={yScale}
                thicknessScale={thicknessScale}
                lensAccents={lensAccents}
                narrow={narrow}
                traceVisible={traceVisible}
                hover={hoverByPanel[def.id] ?? null}
                onHover={h => setHoverByPanel(prev => ({ ...prev, [def.id]: h }))}
                isDark={dark}
              />
            ))}
          </div>
        </div>
      </div>

      <LocalObservationsPanel
        open={observationsOpen}
        onClose={() => setObservationsOpen(false)}
        value={observations}
        onChange={setObservations}
      />
    </div>
  )
}
