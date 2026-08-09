// Top bar — brand, question input, model + length selects, Generate, panel
// count, light/dark toggle. Moved out of App.tsx for hygiene; content and
// behavior are unchanged from the Figma Make export (out of scope for the
// visualization pass) except for the model select and loading/error state
// added when the app was wired to a real backend.

import { useEffect, useRef, useState } from 'react'
import Label from './Label'
import type { GenState } from '../types'
import type { ModelEntry } from '../lib/loadVocabMap'
import type { CaptureResult } from '../lib/api'

export type ModelStatus = 'loading' | 'ready' | 'error'

interface TopBarProps {
  question: string
  setQuestion: (v: string) => void
  length: string
  setLength: (v: string) => void
  genState: GenState
  onGenerate: () => void
  panelCount: number
  dark: boolean
  setDark: (v: boolean) => void
  traceVisible: boolean
  setTraceVisible: (v: boolean) => void
  models: ModelEntry[]
  selectedModelName: string | null
  onSelectModel: (modelName: string) => void
  modelStatus: ModelStatus
  modelError: string | null
  modelLoadingLabel: string
  captureReady: boolean
  onSaveCapture: (slug: string) => Promise<CaptureResult>
}

// mlx-community/Llama-3.2-3B-Instruct-4bit -> Llama-3.2-3B-Instruct-4bit —
// the org prefix is the same for every model this app offers, so it's noise
// in a compact select.
function shortModelName(modelName: string): string {
  return modelName.split('/').pop() ?? modelName
}

const SAVED_FLASH_MS = 3000

// An instrument control, not a call to action: text swaps in place rather
// than a popover/modal. Idle -> click opens an inline slug field (Enter
// saves, Escape cancels) -> briefly shows the filename it wrote, then
// reverts. Owns only this transient UI state; the actual frame buffer and
// save call live in App.tsx, which is the only thing that knows what a
// "completed generation" is.
function SaveControl({
  ready,
  disabled,
  onSave,
}: {
  ready: boolean
  disabled: boolean
  onSave: (slug: string) => Promise<CaptureResult>
}) {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFilename, setSavedFilename] = useState<string | null>(null)
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (revertTimer.current) clearTimeout(revertTimer.current)
  }, [])

  const close = () => {
    setOpen(false)
    setSlug('')
  }

  const commit = async () => {
    setSaving(true)
    try {
      const { path } = await onSave(slug)
      setSavedFilename(path.split('/').pop() ?? path)
      revertTimer.current = setTimeout(() => setSavedFilename(null), SAVED_FLASH_MS)
    } catch (e) {
      // Minimal by design — SAVE has no error-message surface of its own;
      // failing back to the plain button (rather than a stuck "Saving…")
      // is enough of a signal to just try again.
      console.error('capture save failed', e)
    } finally {
      setSaving(false)
      close()
    }
  }

  if (savedFilename) {
    return (
      <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Saved: {savedFilename}</span>
    )
  }

  if (open) {
    return (
      <input
        autoFocus
        disabled={saving}
        value={slug}
        onChange={e => setSlug(e.target.value)}
        onBlur={close}
        onKeyDown={e => {
          if (e.key === 'Escape') close()
          if (e.key === 'Enter') commit()
        }}
        placeholder="slug (optional)"
        style={{
          width: 150,
          background: 'none',
          border: '1px solid var(--hairline)',
          outline: 'none',
          borderRadius: 0,
          padding: '3px 6px',
          fontFamily: 'Instrument Sans, sans-serif',
          fontSize: 9,
          letterSpacing: '0.04em',
          color: 'var(--ink)',
        }}
      />
    )
  }

  const enabled = ready && !disabled
  return (
    <button
      onClick={() => setOpen(true)}
      disabled={!enabled}
      style={{
        background: 'none',
        border: 'none',
        cursor: enabled ? 'pointer' : 'default',
        padding: 0,
        fontSize: 9,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: enabled ? 'var(--ink-muted)' : 'var(--ink-faint)',
        whiteSpace: 'nowrap',
      }}
    >
      Save
    </button>
  )
}

export default function TopBar({
  question,
  setQuestion,
  length,
  setLength,
  genState,
  onGenerate,
  panelCount,
  dark,
  setDark,
  traceVisible,
  setTraceVisible,
  models,
  selectedModelName,
  onSelectModel,
  modelStatus,
  modelError,
  modelLoadingLabel,
  captureReady,
  onSaveCapture,
}: TopBarProps) {
  const canGenerate = genState !== 'generating' && modelStatus === 'ready'
  return (
    <div style={{ flexShrink: 0, height: 52, display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--hairline)' }}>
      {/* Brand */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          borderRight: '1px solid var(--hairline)',
          background: 'var(--surface-raised)',
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>pollen</span>
      </div>

      {/* Question input */}
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="enter a question"
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          outline: 'none',
          padding: '0 16px',
          fontFamily: 'Instrument Sans, sans-serif',
          fontSize: 14,
          color: 'var(--ink)',
        }}
      />

      {/* Model + Length + Generate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', flexShrink: 0, borderLeft: '1px solid var(--hairline)' }}>
        <div>
          <Label style={{ marginBottom: 3 }}>Model</Label>
          {modelStatus === 'loading' ? (
            <span style={{ fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{modelLoadingLabel}</span>
          ) : models.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>Loading…</span>
          ) : (
            <select value={selectedModelName ?? ''} onChange={e => onSelectModel(e.target.value)}>
              {models.map(m => (
                <option key={m.model_name} value={m.model_name}>
                  {shortModelName(m.model_name)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <Label style={{ marginBottom: 3 }}>Length</Label>
          <select value={length} onChange={e => setLength(e.target.value)}>
            <option>1 sentence</option>
            <option>2–3 sentences</option>
            <option>1 paragraph</option>
            <option>2 paragraphs</option>
          </select>
        </div>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          title={modelStatus === 'error' ? (modelError ?? undefined) : undefined}
          style={{
            background: 'none',
            border: '1px solid var(--hairline)',
            cursor: canGenerate ? 'pointer' : 'wait',
            padding: '5px 12px',
            fontFamily: 'Instrument Sans, sans-serif',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: canGenerate ? 'var(--ink)' : 'var(--ink-muted)',
            borderRadius: 0,
            whiteSpace: 'nowrap',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {genState === 'generating' ? 'Generating…' : modelStatus === 'loading' ? modelLoadingLabel : modelStatus === 'error' ? 'Model error' : 'Generate →'}
        </button>
      </div>

      {/* Panel count + mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', flexShrink: 0, borderLeft: '1px solid var(--hairline)' }}>
        <span style={{ fontSize: 9, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{panelCount} panels</span>
        <SaveControl ready={captureReady} disabled={genState === 'generating'} onSave={onSaveCapture} />
        <button
          onClick={() => setTraceVisible(!traceVisible)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: traceVisible ? 'var(--ink-muted)' : 'var(--ink-faint)',
            whiteSpace: 'nowrap',
          }}
        >
          Trace
        </button>
        <button
          onClick={() => setDark(!dark)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {dark ? '◑ Light' : '◐ Dark'}
        </button>
      </div>
    </div>
  )
}
