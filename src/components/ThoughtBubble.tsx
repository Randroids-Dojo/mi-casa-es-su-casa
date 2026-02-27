'use client'

// ---------------------------------------------------------------------------
// ThoughtBubble — HTML overlay thought bubble shown above the character
// ---------------------------------------------------------------------------
//
// Rendered as an absolutely-positioned element overlaying the Three.js canvas.
// When anchorX/anchorY are provided (pixel coordinates of the character's head
// within the canvas), the bubble is positioned above that point with the tail
// pointing downward toward the head. Falls back to a centered position if no
// anchor is available.

import { useRef, useEffect } from 'react'

interface ThoughtBubbleProps {
  text: string | null
  visible: boolean
  /** Pixel X coordinate of the character's head within the canvas */
  anchorX?: number
  /** Pixel Y coordinate of the character's head within the canvas */
  anchorY?: number
}

export function ThoughtBubble({ text, visible, anchorX, anchorY }: ThoughtBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Drive the opacity transition reactively whenever visibility changes
  useEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    el.style.opacity = visible && text !== null ? '1' : '0'
  }, [visible, text])

  // Build inline position style: anchor above the character's head when possible.
  // We position at left:0/top:0 and move entirely via transform so the bubble's
  // layout width is always the full container width (up to max-width).  Using
  // left/top percentages would let CSS shrink-to-fit reduce the available width
  // when the anchor is near an edge, making the bubble skinny.
  const hasAnchor = anchorX !== undefined && anchorY !== undefined
  const positionStyle: React.CSSProperties = hasAnchor
    ? {
        left: 0,
        top: 0,
        // anchorX/Y are pixels; -50% centers horizontally on the anchor,
        // -100% shifts the bubble above the anchor, -14px clears the tail.
        transform: `translate(calc(${anchorX}px - 50%), calc(${anchorY}px - 100% - 14px))`,
      }
    : {
        // Fallback: horizontally centered, roughly above mid-house
        left: '50%',
        bottom: '65%',
        transform: 'translateX(-50%)',
      }

  return (
    <>
      <style>{`
        .thought-bubble {
          position: absolute;
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

        /* Bubble tail — small triangle pointing down toward character head */
        .thought-bubble::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 10px solid #ffffff;
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.08));
        }
      `}</style>

      <div
        ref={bubbleRef}
        className="thought-bubble"
        style={positionStyle}
        aria-live="polite"
        aria-atomic="true"
      >
        {text}
      </div>
    </>
  )
}
