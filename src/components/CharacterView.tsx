'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GameCanvas } from './GameCanvas'
import type { GameActions } from './GameCanvas'
import { VisitorPanel } from './VisitorPanel'
import { UpdateBanner } from './UpdateBanner'
import { PowerButton } from './PowerButton'
import { useCharacterPersistence } from '@/hooks/useCharacterPersistence'
import { useLayoutPersistence } from '@/hooks/useLayoutPersistence'
import type { CharacterState } from '@/lib/characterSchema'
import type { LayoutRoomId } from '@/lib/layout'
import { matchChatTrigger, pickResponsePhrases } from '@/game/character/chatTriggers'

interface CharacterViewProps {
  name: string
}

export function CharacterView({ name }: CharacterViewProps) {
  const [gameActions, setGameActions] = useState<GameActions | null>(null)
  const [initialState, setInitialState] = useState<CharacterState | undefined>(undefined)
  const [initialRoomOrder, setInitialRoomOrder] = useState<LayoutRoomId[] | undefined>(undefined)
  const [stateLoaded, setStateLoaded] = useState(false)

  // The ref stays current even as gameActions state updates, so the persistence
  // hook always calls the latest getState without re-registering the interval.
  const gameActionsRef = useRef<GameActions | null>(null)
  gameActionsRef.current = gameActions

  const triggerSeedRef = useRef(0)

  // Layout persistence hook
  const { conflictRoomOrder, initFromServer, persistSwap } = useLayoutPersistence(name)

  // Fetch initial character state and layout in parallel once on mount.
  // Abort after 4 s so a slow/unavailable KV store doesn't block rendering.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)

    const characterFetch = fetch(`/api/character/${name}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<CharacterState>
      })
      .catch(() => null)

    const layoutFetch = fetch(`/api/layout/${encodeURIComponent(name)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) return null
        return r.json() as Promise<{ roomOrder: LayoutRoomId[]; version: number }>
      })
      .catch(() => null)

    Promise.all([characterFetch, layoutFetch])
      .then(([charState, layoutData]) => {
        if (charState) setInitialState(charState)
        if (layoutData) {
          setInitialRoomOrder(layoutData.roomOrder)
          initFromServer(layoutData.roomOrder, layoutData.version)
        }
        setStateLoaded(true)
      })
      .finally(() => clearTimeout(timer))

    return () => controller.abort()
  }, [name, initFromServer])

  // Persist character state every 30 s and on page unload
  const versionStale = useCharacterPersistence(name, () => gameActionsRef.current?.getState() ?? null)

  const handleGameReady = useCallback((actions: GameActions) => {
    // Wrap in arrow so useState doesn't treat the function as an updater
    setGameActions(() => actions)
  }, [])

  const handleMessagePosted = useCallback(
    (text: string) => {
      // Cowboy hat easter egg
      if (text.trim().toLowerCase() === 'giddy up') {
        gameActionsRef.current?.injectThought(`💌 ${text}`)
        gameActionsRef.current?.putOnClothes('COWBOY_HAT')
        return
      }

      // Check for keyword triggers — character reacts by going to the room
      const match = matchChatTrigger(text)
      if (match) {
        const phrases = pickResponsePhrases(match.trigger, triggerSeedRef.current++)
        gameActionsRef.current?.goToRoom(
          match.trigger.room,
          match.trigger.activity,
          match.trigger.durationHours,
          phrases,
        )
        return
      }

      // No trigger matched — show message as thought bubble
      gameActionsRef.current?.injectThought(`💌 ${text}`)
    },
    [],
  )

  if (!stateLoaded) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100dvh' }}>
      <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative' }}>
        {versionStale && <UpdateBanner />}
        <GameCanvas
          characterName={name}
          initialState={initialState}
          onGameReady={handleGameReady}
          initialRoomOrder={initialRoomOrder}
          onLayoutSwap={persistSwap}
          externalRoomOrder={conflictRoomOrder}
        />
        <PowerButton />
      </div>
      <VisitorPanel characterName={name} onMessagePosted={handleMessagePosted} />
    </div>
  )
}
