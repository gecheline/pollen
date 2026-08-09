// Backend client — thin typed wrappers over pollen/main.py's routes, plus
// the SSE stream reader for /api/chat.
//
// Every path here is relative ('/api/...'), never an absolute
// 'http://localhost:...' URL. In dev, Vite's proxy (vite.config.ts) forwards
// /api and /assets to the backend on :8000; in the packaged app, FastAPI
// serves the built frontend itself, so a relative fetch is already
// same-origin. An absolute localhost URL baked into the build would work in
// dev and silently break for every user who isn't the developer — the one
// class of bug this file is written to make impossible.
//
// /api/chat is a POST carrying a JSON body, so the native EventSource (GET
// only) can't consume it. streamChat() reads the response body as a raw
// byte stream instead, decoding and splitting on the SSE frame boundary by
// hand — the one genuinely new piece of transport code this pass adds.

import type { ModelEntry } from './loadVocabMap'

// ── REST routes ──────────────────────────────────────────────────────────────

export interface CurrentModel {
  model_name: string | null
  embedding_hash: string | null
  vocab_size: number | null
}

export interface PresetLens {
  id: string
  name: string
  system_prompt: string
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function getModels(): Promise<{ models: ModelEntry[]; loaded: string | null; default: string | null }> {
  return getJSON('/api/models')
}

export async function getCurrentModel(): Promise<CurrentModel> {
  return getJSON('/api/model/current')
}

export interface DownloadStatus {
  state: 'absent' | 'downloading' | 'loading' | 'ready'
  progress: number
  model_name: string | null
  error: string | null
}

// Polled while a model switch is in flight (see App.tsx) — cheap and
// separate from the switch itself, so it stays responsive for the whole
// multi-minute duration a cold download can take.
export async function getDownloadStatus(): Promise<DownloadStatus> {
  return getJSON('/api/model/status')
}

export async function switchModel(modelName: string): Promise<CurrentModel> {
  return postJSON('/api/model', { model_name: modelName })
}

export async function getPresets(): Promise<{ lenses: PresetLens[] }> {
  return getJSON('/api/presets')
}

export async function resetSession(sessionId: string): Promise<void> {
  await postJSON('/api/session/reset', { session_id: sessionId })
}

// ── Captures ──────────────────────────────────────────────────────────────────

export interface CaptureResult {
  path: string
  bytes: number
}

export interface CaptureListEntry {
  filename: string
  captured_at: string
  slug: string
  user_message: string
  bytes: number
}

// request/frames travel as plain unknown values, not typed against
// ChatRequest/SSEFrame — this must forward exactly the objects the app sent
// and received, with zero reshaping on the way to the wire. Typing them
// narrowly here would invite "helpfully" normalizing a field in transit,
// which is exactly what a byte-faithful capture can't tolerate.
export async function saveCapture(payload: { slug: string; request: unknown; frames: unknown[] }): Promise<CaptureResult> {
  return postJSON('/api/capture', payload)
}

export async function listCaptures(): Promise<CaptureListEntry[]> {
  return getJSON('/api/captures')
}

// ── Chat (SSE) ────────────────────────────────────────────────────────────────

export interface ChatLens {
  id: string
  name: string
  system_prompt: string
  weight: number
}

export interface ChatRequest {
  session_id: string
  user_message: string
  lenses: ChatLens[]
  model_name?: string | null
  combine_mode?: string
  weight_mode?: string
  history_mode?: string
  max_new_tokens?: number
  temperature?: number
  length_hint?: string
}

interface ActivationFrame {
  pointIndex: number
  strength: number
}

export type SSEFrame =
  | {
      type: 'token'
      panel_id: string
      token: string
      token_id: number
      surprisal: number
      activations: ActivationFrame[]
      logRatio?: number
      kl?: number
      dominantLensId?: string
    }
  | { type: 'panel_done'; panel_id: string; text: string }
  | { type: 'error'; message: string; traceback?: string }
  | { type: 'done' }

// Reads the SSE byte stream and yields one parsed frame per `data: ` line.
// Frames are separated by a blank line per the SSE wire format; a chunk can
// split a frame across reads, so incomplete text is held in `buffer` until
// the next read completes it.
export async function* streamChat(request: ChatRequest, opts?: { fixtures?: boolean }): AsyncGenerator<SSEFrame> {
  const url = `/api/chat${opts?.fixtures ? '?fixtures=1' : ''}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok || !res.body) {
    throw new Error(`/api/chat: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const rawFrame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const dataLine = rawFrame.split('\n').find(line => line.startsWith('data: '))
      if (!dataLine) continue
      yield JSON.parse(dataLine.slice('data: '.length)) as SSEFrame
    }
  }
}
