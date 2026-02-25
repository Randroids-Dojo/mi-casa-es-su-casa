'use client'
import { useEffect, useRef, useState } from 'react'
import { initGame } from '@/game'
import { ThoughtBubble } from './ThoughtBubble'

interface GameCanvasProps {
  /** Character name used to seed appearance and behaviour (default: 'resident') */
  characterName?: string
}

export function GameCanvas({ characterName = 'resident' }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [thought, setThought] = useState<string | null>(null)
  const [headPos, setHeadPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const game = initGame(canvasRef.current, characterName)

    // Poll thought and head position every 100ms
    const pollId = setInterval(() => {
      const current = game.getCurrentThought()
      setThought((prev) => (prev !== current ? current : prev))

      const pos = game.getCharacterHeadScreenPos()
      setHeadPos(pos)
    }, 100)

    return () => {
      clearInterval(pollId)
      game.dispose()
    }
  }, [characterName])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
