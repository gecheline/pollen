// The question input, Generate, and New Chat — a full-width breaker
// between every panel's answer text (above) and its trace (below), so
// asking a question reads as the seam in the specimen sheet it actually
// is, not a control buried in the top bar. Split out of TopBar.tsx, same
// visual language (hairlines, Instrument Sans, uppercase 10px controls).

import type { GenState } from '../types'
import type { ModelStatus } from './TopBar'

interface QuestionBarProps {
  question: string
  setQuestion: (v: string) => void
  genState: GenState
  onGenerate: () => void
  modelStatus: ModelStatus
  modelError: string | null
  modelLoadingLabel: string
  onNewChat: () => void
  hasConversation: boolean
}

export default function QuestionBar({
  question,
  setQuestion,
  genState,
  onGenerate,
  modelStatus,
  modelError,
  modelLoadingLabel,
  onNewChat,
  hasConversation,
}: QuestionBarProps) {
  const canGenerate = genState !== 'generating' && modelStatus === 'ready'
  const canStartNewChat = genState !== 'generating' && hasConversation

  return (
    <div
      style={{
        flexShrink: 0,
        height: 48,
        display: 'flex',
        alignItems: 'stretch',
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface-raised)',
      }}
    >
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && canGenerate) onGenerate()
        }}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px', flexShrink: 0, borderLeft: '1px solid var(--hairline)' }}>
        <button
          onClick={onNewChat}
          disabled={!canStartNewChat}
          title={hasConversation ? 'Clear this conversation and start a new one' : undefined}
          style={{
            background: 'none',
            border: 'none',
            cursor: canStartNewChat ? 'pointer' : 'default',
            padding: 0,
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: canStartNewChat ? 'var(--ink-muted)' : 'var(--ink-faint)',
            whiteSpace: 'nowrap',
          }}
        >
          New chat
        </button>
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
    </div>
  )
}
