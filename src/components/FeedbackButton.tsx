'use client'

import { useRef, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { initConsoleCapture, getCapturedLogs } from '@/lib/consoleCapture'

type SubmitState = 'idle' | 'sending' | 'success' | 'error'

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
  const [open, setOpen] = useState(false)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    initConsoleCapture()
  }, [])

  function toggle() {
    setOpen((prev) => {
      if (!prev) setTimeout(() => textareaRef.current?.focus(), 50)
      return !prev
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) setOpen(false)
    }
    function onClickOutside(e: MouseEvent) {
      if (
        open &&
        panelRef.current &&
        fabRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !fabRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClickOutside)
    }
  }, [open])

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
        setOpen(false)
        setTimeout(() => setSubmitState('idle'), 350)
      }, 2000)
    } catch {
      setSubmitState('error')
      setTimeout(() => setSubmitState('idle'), 3000)
    }
  }

  return (
    <>
      <button
        ref={fabRef}
        className={'fab' + (open ? ' open' : '')}
        onClick={toggle}
        aria-label="Send feedback"
      >
        {/* Message icon */}
        <svg className="fab-icon fab-icon-msg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {/* Close icon */}
        <svg className="fab-icon fab-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div ref={panelRef} className={'feedback-panel' + (open ? ' open' : '')}>
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
    </>
  )
}
