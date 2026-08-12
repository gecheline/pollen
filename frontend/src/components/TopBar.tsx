// Top bar — brand, model + length selects, panel count, Save, Trace, Dark.
// The question input, Generate, and New Chat live in QuestionBar.tsx now,
// as a full-width breaker between each panel's answer and its trace,
// rather than here — see App.tsx's three-row layout.

import { useEffect, useRef, useState } from 'react'
import Label from './Label'
import type { GenState } from '../types'
import type { ModelEntry } from '../lib/loadVocabMap'
import { chooseSaveFolder, type CaptureResult } from '../lib/api'

export type ModelStatus = 'loading' | 'ready' | 'error'

interface TopBarProps {
  length: string
  setLength: (v: string) => void
  genState: GenState
  panelCount: number
  dark: boolean
  setDark: (v: boolean) => void
  traceVisible: boolean
  setTraceVisible: (v: boolean) => void
  models: ModelEntry[]
  selectedModelName: string | null
  onSelectModel: (modelName: string) => void
  modelStatus: ModelStatus
  modelLoadingLabel: string
  captureReady: boolean
  onSaveCapture: (slug: string, folder: string | null) => Promise<CaptureResult>
  observationsOpen: boolean
  onToggleObservations: () => void
}

// mlx-community/Llama-3.2-3B-Instruct-4bit -> Llama-3.2-3B-Instruct-4bit —
// the org prefix is the same for every model this app offers, so it's noise
// in a compact select.
function shortModelName(modelName: string): string {
  return modelName.split('/').pop() ?? modelName
}

const SAVED_FLASH_MS = 3000

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || path
}

// An instrument control, not a call to action: text swaps in place rather
// than a popover/modal. Idle -> click opens an inline slug field (Enter
// saves, Escape cancels) -> briefly shows the filename it wrote, then
// reverts. Owns only this transient UI state; the actual frame buffer and
// save call live in App.tsx, which is the only thing that knows what a
// "completed generation" is.
//
// The chosen destination folder is state here too, not lifted to App.tsx —
// TopBar/SaveControl never unmounts across generations, so a plain useState
// already gives exactly "remember it for the session, reset on reload"
// without any extra plumbing.
function SaveControl({
  ready,
  disabled,
  onSave,
}: {
  ready: boolean
  disabled: boolean
  onSave: (slug: string, folder: string | null) => Promise<CaptureResult>
}) {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFilename, setSavedFilename] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [pickingFolder, setPickingFolder] = useState(false)
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
      const { path } = await onSave(slug, folder)
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

  const changeFolder = async () => {
    setPickingFolder(true)
    try {
      const path = await chooseSaveFolder()
      if (path) setFolder(path) // null = user canceled the dialog — leave the current choice alone
    } catch (e) {
      console.error('folder picker failed', e)
    } finally {
      setPickingFolder(false)
    }
  }

  if (savedFilename) {
    return (
      <span style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Saved: {savedFilename}</span>
    )
  }

  if (open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
            fontSize: 10.5,
            letterSpacing: '0.04em',
            color: 'var(--ink)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            title={folder ?? '~/.pollen/captures (default)'}
            style={{
              fontSize: 9,
              color: 'var(--ink-faint)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 90,
            }}
          >
            {folder ? basename(folder) : 'captures'}
          </span>
          <button
            // preventDefault on mousedown, not just the click handler: a
            // plain click here would first blur the slug input above,
            // which calls close() and unmounts this whole form before the
            // click itself ever fires — this is what stops that.
            onMouseDown={e => e.preventDefault()}
            onClick={changeFolder}
            disabled={pickingFolder}
            style={{
              background: 'none',
              border: 'none',
              cursor: pickingFolder ? 'wait' : 'pointer',
              padding: 0,
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
              textDecoration: 'underline',
              whiteSpace: 'nowrap',
            }}
          >
            {pickingFolder ? '…' : 'change'}
          </button>
        </div>
      </div>
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
        fontSize: 10.5,
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
  length,
  setLength,
  genState,
  panelCount,
  dark,
  setDark,
  traceVisible,
  setTraceVisible,
  models,
  selectedModelName,
  onSelectModel,
  modelStatus,
  modelLoadingLabel,
  captureReady,
  onSaveCapture,
  observationsOpen,
  onToggleObservations,
}: TopBarProps) {
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
        <span style={{ fontSize: 10.5, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>pollen</span>
      </div>

      {/* Model + Length */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', flexShrink: 0 }}>
        <div>
          <Label style={{ marginBottom: 3 }}>Model</Label>
          {modelStatus === 'loading' ? (
            <span style={{ fontSize: 12.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{modelLoadingLabel}</span>
          ) : models.length === 0 ? (
            <span style={{ fontSize: 12.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>Loading…</span>
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
      </div>

      {/* Panel count + mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', flexShrink: 0, borderLeft: '1px solid var(--hairline)' }}>
        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{panelCount} panels</span>
        <SaveControl ready={captureReady} disabled={genState === 'generating'} onSave={onSaveCapture} />
        <button
          onClick={onToggleObservations}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 10.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: observationsOpen ? 'var(--ink-muted)' : 'var(--ink-faint)',
            whiteSpace: 'nowrap',
          }}
        >
          Observations
        </button>
        <button
          onClick={() => setTraceVisible(!traceVisible)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 10.5,
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
            fontSize: 10.5,
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
