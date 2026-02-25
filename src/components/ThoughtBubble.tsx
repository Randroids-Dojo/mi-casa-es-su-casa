'use client'

// ---------------------------------------------------------------------------
// ThoughtBubble — HTML overlay thought bubble shown above the character
// ---------------------------------------------------------------------------
//
// Rendered as an absolutely-positioned element overlaying the Three.js canvas.
// For MVP the bubble is anchored to a fixed position in the top-right quadrant
// of the game container — no 3D world-space tracking needed.
//
// The bubble fades in/out via a CSS opacity transition whenever `visible`
// changes.

import { useRef, useEffect } from 'react'

interface ThoughtBubbleProps {
  text: string | null
  visible: boolean
}

export function ThoughtBubble({ text, visible }: ThoughtBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Drive the opacity transition reactively whenever visibility changes
  useEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    el.style.opacity = visible && text !== null ? '1' : '0'
  }, [visible, text])

  return (
    <>
      <style>{`
        .thought-bubble {
          position: absolute;
          bottom: 65%;
          left: 50%;
          transform: translateX(-50%);
          max-width: 200px;
          padding: 10px 14px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
          color: #222222;
          font-family: 'Courier New', Courier, monospace;
          font-size: 13px;
          line-height: 1.4;
          pointer-events: none;
          user-select: none;
          opacity: 0;
          transition: opacity 0.5s ease;
          z-index: 10;
          word-break: break-word;
        }

        /* Bubble tail — small triangle pointing down-left toward character area */
        .thought-bubble::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 20px;
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 10px solid #ffffff;
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.08));
        }
      `}</style>

      <div ref={bubbleRef} className="thought-bubble" aria-live="polite" aria-atomic="true">
        {text}
      </div>
    </>
  )
}
