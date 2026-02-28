'use client'

import { useRef, useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { initConsoleCapture, getCapturedLogs } from '@/lib/consoleCapture'

type SubmitState = 'idle' | 'sending' | 'success' | 'error'
type View = 'closed' | 'menu' | 'feedback'

function captureScreenshot(): string | null {
  try {
    const canvas = document.querySelector('canvas')
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null

    const maxWidth = 320
    const scale = Math.min(1, maxWidth / canvas.width)
    const w = Math.round(canvas.width * scale)
    const h = Math.round(canvas.height * scale)

    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(canvas, 0, 0, w, h)
    return tmp.toDataURL('image/jpeg', 0.5)
  } catch {
    return null
  }
}

export default function FeedbackButton() {
  const [view, setView] = useState<View>('closed')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  const isCharacterPage = pathname !== '/' && pathname.length > 1

  useEffect(() => {
    initConsoleCapture()
  }, [])

  function toggle() {
    if (view === 'closed') {
      setView('menu')
    } else {
      setView('closed')
    }
  }

  function openFeedback() {
    setView('feedback')
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function handleQuit() {
    setView('closed')
    setShowQuitConfirm(true)
  }

  function confirmQuit() {
    setShowQuitConfirm(false)
    router.push('/')
  }

  function cancelQuit() {
    setShowQuitConfirm(false)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showQuitConfirm) {
          setShowQuitConfirm(false)
        } else if (view !== 'closed') {
          setView('closed')
        }
      }
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        view !== 'closed' &&
        panelRef.current &&
        menuRef.current &&
        fabRef.current &&
        !panelRef.current.contains(target) &&
        !menuRef.current.contains(target) &&
        !fabRef.current.contains(target)
      ) {
        setView('closed')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClickOutside)
    }
  }, [view, showQuitConfirm])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return

    const title = 'Player Feedback' + (name.trim() ? ' from ' + name.trim() : '')
    const userMessage = message.trim() + (name.trim() ? '\n\n— ' + name.trim() : '')

    const screenshot = captureScreenshot()
    const consoleLogs = getCapturedLogs()

    setSubmitState('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: userMessage,
          context: {
            urlPath: pathname,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toISOString(),
            screenshot,
            consoleLogs: consoleLogs.length > 0 ? consoleLogs : null,
          },
        }),
      })
      if (!res.ok) throw new Error('status ' + res.status)
      setSubmitState('success')
      setName('')
      setMessage('')
      setTimeout(() => {
        setView('closed')
        setTimeout(() => setSubmitState('idle'), 350)
      }, 2000)
    } catch {
      setSubmitState('error')
      setTimeout(() => setSubmitState('idle'), 3000)
    }
  }

  const isOpen = view !== 'closed'

  return (
    <>
      {/* FAB — power icon */}
      <button
        ref={fabRef}
        className={'fab' + (isOpen ? ' open' : '')}
        onClick={toggle}
        aria-label="Open menu"
      >
        {/* Power icon (IEC 5009) */}
        <svg className="fab-icon fab-icon-power" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 3v6" />
          <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
        </svg>
        {/* Close icon */}
        <svg className="fab-icon fab-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Menu */}
      <div ref={menuRef} className={'fab-menu' + (view === 'menu' ? ' open' : '')}>
        <button className="fab-menu-item" onClick={openFeedback}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Feedback
        </button>
        {isCharacterPage && (
          <button className="fab-menu-item" onClick={handleQuit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 3v6" />
              <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
            </svg>
            Quit
          </button>
        )}
      </div>

      {/* Feedback panel */}
      <div ref={panelRef} className={'feedback-panel' + (view === 'feedback' ? ' open' : '')}>
        <div className="feedback-header">
          <span className="feedback-label">{'// say hi or send feedback'}</span>
        </div>

        {submitState !== 'success' ? (
          <form className="feedback-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="feedback-input"
              placeholder="Your name (optional)"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              ref={textareaRef}
              className="feedback-textarea"
              placeholder="What's on your mind?"
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button
              type="submit"
              className={'feedback-submit' + (submitState === 'sending' ? ' sending' : '') + (submitState === 'error' ? ' error' : '')}
              disabled={submitState === 'sending'}
            >
              <span className="feedback-submit-label">
                {submitState === 'error' ? 'Failed — try again' : 'Send Feedback'}
              </span>
              <span className="feedback-submit-sending">Sending…</span>
              <svg className="feedback-submit-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <span className="feedback-hint">Your message will be posted as a GitHub issue</span>
          </form>
        ) : (
          <div className="feedback-success">
            <div className="feedback-success-icon">✓</div>
            <p className="feedback-success-text">Thanks for the feedback!</p>
            <p className="feedback-success-sub">Your message has been submitted.</p>
          </div>
        )}
      </div>

      {/* Quit confirmation overlay */}
      {showQuitConfirm && (
        <div
          onClick={cancelQuit}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0a0a0a',
              border: '2px solid #33ff33',
              boxShadow: '0 0 20px rgba(51,255,51,0.2)',
              padding: '24px 32px',
              fontFamily: '"Share Tech Mono", "Courier New", Courier, monospace',
              color: '#33ff33',
              textShadow: '0 0 8px rgba(51,255,51,0.6)',
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            <p style={{ margin: '0 0 20px', fontSize: 16, letterSpacing: 1 }}>
              POWER OFF?
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, opacity: 0.6 }}>
              You will return to the main menu.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={confirmQuit}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: '#0a0a0a',
                  background: '#33ff33',
                  border: 'none',
                  padding: '6px 20px',
                  cursor: 'pointer',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Yes
              </button>
              <button
                onClick={cancelQuit}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: '#33ff33',
                  background: 'transparent',
                  border: '1px solid #33ff33',
                  padding: '6px 20px',
                  cursor: 'pointer',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
