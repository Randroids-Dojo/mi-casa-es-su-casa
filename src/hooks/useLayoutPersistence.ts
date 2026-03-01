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
}

/**
 * Manages layout persistence with optimistic concurrency.
 * Returns the current room order, and callbacks to persist swaps and staircase moves.
 */
export function useLayoutPersistence(name: string) {
  const [state, setState] = useState<LayoutPersistenceState>({
    roomOrder: null,
    layoutVersion: 0,
    conflictRoomOrder: null,
  })

  // Keep version and room order refs current for async callbacks
  const versionRef = useRef(0)
  const roomOrderRef = useRef<LayoutRoomId[] | null>(null)
  const staircaseXRef = useRef<[number, number, number] | null>(null)

  const initFromServer = useCallback((
    roomOrder: LayoutRoomId[],
    version: number,
    staircaseX?: [number, number, number],
  ) => {
    versionRef.current = version
    roomOrderRef.current = roomOrder
    staircaseXRef.current = staircaseX ?? null
    setState({ roomOrder, layoutVersion: version, conflictRoomOrder: null })
  }, [])

  const persistSwap = useCallback(async (newOrder: LayoutRoomId[]) => {
    roomOrderRef.current = newOrder
    try {
      const body: Record<string, unknown> = {
        roomOrder: newOrder,
        expectedVersion: versionRef.current,
      }
      if (staircaseXRef.current) body.staircaseX = staircaseXRef.current

      const res = await fetch(`/api/layout/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        versionRef.current = data.version
        if (data.staircaseX) staircaseXRef.current = data.staircaseX
        setState((prev) => ({
          ...prev,
          roomOrder: data.roomOrder,
          layoutVersion: data.version,
          conflictRoomOrder: null,
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
          if (current.staircaseX) staircaseXRef.current = current.staircaseX
          setState({
            roomOrder: current.roomOrder,
            layoutVersion: current.version,
            // Signal GameCanvas to rebuild with the server's layout
            conflictRoomOrder: current.roomOrder,
          })
        }
      }
    } catch {
      // Network error — silently fail (swap still happened locally)
    }
  }, [name])

  const persistStaircaseX = useCallback(async (staircaseX: Record<1 | 2 | 3, number>) => {
    const stairArr: [number, number, number] = [staircaseX[1], staircaseX[2], staircaseX[3]]
    staircaseXRef.current = stairArr
    const roomOrder = roomOrderRef.current
    if (!roomOrder) return // no layout yet — skip
    try {
      const res = await fetch(`/api/layout/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomOrder,
          staircaseX: stairArr,
          expectedVersion: versionRef.current,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        versionRef.current = data.version
        if (data.staircaseX) staircaseXRef.current = data.staircaseX
        setState((prev) => ({ ...prev, layoutVersion: data.version }))
      }
      // On conflict, silently accept — staircase position is cosmetic
    } catch {
      // Network error — silently fail
    }
  }, [name])

  return {
    roomOrder: state.roomOrder,
    layoutVersion: state.layoutVersion,
    conflictRoomOrder: state.conflictRoomOrder,
    initFromServer,
    persistSwap,
    persistStaircaseX,
  }
}
