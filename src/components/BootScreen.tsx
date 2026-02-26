'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { validateNameFormat, normalizeName } from '@/lib/nameValidation'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'BOOTING'
  | 'NAME_PROMPT'
  | 'VALIDATING'
  | 'ERROR'
  | 'SUCCESS'

// ─── Suffix options ────────────────────────────────────────────────────────────

const SUFFIXES: { label: string; display: string; slug: string }[] = [
  { label: '', display: '──', slug: '' },
  { label: ' The Third', display: 'The Third', slug: '-the-third' },
  { label: ' Jr.', display: 'Jr.', slug: '-jr' },
  { label: ' Sr.', display: 'Sr.', slug: '-sr' },
]

// ─── Boot lines ───────────────────────────────────────────────────────────────

const BOOT_LINES: string[] = [
  'MI CASA ES SU CASA v0.2',
  '',
  '',
  'LOADING HOUSE SUBSYSTEM.......... OK',
  'LOADING CHARACTER ENGINE......... OK',
  'LOADING THOUGHT PROCESSOR........ OK',
  '',
  'READY.',
  '',
]

// Timing constants (ms)
const CHAR_DELAY = 25
const LINE_PAUSE = 80
const READY_PAUSE = 400

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BootScreen() {
  const router = useRouter()

  // Completed boot lines rendered verbatim
  const [completedLines, setCompletedLines] = useState<string[]>([])
  // Currently typing line (partial)
  const [currentLine, setCurrentLine] = useState<string>('')

  const [phase, setPhase] = useState<Phase>('BOOTING')

  // Name entry
  const [inputValue, setInputValue] = useState<string>('')
  const [suffixValue, setSuffixValue] = useState<string>('')
  const [submittedName, setSubmittedName] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cancelledRef = useRef(false)

  // ── Boot animation ──────────────────────────────────────────────────────────

  const runBootSequence = useCallback(async () => {
    cancelledRef.current = false

    for (const line of BOOT_LINES) {
      if (cancelledRef.current) return

      // Empty lines appear instantly
      if (line === '') {
        setCompletedLines((prev) => [...prev, ''])
        await sleep(LINE_PAUSE)
        continue
      }

      // Type each character
      for (let i = 0; i <= line.length; i++) {
        if (cancelledRef.current) return
        setCurrentLine(line.slice(0, i))
        await sleep(CHAR_DELAY)
      }

      // Line complete — move to completed lines
      setCompletedLines((prev) => [...prev, line])
      setCurrentLine('')
      await sleep(LINE_PAUSE)
    }

    // Pause after READY. then show name prompt
    await sleep(READY_PAUSE)
    if (!cancelledRef.current) {
      setPhase('NAME_PROMPT')
    }
  }, [])

  useEffect(() => {
    void runBootSequence()
    return () => {
      cancelledRef.current = true
    }
  }, [runBootSequence])

  // ── Focus input when NAME_PROMPT appears ───────────────────────────────────

  useEffect(() => {
    if (phase === 'NAME_PROMPT' || phase === 'ERROR') {
      // Small delay to let the DOM update
      const id = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(id)
    }
  }, [phase])

  // ── Scroll to bottom as content grows ─────────────────────────────────────

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [completedLines, currentLine, phase, errorMessage])

  // ── Name submission ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const raw = inputValue
    const suffix = SUFFIXES.find((s) => s.label === suffixValue) ?? SUFFIXES[0]
    const displayName = raw + suffixValue

    // 1. Client-side validation (base name only)
    const clientResult = validateNameFormat(raw)
    if (!clientResult.valid) {
      setSubmittedName(displayName)
      setErrorMessage(clientResult.error ?? 'INVALID NAME')
      setInputValue('')
      setPhase('ERROR')
      return
    }

    setSubmittedName(displayName)
    setPhase('VALIDATING')

    // 2. Server-side validation
    try {
      const res = await fetch('/api/validate-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: raw }),
      })

      const data: { valid: boolean; normalizedName?: string; error?: string } =
        await res.json()

      if (!data.valid) {
        setErrorMessage(data.error ?? 'NAME NOT PERMITTED')
        setInputValue('')
        setPhase('ERROR')
        return
      }

      const normalizedBase = data.normalizedName ?? normalizeName(raw)
      const urlSlug = normalizedBase + suffix.slug
      setPhase('SUCCESS')
      router.push(`/${urlSlug}`)
    } catch {
      setErrorMessage('CONNECTION ERROR — TRY AGAIN')
      setInputValue('')
      setPhase('ERROR')
    }
  }, [inputValue, suffixValue, router])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        void handleSubmit()
      }
    },
    [handleSubmit]
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      {/* Scanline overlay */}
      <div style={styles.scanlines} aria-hidden="true" />

      {/* Terminal content area */}
      <div ref={containerRef} style={styles.terminal}>
        {/* Completed boot lines */}
        {completedLines.map((line, i) => (
          <div key={i} style={styles.line}>
            {line}
          </div>
        ))}

        {/* Currently typing line (BOOTING phase only) */}
        {phase === 'BOOTING' && (
          <div style={styles.line}>
            {currentLine}
            <span style={styles.cursor}>_</span>
          </div>
        )}

        {/* Name prompt — NAME_PROMPT phase */}
        {phase === 'NAME_PROMPT' && (
          <div style={styles.inputBlock}>
            <div style={styles.line}>
              {'ENTER CHARACTER NAME: '}
              <span style={styles.inputWrapper}>
                <label htmlFor="name-input" className="sr-only">
                  Enter character name
                </label>
                <input
                  ref={inputRef}
                  id="name-input"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  maxLength={20}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={styles.input}
                />
                {/* Blinking cursor shown when input is empty */}
                {inputValue === '' && (
                  <span style={styles.blinkCursor} aria-hidden="true">
                    _
                  </span>
                )}
              </span>
            </div>
            <div style={styles.line}>
              {'OPTIONAL SUFFIX: '}
              <label htmlFor="suffix-select" className="sr-only">
                Name suffix
              </label>
              <select
                id="suffix-select"
                value={suffixValue}
                onChange={(e) => setSuffixValue(e.target.value)}
                style={styles.suffixSelect}
              >
                {SUFFIXES.map((s) => (
                  <option key={s.slug} value={s.label} style={styles.suffixOption}>
                    {s.display}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.fineprint}>(For Marvin and Miggy)</div>

            <div style={styles.visitBtnRow}>
              <button
                onClick={() => void handleSubmit()}
                disabled={inputValue === ''}
                style={inputValue === '' ? { ...styles.visitBtn, ...styles.visitBtnDisabled } : styles.visitBtn}
              >
                [ VISIT ]
              </button>
            </div>
          </div>
        )}

        {/* Validating phase */}
        {phase === 'VALIDATING' && (
          <>
            <div style={styles.line}>
              {`ENTER CHARACTER NAME: ${submittedName}`}
            </div>
            <div style={styles.line}>CHECKING...</div>
          </>
        )}

        {/* Error phase */}
        {phase === 'ERROR' && (
          <>
            <div style={styles.line}>
              {`ENTER CHARACTER NAME: ${submittedName}`}
            </div>
            <div
              role="alert"
              aria-live="assertive"
              style={{ ...styles.line, ...styles.errorLine }}
            >
              {`ERROR: ${errorMessage}`}
            </div>
            <div style={styles.line}>{''}</div>
            <div style={styles.inputBlock}>
              <div style={styles.line}>
                {'ENTER CHARACTER NAME: '}
                <span style={styles.inputWrapper}>
                  <label htmlFor="name-input" className="sr-only">
                    Enter character name
                  </label>
                  <input
                    ref={inputRef}
                    id="name-input"
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                    onKeyDown={handleKeyDown}
                    maxLength={20}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    style={styles.input}
                  />
                  {inputValue === '' && (
                    <span style={styles.blinkCursor} aria-hidden="true">
                      _
                    </span>
                  )}
                </span>
              </div>
              <div style={styles.line}>
                {'OPTIONAL SUFFIX: '}
                <label htmlFor="suffix-select" className="sr-only">
                  Name suffix
                </label>
                <select
                  id="suffix-select"
                  value={suffixValue}
                  onChange={(e) => setSuffixValue(e.target.value)}
                  style={styles.suffixSelect}
                >
                  {SUFFIXES.map((s) => (
                    <option key={s.slug} value={s.label} style={styles.suffixOption}>
                      {s.display}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.fineprint}>(For Marvin and Miggy)</div>

              <div style={styles.visitBtnRow}>
                <button
                  onClick={() => void handleSubmit()}
                  disabled={inputValue === ''}
                  style={inputValue === '' ? { ...styles.visitBtn, ...styles.visitBtnDisabled } : styles.visitBtn}
                >
                  [ VISIT ]
                </button>
              </div>
            </div>
          </>
        )}

        {/* Success — brief message before navigation */}
        {phase === 'SUCCESS' && (
          <>
            <div style={styles.line}>
              {`ENTER CHARACTER NAME: ${submittedName}`}
            </div>
            <div style={styles.line}>LOADING...</div>
          </>
        )}
      </div>

      {/* Keyframes are defined in globals.css (crt-blink) */}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CRT_GREEN = '#33ff33'
const CRT_ERROR = '#ff4444'
const FONT_STACK =
  '"Share Tech Mono", "Courier New", Courier, monospace'

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    animation: 'crt-flicker 8s ease-in-out infinite',
  },

  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
    pointerEvents: 'none',
    zIndex: 10,
  },

  terminal: {
    position: 'relative',
    width: '100%',
    maxWidth: '860px',
    height: '100%',
    maxHeight: '100vh',
    overflowY: 'auto',
    padding: 'clamp(24px, 5vh, 48px) clamp(16px, 4vw, 40px)',
    boxSizing: 'border-box',
    fontFamily: FONT_STACK,
    fontSize: '18px',
    lineHeight: '1.6',
    color: CRT_GREEN,
    // Subtle phosphor glow
    textShadow: `0 0 8px ${CRT_GREEN}`,
    scrollbarWidth: 'none',
    zIndex: 1,
  },

  line: {
    display: 'block',
    minHeight: '1.6em',
    whiteSpace: 'pre',
  },

  cursor: {
    display: 'inline-block',
    // static cursor while typing — no blink needed
    opacity: 1,
  },

  blinkCursor: {
    display: 'inline-block',
    animation: 'crt-blink 500ms step-start infinite',
  },

  inputWrapper: {
    position: 'relative',
    display: 'inline-block',
  },

  input: {
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid rgba(51, 255, 51, 0.45)`,
    outline: 'none',
    color: CRT_GREEN,
    fontFamily: FONT_STACK,
    fontSize: '18px',
    lineHeight: '1.6',
    textShadow: `0 0 8px ${CRT_GREEN}`,
    caretColor: 'transparent', // hide browser caret; we use our own blinking _
    width: 'min(220px, calc(100vw - 300px))',
    padding: 0,
    margin: 0,
    verticalAlign: 'baseline',
  },

  suffixSelect: {
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid rgba(51, 255, 51, 0.45)`,
    outline: 'none',
    color: CRT_GREEN,
    fontFamily: FONT_STACK,
    fontSize: '18px',
    lineHeight: '1.6',
    textShadow: `0 0 8px ${CRT_GREEN}`,
    padding: 0,
    verticalAlign: 'baseline',
    cursor: 'pointer',
    maxWidth: '140px',
  },

  hint: {
    display: 'block',
    fontFamily: FONT_STACK,
    fontSize: '13px',
    lineHeight: '1.6',
    color: `rgba(51, 255, 51, 0.45)`,
    marginTop: '2px',
    marginBottom: '2px',
  },

  suffixOption: {
    background: '#000',
    color: CRT_GREEN,
  },

  inputBlock: {
    display: 'block',
  },

  visitBtnRow: {
    display: 'block',
    textAlign: 'center',
    marginTop: '16px',
  },

  visitBtn: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: CRT_GREEN,
    fontFamily: FONT_STACK,
    fontSize: '28px',
    lineHeight: '1.4',
    textShadow: `0 0 12px ${CRT_GREEN}`,
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    letterSpacing: '0.1em',
  },

  visitBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },

  errorLine: {
    color: CRT_ERROR,
    textShadow: `0 0 8px ${CRT_ERROR}`,
  },

  fineprint: {
    display: 'block',
    fontFamily: FONT_STACK,
    fontSize: '12px',
    lineHeight: '1.6',
    color: `rgba(51, 255, 51, 0.5)`,
    marginTop: '2px',
    marginBottom: '4px',
  },
}
