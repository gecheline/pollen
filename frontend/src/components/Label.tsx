import type { ReactNode, CSSProperties } from 'react'

export default function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'block',
        fontSize: 9,
        letterSpacing: '0.13em',
        textTransform: 'uppercase',
        color: 'var(--ink-muted)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
