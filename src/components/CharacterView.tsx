'use client'

import { useCallback, useState } from 'react'
import { GameCanvas } from './GameCanvas'
import { VisitorPanel } from './VisitorPanel'

interface CharacterViewProps {
  name: string
}

export function CharacterView({ name }: CharacterViewProps) {
  // Store the game's injectThought function once the game is ready.
  // Wrapped in an arrow so useState doesn't treat the function as an updater.
  const [injectFn, setInjectFn] = useState<((text: string) => void) | null>(null)

  const handleGameReady = useCallback((fn: (text: string) => void) => {
    setInjectFn(() => fn)
  }, [])

  const handleMessagePosted = useCallback(
    (text: string) => {
      injectFn?.(`💌 ${text}`)
    },
    [injectFn],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100dvh' }}>
      <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative' }}>
        <GameCanvas characterName={name} onGameReady={handleGameReady} />
      </div>
      <VisitorPanel characterName={name} onMessagePosted={handleMessagePosted} />
    </div>
  )
}
