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
 * Returns the current room order, and a callback to persist swaps.
 */
export function useLayoutPersistence(name: string) {
  const [state, setState] = useState<LayoutPersistenceState>({
    roomOrder: null,
    layoutVersion: 0,
    conflictRoomOrder: null,
  })

  // Keep version ref current for the async callback
  const versionRef = useRef(0)

  const initFromServer = useCallback((roomOrder: LayoutRoomId[], version: number) => {
    versionRef.current = version
    setState({ roomOrder, layoutVersion: version, conflictRoomOrder: null })
  }, [])

  const persistSwap = useCallback(async (newOrder: LayoutRoomId[]) => {
    try {
      const res = await fetch(`/api/layout/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomOrder: newOrder,
          expectedVersion: versionRef.current,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        versionRef.current = data.version
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

  return {
    roomOrder: state.roomOrder,
    layoutVersion: state.layoutVersion,
    conflictRoomOrder: state.conflictRoomOrder,
    initFromServer,
    persistSwap,
  }
}
