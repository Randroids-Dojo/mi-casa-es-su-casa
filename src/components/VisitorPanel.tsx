'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { VisitorLog, VisitorMessage } from '@/lib/visitorSchema'

interface VisitorPanelProps {
  characterName: string
  /** Called with the message text after a successful POST */
  onMessagePosted?: (text: string) => void
}

const CRT_GREEN = '#33ff33'
const CRT_DIM = 'rgba(51,255,51,0.55)'
const CRT_AMBER = '#ffbb33'
const CRT_AMBER_DIM = 'rgba(255,187,51,0.55)'
const FONT = '"Share Tech Mono", "Courier New", Courier, monospace'
const MESSAGE_LIMIT = 69

function formatAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function creatorLabel(characterName: string): string {
  const display = characterName.replace(/-/g, ' ')
  return `${display}'s Creator`
}

function isCreatorSender(sender: string | undefined, characterName: string): boolean {
  return !sender || sender === creatorLabel(characterName)
}

function senderColor(msg: VisitorMessage, characterName: string): string {
  return isCreatorSender(msg.sender, characterName) ? CRT_GREEN : CRT_AMBER
}

function senderDimColor(msg: VisitorMessage, characterName: string): string {
  return isCreatorSender(msg.sender, characterName) ? CRT_DIM : CRT_AMBER_DIM
}

