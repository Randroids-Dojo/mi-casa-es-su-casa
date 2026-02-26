'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GameCanvas } from './GameCanvas'
import type { GameActions } from './GameCanvas'
import { VisitorPanel } from './VisitorPanel'
import { useCharacterPersistence } from '@/hooks/useCharacterPersistence'
import type { CharacterState } from '@/lib/characterSchema'

interface CharacterViewProps {
  name: string
}

export function CharacterView({ name }: CharacterViewProps) {
  const [gameActions, setGameActions] = useState<GameActions | null>(null)
  const [initialState, setInitialState] = useState<CharacterState | undefined>(undefined)
  const [stateLoaded, setStateLoaded] = useState(false)

  // The ref stays current even as gameActions state updates, so the persistence
  // hook always calls the latest getState without re-registering the interval.
  const gameActionsRef = useRef<GameActions | null>(null)
  gameActionsRef.current = gameActions

  // Fetch initial character state once on mount.
  // Abort after 4 s so a slow/unavailable KV store doesn't block rendering.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)

    fetch(`/api/character/${name}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<CharacterState>
      })
      .then((state) => {
        setInitialState(state)
        setStateLoaded(true)
      })
      .catch(() => {
        // Start fresh — KV unavailable or fetch timed out
        setStateLoaded(true)
      })
      .finally(() => clearTimeout(timer))

    return () => controller.abort()
  }, [name])

  // Persist character state every 30 s and on page unload
  useCharacterPersistence(name, () => gameActionsRef.current?.getState() ?? null)

  const handleGameReady = useCallback((actions: GameActions) => {
    // Wrap in arrow so useState doesn't treat the function as an updater
    setGameActions(() => actions)
  }, [])

  const handleMessagePosted = useCallback(
    (text: string) => {
      gameActionsRef.current?.injectThought(`💌 ${text}`)
      if (text.trim().toLowerCase() === 'giddy up') {
        gameActionsRef.current?.putOnClothes('COWBOY_HAT')
      }
    },
    [],
  )

  if (!stateLoaded) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100dvh' }}>
      <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative' }}>
        <GameCanvas
          characterName={name}
          initialState={initialState}
          onGameReady={handleGameReady}
        />
      </div>
      <VisitorPanel characterName={name} onMessagePosted={handleMessagePosted} />
    </div>
  )
}
