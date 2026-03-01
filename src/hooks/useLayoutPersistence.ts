'use client'
import { useCallback, useRef, useState } from 'react'
import type { LayoutRoomId } from '@/lib/layout'

interface LayoutPersistenceState {
  /** Current room ordering (null = use server/default) */
  roomOrder: LayoutRoomId[] | null
  /** Layout version for optimistic concurrency */
  layoutVersion: number
  /**
   * Room order to apply externally after conflict resolution.
   * Changes trigger a useEffect in GameCanvas to rebuild.
   */
  conflictRoomOrder: LayoutRoomId[] | null
  /** Staircase index to apply alongside conflictRoomOrder */
  conflictStaircaseIndex: Record<1 | 2, number> | null
}

/**
 * Manages layout persistence with optimistic concurrency.
 * Returns the current room order, and callbacks to persist swaps and wall drags.
 */
export function useLayoutPersistence(name: string) {
  const [state, setState] = useState<LayoutPersistenceState>({
    roomOrder: null,
    layoutVersion: 0,
    conflictRoomOrder: null,
    conflictStaircaseIndex: null,
  })

  // Keep version and layout refs current for async callbacks
  const versionRef = useRef(0)
  const roomOrderRef = useRef<LayoutRoomId[] | null>(null)
  const staircaseIndexRef = useRef<[number, number] | null>(null)
  const wallPositionsRef = useRef<[number[], number[], number[]] | null>(null)

  const initFromServer = useCallback((
    roomOrder: LayoutRoomId[],
    version: number,
    staircaseIndex?: [number, number],
    wallPositions?: [number[], number[], number[]],
  ) => {
    versionRef.current = version
    roomOrderRef.current = roomOrder
    staircaseIndexRef.current = staircaseIndex ?? null
    wallPositionsRef.current = wallPositions ?? null
    setState({ roomOrder, layoutVersion: version, conflictRoomOrder: null, conflictStaircaseIndex: null })
  }, [])

  const persistSwap = useCallback(async (newOrder: LayoutRoomId[], newStaircaseIndex: Record<1 | 2, number>) => {
    roomOrderRef.current = newOrder
    const stairArr: [number, number] = [newStaircaseIndex[1], newStaircaseIndex[2]]
    staircaseIndexRef.current = stairArr
    // Swap resets wall positions (proportional for new order)
    wallPositionsRef.current = null
    try {
      const res = await fetch(`/api/layout/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomOrder: newOrder,
          staircaseIndex: stairArr,
          expectedVersion: versionRef.current,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        versionRef.current = data.version
        if (data.staircaseIndex) staircaseIndexRef.current = data.staircaseIndex
        if (data.wallPositions) wallPositionsRef.current = data.wallPositions
        setState((prev) => ({
          ...prev,
          roomOrder: data.roomOrder,
          layoutVersion: data.version,
          conflictRoomOrder: null,
          conflictStaircaseIndex: null,
        }))
        return
      }

      if (res.status === 409) {
        // Conflict — accept server's version and rebuild
        const data = await res.json()
        const current = data.current
        if (current) {
          versionRef.current = current.version
          roomOrderRef.current = current.roomOrder
          if (current.staircaseIndex) staircaseIndexRef.current = current.staircaseIndex
          if (current.wallPositions) wallPositionsRef.current = current.wallPositions
          const conflictStairIdx: Record<1 | 2, number> | null = current.staircaseIndex
            ? { 1: current.staircaseIndex[0], 2: current.staircaseIndex[1] }
            : null
          setState({
            roomOrder: current.roomOrder,
            layoutVersion: current.version,
            conflictRoomOrder: current.roomOrder,
            conflictStaircaseIndex: conflictStairIdx,
          })
        }
      }
    } catch {
      // Network error — silently fail (swap still happened locally)
    }
  }, [name])

  const persistWallPositions = useCallback(async (wallPositions: [number[], number[], number[]]) => {
    wallPositionsRef.current = wallPositions
    const roomOrder = roomOrderRef.current
    if (!roomOrder) return // no layout yet — skip
    try {
      const body: Record<string, unknown> = {
        roomOrder,
        expectedVersion: versionRef.current,
        wallPositions,
      }
      if (staircaseIndexRef.current) body.staircaseIndex = staircaseIndexRef.current

      const res = await fetch(`/api/layout/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        versionRef.current = data.version
        if (data.wallPositions) wallPositionsRef.current = data.wallPositions
        setState((prev) => ({ ...prev, layoutVersion: data.version }))
      }
      // On conflict, silently accept — wall positions are cosmetic
    } catch {
      // Network error — silently fail
    }
  }, [name])

  return {
    roomOrder: state.roomOrder,
    layoutVersion: state.layoutVersion,
    conflictRoomOrder: state.conflictRoomOrder,
    conflictStaircaseIndex: state.conflictStaircaseIndex,
    initFromServer,
    persistSwap,
    persistWallPositions,
  }
}
