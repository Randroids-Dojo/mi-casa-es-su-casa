'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { VisitorLog } from '@/lib/visitorSchema'

interface VisitorPanelProps {
  characterName: string
  /** Called with the message text after a successful POST */
  onMessagePosted?: (text: string) => void
}

const CRT_GREEN = '#33ff33'
const CRT_DIM = 'rgba(51,255,51,0.55)'
const FONT = '"Share Tech Mono", "Courier New", Courier, monospace'

function formatAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function VisitorPanel({ characterName, onMessagePosted }: VisitorPanelProps) {
  const [log, setLog] = useState<VisitorLog | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [collapsed, setCollapsed] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayName = characterName.replace(/-/g, ' ').toUpperCase()

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/character/${characterName}/messages`)
      if (!res.ok) return
      const data = (await res.json()) as VisitorLog
      setLog(data)
    } catch {
      // silent on background refresh failure
    }
  }, [characterName])

  useEffect(() => {
    void fetchLog()
    const interval = setInterval(() => { void fetchLog() }, 30_000)
    return () => clearInterval(interval)
  }, [fetchLog])

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim()
    if (!text) return
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/character/${characterName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setErrorMsg(err.error ?? 'SEND FAILED')
        setStatus('error')
        return
      }
      const updated = (await res.json()) as VisitorLog
      setLog(updated)
      setInputValue('')
      setStatus('idle')
      onMessagePosted?.(text)
    } catch {
      setErrorMsg('CONNECTION ERROR')
      setStatus('error')
    }
  }, [characterName, inputValue, onMessagePosted])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void handleSubmit()
    },
    [handleSubmit],
  )

  const recentMessages = log ? [...log.messages].reverse().slice(0, 5) : []
  const count = log?.totalCount ?? 0

  return (
    <div style={{ ...styles.panel, height: collapsed ? '40px' : '260px', transition: 'height 0.2s ease' }}>
      {/* Scanline overlay */}
      <div style={styles.scanlines} aria-hidden="true" />

      <div style={styles.inner}>
        {/* Toggle header */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={styles.toggleBar}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand visitor messages' : 'Collapse visitor messages'}
        >
          <span>
            {count > 0
              ? `${count} VISITOR${count !== 1 ? 'S' : ''} FOR ${displayName}`
              : `VISITOR MESSAGES FOR ${displayName}`}
          </span>
          <span style={styles.toggleArrow}>{collapsed ? '▲' : '▼'}</span>
        </button>

        <div style={styles.divider} aria-hidden="true">{'─'.repeat(44)}</div>

        {/* Message list */}
        <div style={styles.messageList}>
          {recentMessages.length === 0 ? (
            <div style={styles.empty}>NO MESSAGES YET. BE THE FIRST!</div>
          ) : (
            recentMessages.map((msg, i) => (
              <div key={i} style={styles.messageRow}>
                <span style={styles.bullet}>&gt;</span>
                <span style={styles.msgText}>{msg.text}</span>
                <span style={styles.timestamp}>{formatAge(msg.postedAt)}</span>
              </div>
            ))
          )}
        </div>

        <div style={styles.divider} aria-hidden="true">{'─'.repeat(44)}</div>

        {/* Input */}
        <div style={styles.inputRow}>
          <span style={styles.prompt}>&gt;</span>
          <label htmlFor="visitor-msg-input" className="sr-only">
            Leave a message for {characterName}
          </label>
          <input
            ref={inputRef}
            id="visitor-msg-input"
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              if (status === 'error') setStatus('idle')
            }}
            onKeyDown={handleKeyDown}
            maxLength={100}
            disabled={status === 'submitting'}
            placeholder="LEAVE A MESSAGE..."
            autoComplete="off"
            spellCheck={false}
            style={styles.input}
          />
          <button
            onClick={() => { void handleSubmit() }}
            disabled={status === 'submitting' || inputValue.trim() === ''}
            style={{
              ...styles.sendButton,
              opacity: status === 'submitting' || inputValue.trim() === '' ? 0.4 : 1,
              cursor: status === 'submitting' || inputValue.trim() === '' ? 'default' : 'pointer',
            }}
            aria-label="Send message"
          >
            {status === 'submitting' ? '...' : 'SEND'}
          </button>
        </div>

        {status === 'error' && (
          <div role="alert" aria-live="assertive" style={styles.errorLine}>
            ERROR: {errorMsg}
          </div>
        )}

        <div style={styles.charCount}>{inputValue.length}/100</div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#000',
    borderTop: '1px solid rgba(51,255,51,0.25)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  toggleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'none',
    border: 'none',
    color: CRT_GREEN,
    fontFamily: FONT,
    fontSize: '12px',
    textShadow: `0 0 6px ${CRT_GREEN}`,
    cursor: 'pointer',
    padding: '0',
    marginBottom: '8px',
    height: '24px',
    flexShrink: 0,
  },
  toggleArrow: {
    fontSize: '10px',
    opacity: 0.7,
    flexShrink: 0,
    marginLeft: '8px',
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  inner: {
    position: 'relative',
    zIndex: 2,
    padding: '16px 20px 12px',
    fontFamily: FONT,
    fontSize: '13px',
    lineHeight: '1.6',
    color: CRT_GREEN,
    textShadow: `0 0 6px ${CRT_GREEN}`,
  },
  header: {
    fontSize: '12px',
    opacity: 0.85,
    marginBottom: '8px',
  },
  divider: {
    color: CRT_DIM,
    textShadow: 'none',
    marginBottom: '8px',
    overflow: 'hidden',
  },
  messageList: {
    minHeight: '72px',
    marginBottom: '8px',
  },
  empty: {
    opacity: 0.45,
  },
  messageRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'baseline',
    marginBottom: '4px',
    wordBreak: 'break-word',
  },
  bullet: {
    color: CRT_DIM,
    flexShrink: 0,
    textShadow: 'none',
  },
  msgText: {
    flex: 1,
  },
  timestamp: {
    color: CRT_DIM,
    fontSize: '11px',
    flexShrink: 0,
    textShadow: 'none',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  prompt: {
    color: CRT_DIM,
    flexShrink: 0,
    textShadow: 'none',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(51,255,51,0.4)',
    outline: 'none',
    color: CRT_GREEN,
    fontFamily: FONT,
    fontSize: '13px',
    textShadow: `0 0 6px ${CRT_GREEN}`,
    caretColor: CRT_GREEN,
    padding: '2px 0',
  },
  sendButton: {
    background: 'transparent',
    border: '1px solid rgba(51,255,51,0.5)',
    color: CRT_GREEN,
    fontFamily: FONT,
    fontSize: '13px',
    textShadow: `0 0 6px ${CRT_GREEN}`,
    padding: '2px 12px',
    flexShrink: 0,
  },
  errorLine: {
    color: '#ff4444',
    textShadow: '0 0 6px #ff4444',
    fontSize: '12px',
    marginBottom: '2px',
  },
  charCount: {
    color: CRT_DIM,
    fontSize: '11px',
    textAlign: 'right' as const,
    textShadow: 'none',
  },
}
