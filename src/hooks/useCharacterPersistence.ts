'use client'

import { useEffect, useRef } from 'react'
import { CharacterState } from '@/lib/characterSchema'

export function useCharacterPersistence(
  name: string,
  getState: () => CharacterState | null,
): void {
  const getStateRef = useRef(getState)
  getStateRef.current = getState

  useEffect(() => {
    // Periodic save every 30 seconds
    const interval = setInterval(async () => {
      const state = getStateRef.current()
      if (!state) return
      await fetch(`/api/character/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
    }, 30_000)

    // Save on page unload via sendBeacon
    const handleUnload = () => {
      const state = getStateRef.current()
      if (!state) return
      navigator.sendBeacon(
        `/api/character/${name}`,
        new Blob([JSON.stringify(state)], { type: 'application/json' }),
      )
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [name])
}
