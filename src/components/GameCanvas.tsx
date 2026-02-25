'use client'
import { useEffect, useRef, useState } from 'react'
import { initGame } from '@/game'
import type { GameInstance } from '@/game/types'
import { ThoughtBubble } from './ThoughtBubble'

interface GameCanvasProps {
  /** Character name used to seed appearance and behaviour (default: 'resident') */
  characterName?: string
}

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

export function GameCanvas({ characterName = 'resident' }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameInstance | null>(null)
  const [thought, setThought] = useState<string | null>(null)
  const [headPos, setHeadPos] = useState<{ x: number; y: number } | null>(null)

  // Touch gesture state (not React state — no re-renders needed)
  const touchStateRef = useRef<{
    type: 'none' | 'pan' | 'pinch'
    lastX: number
    lastY: number
    lastDist: number
  }>({ type: 'none', lastX: 0, lastY: 0, lastDist: 0 })

  // Mouse drag state
  const mouseStateRef = useRef<{ isDown: boolean; lastX: number; lastY: number }>(
    { isDown: false, lastX: 0, lastY: 0 },
  )

  useEffect(() => {
    if (!canvasRef.current) return

    const game = initGame(canvasRef.current, characterName)
    gameRef.current = game

    const pollId = setInterval(() => {
      const current = game.getCurrentThought()
      setThought((prev) => (prev !== current ? current : prev))

      const pos = game.getCharacterHeadScreenPos()
      setHeadPos(pos)
    }, 100)

    return () => {
      clearInterval(pollId)
      gameRef.current = null
      game.dispose()
    }
  }, [characterName])

  // Native touch event listeners (non-passive so we can preventDefault)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onTouchStart(e: TouchEvent): void {
      e.preventDefault()
      if (e.touches.length === 1) {
        touchStateRef.current = {
          type: 'pan',
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
          lastDist: 0,
        }
      } else if (e.touches.length === 2) {
        touchStateRef.current = {
          type: 'pinch',
          lastX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          lastY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          lastDist: getTouchDistance(e.touches),
        }
      }
    }

    function onTouchMove(e: TouchEvent): void {
      e.preventDefault()
      const game = gameRef.current
      if (!game) return
      const state = touchStateRef.current

      if (state.type === 'pan' && e.touches.length === 1) {
        const dx = e.touches[0].clientX - state.lastX
        const dy = e.touches[0].clientY - state.lastY
        game.applyPanDeltaPixels(dx, dy)
        state.lastX = e.touches[0].clientX
        state.lastY = e.touches[0].clientY
      } else if (state.type === 'pinch' && e.touches.length === 2) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        const dist = getTouchDistance(e.touches)

        // Zoom: scale factor relative to previous frame (guard against zero initial distance)
        if (state.lastDist > 0) {
          game.applyZoomScale(dist / state.lastDist)
        }

        // Also pan by midpoint movement so the pinch center stays fixed
        const dx = midX - state.lastX
        const dy = midY - state.lastY
        game.applyPanDeltaPixels(dx, dy)

        state.lastDist = dist
        state.lastX = midX
        state.lastY = midY
      }
    }

    function onTouchEnd(e: TouchEvent): void {
      e.preventDefault()
      if (e.touches.length === 1) {
        // Transition from pinch back to single-finger pan
        touchStateRef.current = {
          type: 'pan',
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
          lastDist: 0,
        }
      } else if (e.touches.length === 0) {
        touchStateRef.current.type = 'none'
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd, { passive: false })

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // Mouse drag and wheel — desktop pan/zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onMouseDown(e: MouseEvent): void {
      mouseStateRef.current = { isDown: true, lastX: e.clientX, lastY: e.clientY }
      container!.style.cursor = 'grabbing'
    }

    function onMouseMove(e: MouseEvent): void {
      const state = mouseStateRef.current
      if (!state.isDown) return
      const game = gameRef.current
      if (!game) return
      const dx = e.clientX - state.lastX
      const dy = e.clientY - state.lastY
      game.applyPanDeltaPixels(dx, dy)
      state.lastX = e.clientX
      state.lastY = e.clientY
    }

    function onMouseUp(): void {
      mouseStateRef.current.isDown = false
      container!.style.cursor = 'grab'
    }

    function onWheel(e: WheelEvent): void {
      e.preventDefault()
      const game = gameRef.current
      if (!game) return
      // Scroll up (deltaY < 0) → zoom in; scroll down → zoom out
      const factor = Math.pow(0.999, e.deltaY)
      game.applyZoomScale(factor)
    }

    container.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    container.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        cursor: 'grab',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <ThoughtBubble
        text={thought}
        visible={thought !== null}
        anchorX={headPos?.x}
        anchorY={headPos?.y}
      />
    </div>
  )
}
