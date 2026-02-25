'use client'
import { useEffect, useRef } from 'react'
import { initGame } from '@/game'

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const game = initGame(canvasRef.current)
    return () => game.dispose()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
