'use client'
import { useEffect, useRef, useState } from 'react'
import { initGame } from '@/game'
import type { GameInstance } from '@/game/types'
import type { CharacterState } from '@/lib/characterSchema'
import type { LayoutRoomId } from '@/lib/layout'
import { ThoughtBubble } from './ThoughtBubble'

export interface GameActions {
  injectThought: (text: string) => void
  ringDoorbell: () => void
  putOnClothes: (item: string) => void
  goToRoom: (room: string, activity: string, durationHours: number, responsePhrases: string[]) => void
  wakeUp: (responsePhrases: string[]) => void
  getState: () => CharacterState | null
  waterPlant: (responsePhrases: string[]) => void
  getPlantHealth: () => number
  getLightStates: () => Record<string, boolean>
  startLightSequence: (turnOn: boolean) => void
  isLightSequenceActive: () => boolean
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
  /** Initial staircase index (0-based position per floor) */
  initialStaircaseIndex?: Record<1 | 2, number>
  /** Initial interior wall x-positions per floor [floor1walls, floor2walls, floor3walls] */
  initialWallPositions?: [number[], number[], number[]]
  /** Called when the layout editor swaps rooms or staircase (for persistence) */
  onLayoutSwap?: (roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>) => void
  /** Called when a wall drag ends (for persistence). [floor1walls, floor2walls, floor3walls] */
  onWallSave?: (wallPositions: [number[], number[], number[]]) => void
  /** Apply an externally-resolved layout (e.g. after conflict resolution) */
  externalRoomOrder?: LayoutRoomId[] | null
  /** Apply an externally-resolved staircase index (paired with externalRoomOrder) */
  externalStaircaseIndex?: Record<1 | 2, number> | null
}

function dist2D(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2
  const dy = y1 - y2
  return Math.sqrt(dx * dx + dy * dy)
}

function getTouchDistance(touches: TouchList): number {
  return dist2D(touches[0].clientX, touches[0].clientY, touches[1].clientX, touches[1].clientY)
}

/** Pixel movement threshold before long press is canceled */
const LONG_PRESS_MOVE_THRESHOLD = 8
/** Duration in ms for long press to trigger */
const LONG_PRESS_DURATION = 500
/** Maximum time between taps to register as double-tap (ms) */
const DOUBLE_TAP_INTERVAL = 400
/** Maximum pixel distance between taps to register as double-tap */
const DOUBLE_TAP_DISTANCE = 30
/** Maximum touch duration to count as a "tap" (ms) */
const TAP_MAX_DURATION = 300

