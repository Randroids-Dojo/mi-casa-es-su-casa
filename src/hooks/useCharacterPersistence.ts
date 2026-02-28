'use client'

import { useEffect, useRef, useState } from 'react'
import { CharacterState } from '@/lib/characterSchema'
import { PERSISTENCE_VERSION } from '@/lib/persistenceVersion'

/**
 * Persists character state every 30 s and on page unload.
 *
 * Returns `true` when the server rejects a save with 409 (version mismatch),
 * indicating that a newer version of the app has been deployed and this
 * client's JS bundle is stale.
 */
export function useCharacterPersistence(
  name: string,
  getState: () => CharacterState | null,
): boolean {
  const getStateRef = useRef(getState)
  getStateRef.current = getState

  const [versionStale, setVersionStale] = useState(false)

  useEffect(() => {
    const url = `/api/character/${name}?v=${PERSISTENCE_VERSION}`

    // Periodic save every 30 seconds
    const interval = setInterval(async () => {
      const state = getStateRef.current()
      if (!state) return
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        })
        if (res.status === 409) {
          setVersionStale(true)
          clearInterval(interval)
        }
      } catch {
        // Network error — silently skip this cycle
      }
    }, 30_000)

    // Save on page unload via sendBeacon
    const handleUnload = () => {
      const state = getStateRef.current()
      if (!state) return
      navigator.sendBeacon(
        url,
        new Blob([JSON.stringify(state)], { type: 'application/json' }),
      )
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [name])

  return versionStale
}