export function VisitorPanel({ characterName, onMessagePosted }: VisitorPanelProps) {
  const [log, setLog] = useState<VisitorLog | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [collapsed, setCollapsed] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sender selection state
  const defaultSender = creatorLabel(characterName)
  const [sender, setSender] = useState(defaultSender)
  const [senderOpen, setSenderOpen] = useState(false)
  const [senderSearch, setSenderSearch] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const senderRef = useRef<HTMLDivElement>(null)
  const senderInputRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const displayName = characterName.replace(/-/g, ' ').toUpperCase()

  // Close sender dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (senderRef.current && !senderRef.current.contains(e.target as Node)) {
        setSenderOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (senderOpen) {
      senderInputRef.current?.focus()
    }
  }, [senderOpen])

  // Debounced search for character names
  useEffect(() => {
    if (!senderOpen) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (senderSearch.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/characters/search?q=${encodeURIComponent(senderSearch)}`)
        if (res.ok) {
          const data = (await res.json()) as { names: string[] }
          setSearchResults(data.names)
        }
      } catch {
        // silent
      } finally {
        setSearchLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [senderSearch, senderOpen])

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
        body: JSON.stringify({ text, sender }),
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
  }, [characterName, inputValue, sender, onMessagePosted])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void handleSubmit()
    },
    [handleSubmit],
  )

  const selectSender = useCallback((name: string) => {
    setSender(name)
    setSenderOpen(false)
    setSenderSearch('')
    setSearchResults([])
  }, [])

  const recentMessages = log ? [...log.messages].reverse() : []
  const atCapacity = recentMessages.length >= MESSAGE_LIMIT
  const count = log?.totalCount ?? 0

  return (
    <div style={{ ...styles.panel, height: collapsed ? '40px' : '420px', transition: 'height 0.2s ease' }}>
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
          <span style={styles.toggleArrow}>{collapsed ? '▼' : '▲'}</span>
        </button>

        <div style={styles.divider} aria-hidden="true">{'─'.repeat(44)}</div>

        {/* Message list */}
        <div ref={listRef} style={styles.messageList}>
          {recentMessages.length === 0 ? (
            <div style={styles.empty}>NO MESSAGES YET. BE THE FIRST!</div>
          ) : (
            recentMessages.map((msg, i) => {
              const color = senderColor(msg, characterName)
              const dimColor = senderDimColor(msg, characterName)
              const senderLabel = msg.sender ?? creatorLabel(characterName)
              const isOldest = atCapacity && i === recentMessages.length - 1
              return (
                <div
                  key={i}
                  style={{
                    ...styles.messageRow,
                    ...(isOldest ? styles.fallingOff : undefined),
                  }}
                >
                  <span style={{ ...styles.bullet, color: dimColor }}>&gt;</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: '10px',
                      color: dimColor,
                      textShadow: 'none',
                      textTransform: 'uppercase' as const,
                    }}>
                      {senderLabel}
                    </span>
                    <div style={{
                      color,
                      textShadow: `0 0 6px ${color}`,
                      wordBreak: 'break-word',
                    }}>
                      {msg.text}
                    </div>
                  </div>
                  <span style={{ ...styles.timestamp, color: dimColor }}>
                    {isOldest ? 'NEXT \u2192 ' : ''}
                    {formatAge(msg.postedAt)}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div style={styles.divider} aria-hidden="true">{'─'.repeat(44)}</div>

        {/* Sender selector */}
        <div style={styles.senderRow} ref={senderRef}>
          <span style={styles.senderLabel}>FROM:</span>
          <button
            onClick={() => setSenderOpen((o) => !o)}
            style={styles.senderButton}
            aria-label="Select message sender"
          >
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}>
              {sender.toUpperCase()}
            </span>
            <span style={{ opacity: 0.6, marginLeft: '4px', flexShrink: 0 }}>
              {senderOpen ? '▲' : '▼'}
            </span>
          </button>

          {senderOpen && (
            <div style={styles.senderDropdown}>
              <input
                ref={senderInputRef}
                type="text"
                value={senderSearch}
                onChange={(e) => setSenderSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSenderOpen(false)
                }}
                placeholder="SEARCH CHARACTERS..."
                autoComplete="off"
                spellCheck={false}
                style={styles.senderSearchInput}
              />
              <button
                onClick={() => selectSender(defaultSender)}
                style={{
                  ...styles.senderOption,
                  color: sender === defaultSender ? CRT_GREEN : CRT_DIM,
                  textShadow: sender === defaultSender ? `0 0 6px ${CRT_GREEN}` : 'none',
                }}
              >
                {defaultSender.toUpperCase()} (DEFAULT)
              </button>
              {searchLoading && (
                <div style={{ ...styles.senderOption, opacity: 0.5, cursor: 'default' }}>
                  SEARCHING...
                </div>
              )}
              {searchResults.map((name) => {
                const label = creatorLabel(name)
                return (
                  <button
                    key={name}
                    onClick={() => selectSender(label)}
                    style={{
                      ...styles.senderOption,
                      color: CRT_AMBER,
                      textShadow: `0 0 6px ${CRT_AMBER}`,
                    }}
                  >
                    {label.toUpperCase()}
                  </button>
                )
              })}
              {!searchLoading && senderSearch.length >= 2 && searchResults.length === 0 && (
                <div style={{ ...styles.senderOption, opacity: 0.4, cursor: 'default' }}>
                  NO CHARACTERS FOUND
                </div>
              )}
            </div>
          )}
        </div>

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
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
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
    flexShrink: 0,
  },
  messageList: {
    minHeight: '72px',
    flex: 1,
    overflowY: 'auto',
    marginBottom: '8px',
  },
  fallingOff: {
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderLeft: '2px solid rgba(255, 68, 68, 0.6)',
    paddingLeft: '6px',
    marginLeft: '-8px',
  },
  empty: {
    opacity: 0.45,
  },
  messageRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'baseline',
    marginBottom: '6px',
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
  senderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
    position: 'relative',
    flexShrink: 0,
  },
  senderLabel: {
    color: CRT_DIM,
    fontSize: '11px',
    flexShrink: 0,
    textShadow: 'none',
  },
  senderButton: {
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: '1px solid rgba(51,255,51,0.3)',
    color: CRT_GREEN,
    fontFamily: FONT,
    fontSize: '11px',
    textShadow: `0 0 4px ${CRT_GREEN}`,
    padding: '1px 8px',
    cursor: 'pointer',
    maxWidth: '280px',
    overflow: 'hidden',
  },
  senderDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: '40px',
    right: '0',
    backgroundColor: '#111',
    border: '1px solid rgba(51,255,51,0.4)',
    zIndex: 10,
    maxHeight: '120px',
    overflowY: 'auto',
  },
  senderSearchInput: {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(51,255,51,0.3)',
    outline: 'none',
    color: CRT_GREEN,
    fontFamily: FONT,
    fontSize: '11px',
    textShadow: `0 0 4px ${CRT_GREEN}`,
    caretColor: CRT_GREEN,
    padding: '4px 8px',
    boxSizing: 'border-box',
  },
  senderOption: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: CRT_DIM,
    fontFamily: FONT,
    fontSize: '11px',
    textShadow: 'none',
    padding: '3px 8px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
    flexShrink: 0,
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
    flexShrink: 0,
  },
  charCount: {
    color: CRT_DIM,
    fontSize: '11px',
    textAlign: 'right' as const,
    textShadow: 'none',
    flexShrink: 0,
  },
}