export function GameCanvas({
  characterName = 'resident',
  initialState,
  onGameReady,
  initialRoomOrder,
  initialStaircaseIndex,
  initialWallPositions,
  onLayoutSwap,
  onWallSave,
  externalRoomOrder,
  externalStaircaseIndex,
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

  // Double-tap detection state
  const doubleTapRef = useRef<{
    lastTime: number
    lastX: number
    lastY: number
  }>({ lastTime: 0, lastX: 0, lastY: 0 })

  // Track touch start time for tap detection
  const touchStartTimeRef = useRef(0)

  // Long press state (shared by touch and mouse)
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    startX: number
    startY: number
    /** True once the long press triggered and the layout editor is active */
    triggered: boolean
  }>({ timer: null, startX: 0, startY: 0, triggered: false })

  // Keep callback refs current
  const onLayoutSwapRef = useRef(onLayoutSwap)
  onLayoutSwapRef.current = onLayoutSwap
  const onWallSaveRef = useRef(onWallSave)
  onWallSaveRef.current = onWallSave

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
    return dist2D(screenX, screenY, longPressRef.current.startX, longPressRef.current.startY) > LONG_PRESS_MOVE_THRESHOLD
  }

  /**
   * Checks if a tap at (x, y) constitutes a double-tap.
   * Returns true if this is the second tap within the interval and distance.
   */
  function checkDoubleTap(x: number, y: number): boolean {
    const now = Date.now()
    const dt = now - doubleTapRef.current.lastTime
    const d = dist2D(x, y, doubleTapRef.current.lastX, doubleTapRef.current.lastY)

    doubleTapRef.current = { lastTime: now, lastX: x, lastY: y }

    return dt < DOUBLE_TAP_INTERVAL && d < DOUBLE_TAP_DISTANCE
  }

  useEffect(() => {
    if (!canvasRef.current) return

    const game = initGame(canvasRef.current, characterName, initialState, initialRoomOrder, initialStaircaseIndex, initialWallPositions)
    gameRef.current = game

    // Wire layout swap callback
    game.onLayoutSwap = (roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>) => {
      onLayoutSwapRef.current?.(roomOrder, staircaseIndex)
    }

    // Wire wall save callback
    game.onWallSave = (wallPositions: [number[], number[], number[]]) => {
      onWallSaveRef.current?.(wallPositions)
    }

    if (onGameReady) {
      onGameReady({
        injectThought: (text: string) => { gameRef.current?.injectThought(text) },
        ringDoorbell: () => { gameRef.current?.ringDoorbell() },
        putOnClothes: (item: string) => { gameRef.current?.putOnClothes(item) },
        goToRoom: (room: string, activity: string, durationHours: number, responsePhrases: string[]) => {
          gameRef.current?.goToRoom(room, activity, durationHours, responsePhrases)
        },
        wakeUp: (responsePhrases: string[]) => { gameRef.current?.wakeUp(responsePhrases) },
        getState: () => gameRef.current?.getCharacterState() ?? null,
        waterPlant: (responsePhrases: string[]) => { gameRef.current?.waterPlant(responsePhrases) },
        getPlantHealth: () => gameRef.current?.getPlantHealth() ?? 1,
        getLightStates: () => gameRef.current?.getLightStates() ?? {},
        startLightSequence: (turnOn: boolean) => { gameRef.current?.startLightSequence(turnOn) },
        isLightSequenceActive: () => gameRef.current?.isLightSequenceActive() ?? false,
      })
    }

    const pollId = setInterval(() => {
      const current = game.getCurrentThought()
      setThought((prev) => (prev !== current ? current : prev))

      const pos = game.getCharacterHeadScreenPos()
      setHeadPos(pos)
    }, 100)

    // SBB Chat Control — receive commands from the StreamerBillboard parent frame
    function handleSBBMessage(e: MessageEvent) {
      if (!e.data || e.data.source !== 'sbb' || e.data.type !== 'casa') return
      const { action, text, room, turnOn } = e.data as {
        action: string; text?: string; room?: string; turnOn?: boolean
      }
      switch (action) {
        case 'ringDoorbell':
          gameRef.current?.ringDoorbell()
          break
        case 'injectThought':
          if (text) gameRef.current?.injectThought(text)
          break
        case 'wakeUp':
          gameRef.current?.wakeUp([])
          break
        case 'goToRoom':
          if (room) gameRef.current?.goToRoom(room, 'idle', 1, [])
          break
        case 'waterPlant':
          gameRef.current?.waterPlant([])
          break
        case 'lightsOn':
          gameRef.current?.startLightSequence(true)
          break
        case 'lightsOff':
          gameRef.current?.startLightSequence(false)
          break
        case 'lights':
          gameRef.current?.startLightSequence(turnOn ?? true)
          break
      }
    }
    window.addEventListener('message', handleSBBMessage)

    return () => {
      clearInterval(pollId)
      window.removeEventListener('message', handleSBBMessage)
      gameRef.current = null
      game.dispose()
    }
  }, [characterName, initialState, onGameReady, initialRoomOrder, initialStaircaseIndex, initialWallPositions])

  // Apply externally-resolved layout (e.g. after conflict)
  useEffect(() => {
    if (externalRoomOrder && externalStaircaseIndex && gameRef.current) {
      gameRef.current.applyExternalLayout(externalRoomOrder, externalStaircaseIndex)
    }
  }, [externalRoomOrder, externalStaircaseIndex])

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

        // Track touch start time for tap detection
        touchStartTimeRef.current = Date.now()

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
        cancelLongPressTimer()
      } else {
        // Check for tap (short, stationary touch) → double-tap detection
        const wasTap = touchStateRef.current.type !== 'pan'
          && touchStateRef.current.type !== 'pinch'
          && (Date.now() - touchStartTimeRef.current) < TAP_MAX_DURATION
          && e.touches.length === 0

        cancelLongPressTimer()

        if (wasTap) {
          const x = touchStateRef.current.lastX
          const y = touchStateRef.current.lastY
          if (checkDoubleTap(x, y)) {
            gameRef.current?.onDoubleTap(x, y)
          }
        }
      }

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
      cancelLongPressTimer()
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
        // Snap lastX/Y to current position so the first pan frame doesn't
        // include the accumulated delta from mousedown → threshold crossing.
        state.lastX = e.clientX
        state.lastY = e.clientY
      }

      if (!lp.timer && !lp.triggered) {
        // Normal pan mode
        const dx = e.clientX - state.lastX
        const dy = e.clientY - state.lastY
        game.applyPanDeltaPixels(dx, dy)
        state.lastX = e.clientX
        state.lastY = e.clientY
      }
    }

    function onMouseUp(e: MouseEvent): void {
      const wasDown = mouseStateRef.current.isDown
      mouseStateRef.current.isDown = false

      // End layout edit if active
      if (longPressRef.current.triggered) {
        gameRef.current?.onLayoutPointerUp()
        longPressRef.current.triggered = false
        cancelLongPressTimer()
      } else if (wasDown) {
        // Check if this was a click (no significant movement, no long press)
        const didntMove = !hasMovedBeyondThreshold(e.clientX, e.clientY)
          || longPressRef.current.timer !== null // timer still pending = didn't move beyond threshold
        cancelLongPressTimer()

        if (didntMove) {
          if (checkDoubleTap(e.clientX, e.clientY)) {
            gameRef.current?.onDoubleTap(e.clientX, e.clientY)
          }
        }
      } else {
        cancelLongPressTimer()
      }

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
      cancelLongPressTimer()
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
