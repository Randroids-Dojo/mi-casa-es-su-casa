'use client'

import { useEffect, useRef, useState } from 'react'
import { CharacterState } from '@/lib/characterSchema'
import { PERSISTENCE_VERSION } from '@/lib/persistenceVersion'

/** App version baked into this JS bundle at build time. */
const CLIENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? ''

/**
 * Persists character state every 30 s and on page unload.
 *
 * Returns `true` when the server indicates this client's JS bundle is stale,
 * either via a 409 (persistence version mismatch) or via an X-App-Version
 * response header that differs from the client's baked-in version.
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
          // Persistence schema mismatch — stop saving to avoid data corruption.
          setVersionStale(true)
          clearInterval(interval)
        } else if (res.ok) {
          // Even when persistence versions match, a hotfix deploy may have
          // changed the app version. Show the banner so users refresh.
          const serverVersion = res.headers.get('X-App-Version')
          if (serverVersion && serverVersion !== CLIENT_APP_VERSION) {
            setVersionStale(true)
          }
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
