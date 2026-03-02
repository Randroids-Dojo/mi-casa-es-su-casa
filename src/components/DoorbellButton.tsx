'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

const CRT_GREEN = '#33ff33'
const CRT_DIM = 'rgba(51,255,51,0.55)'
const FONT = '"Share Tech Mono", "Courier New", Courier, monospace'
const COOLDOWN_SECONDS = 15

interface DoorbellButtonProps {
  onRing: () => void
}

export function DoorbellButton({ onRing }: DoorbellButtonProps) {
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleClick = useCallback(() => {
    if (cooldown > 0) return
    onRing()
    setCooldown(COOLDOWN_SECONDS)

    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [cooldown, onRing])

  const disabled = cooldown > 0
  const label = disabled ? `RANG! (${cooldown}s)` : 'RING BELL'

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      aria-label={disabled ? `Doorbell on cooldown, ${cooldown} seconds remaining` : 'Ring the doorbell'}
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 5,
        background: 'rgba(0, 0, 0, 0.7)',
        border: `1px solid ${disabled ? CRT_DIM : CRT_GREEN}`,
        color: disabled ? CRT_DIM : CRT_GREEN,
        fontFamily: FONT,
        fontSize: '12px',
        textShadow: disabled ? 'none' : `0 0 6px ${CRT_GREEN}`,
        padding: '6px 14px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s, border-color 0.2s, color 0.2s, text-shadow 0.2s',
      }}
    >
      {label}
    </button>
  )
}
