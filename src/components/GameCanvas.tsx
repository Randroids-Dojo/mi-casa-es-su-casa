'use client'
import { useEffect, useRef, useState } from 'react'
import { initGame } from '@/game'
import type { GameInstance } from '@/game/types'
import type { CharacterState } from '@/lib/characterSchema'
import type { LayoutRoomId } from '@/lib/layout'
import { ThoughtBubble } from './ThoughtBubble'

export interface GameActions {
  injectThought: (text: string) => void
  putOnClothes: (item: string) => void
  goToRoom: (room: string, activity: string, durationHours: number, responsePhrases: string[]) => void
  getState: () => CharacterState | null
}

interface GameCanvasProps {
  /** Character name used to seed appearance and behaviour (default: 'resident') */
  characterName?: string
  /** Pre-loaded character state to restore on init */
  initialState?: CharacterState
  /** Called once the game is initialised with the available game actions */
  onGameReady?: (actions: GameActions) => void
  /** Initial room ordering for custom layout */
  initialRoomOrder?: LayoutRoomId[]
  /** Called when the layout editor swaps two rooms (for persistence) */
  onLayoutSwap?: (roomOrder: LayoutRoomId[]) => void
  /** Apply an externally-resolved layout (e.g. after conflict resolution) */
  externalRoomOrder?: LayoutRoomId[] | null
}

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

/** Pixel movement threshold before long press is canceled */
const LONG_PRESS_MOVE_THRESHOLD = 8
/** Duration in ms for long press to trigger */
const LONG_PRESS_DURATION = 500

export function GameCanvas({
  characterName = 'resident',
  initialState,
  onGameReady,
  initialRoomOrder,
  onLayoutSwap,
  externalRoomOrder,
}: GameCanvasProps) {
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

  // Long press state (shared by touch and mouse)
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    startX: number
    startY: number
    /** True once the long press triggered and the layout editor is active */
    triggered: boolean
  }>({ timer: null, startX: 0, startY: 0, triggered: false })

  // Keep onLayoutSwap callback ref current
  const onLayoutSwapRef = useRef(onLayoutSwap)
  onLayoutSwapRef.current = onLayoutSwap

  // ----- Long press helpers (stable functions, no React state dependency) -----

  function startLongPressTimer(screenX: number, screenY: number): void {
    cancelLongPressTimer()
    longPressRef.current = {
      timer: setTimeout(() => {
        longPressRef.current.triggered = true
        gameRef.current?.onLayoutPointerDown(screenX, screenY)
      }, LONG_PRESS_DURATION),
      startX: screenX,
      startY: screenY,
      triggered: false,
    }
  }

  function cancelLongPressTimer(): void {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer)
      longPressRef.current.timer = null
    }
  }

  function hasMovedBeyondThreshold(screenX: number, screenY: number): boolean {
    const dx = screenX - longPressRef.current.startX
    const dy = screenY - longPressRef.current.startY
    return Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD
  }

  useEffect(() => {
    if (!canvasRef.current) return

    const game = initGame(canvasRef.current, characterName, initialState, initialRoomOrder)
    gameRef.current = game

    // Wire layout swap callback
    game.onLayoutSwap = (roomOrder: LayoutRoomId[]) => {
      onLayoutSwapRef.current?.(roomOrder)
    }

    if (onGameReady) {
      onGameReady({
        injectThought: (text: string) => { gameRef.current?.injectThought(text) },
        putOnClothes: (item: string) => { gameRef.current?.putOnClothes(item) },
        goToRoom: (room: string, activity: string, durationHours: number, responsePhrases: string[]) => {
          gameRef.current?.goToRoom(room, activity, durationHours, responsePhrases)
        },
        getState: () => gameRef.current?.getCharacterState() ?? null,
      })
    }

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
  }, [characterName, initialState, onGameReady, initialRoomOrder])

  // Apply externally-resolved layout (e.g. after conflict)
  useEffect(() => {
    if (externalRoomOrder && gameRef.current) {
      gameRef.current.applyExternalLayout(externalRoomOrder)
    }
  }, [externalRoomOrder])

  // Native touch event listeners (non-passive so we can preventDefault)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onTouchStart(e: TouchEvent): void {
      e.preventDefault()
      gameRef.current?.unlockAudio()

      if (e.touches.length === 1) {
        const x = e.touches[0].clientX
        const y = e.touches[0].clientY

        // Start long press timer — don't enter pan mode yet
        startLongPressTimer(x, y)

        touchStateRef.current = {
          type: 'none', // wait to determine gesture type
          lastX: x,
          lastY: y,
          lastDist: 0,
        }
      } else if (e.touches.length === 2) {
        // Two fingers → pinch zoom (cancel any long press)
        cancelLongPressTimer()
        if (longPressRef.current.triggered) {
          gameRef.current?.onLayoutPointerUp()
          longPressRef.current.triggered = false
        }
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
      const lp = longPressRef.current

      if (e.touches.length === 1) {
        const x = e.touches[0].clientX
        const y = e.touches[0].clientY

        if (lp.triggered) {
          // Layout edit mode — route to layout editor
          game.onLayoutPointerMove(x, y)
          return
        }

        // Check if moved beyond threshold before long press fired
        if (lp.timer && hasMovedBeyondThreshold(x, y)) {
          cancelLongPressTimer()
          // Enter pan mode
          touchStateRef.current.type = 'pan'
          touchStateRef.current.lastX = x
          touchStateRef.current.lastY = y
        }

        if (state.type === 'pan') {
          const dx = x - state.lastX
          const dy = y - state.lastY
          game.applyPanDeltaPixels(dx, dy)
          state.lastX = x
          state.lastY = y
        }
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

      // End layout edit if active
      if (longPressRef.current.triggered) {
        gameRef.current?.onLayoutPointerUp()
        longPressRef.current.triggered = false
      }
      cancelLongPressTimer()

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
      gameRef.current?.unlockAudio()
      mouseStateRef.current = { isDown: true, lastX: e.clientX, lastY: e.clientY }

      // Start long press timer
      startLongPressTimer(e.clientX, e.clientY)
    }

    function onMouseMove(e: MouseEvent): void {
      const state = mouseStateRef.current
      if (!state.isDown) return
      const game = gameRef.current
      if (!game) return
      const lp = longPressRef.current

      if (lp.triggered) {
        // Layout edit mode — route to layout editor
        game.onLayoutPointerMove(e.clientX, e.clientY)
        return
      }

      // Check if moved beyond threshold before long press fired
      if (lp.timer && hasMovedBeyondThreshold(e.clientX, e.clientY)) {
        cancelLongPressTimer()
        container!.style.cursor = 'grabbing'
      }

      if (!lp.timer && !lp.triggered) {
        // Normal pan mode
        const dx = e.clientX - state.lastX
        const dy = e.clientY - state.lastY
        game.applyPanDeltaPixels(dx, dy)
      }

      state.lastX = e.clientX
      state.lastY = e.clientY
    }

    function onMouseUp(): void {
      mouseStateRef.current.isDown = false

      // End layout edit if active
      if (longPressRef.current.triggered) {
        gameRef.current?.onLayoutPointerUp()
        longPressRef.current.triggered = false
      }
      cancelLongPressTimer()

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
        overflow: 'hidden',
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
