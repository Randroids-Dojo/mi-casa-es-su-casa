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

  useEffect(() => {
    if (!canvasRef.current) return

    const game = initGame(canvasRef.current, characterName)

    // Poll getCurrentThought every 100ms and sync to React state
    const pollId = setInterval(() => {
      const current = game.getCurrentThought()
      setThought((prev) => (prev !== current ? current : prev))
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
      <ThoughtBubble text={thought} visible={thought !== null} />
    </div>
  )
}
