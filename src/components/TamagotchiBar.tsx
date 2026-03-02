'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameActions } from './GameCanvas'
import type { TamagotchiAction, TamagotchiActionId } from '@/game/character/tamagotchiReactions'
import { getTamagotchiActions, pickTamagotchiPhrases } from '@/game/character/tamagotchiReactions'
import { seedFromName } from '@/game/character/seeder'

// ---------------------------------------------------------------------------
// Styling constants (matching VisitorPanel CRT aesthetic)
// ---------------------------------------------------------------------------

const CRT_GREEN = '#33ff33'
const CRT_DIM = 'rgba(51,255,51,0.55)'
const FONT = '"Share Tech Mono", "Courier New", Courier, monospace'
const DOORBELL_COOLDOWN_MS = 15_000

// ---------------------------------------------------------------------------
// Need bar config
// ---------------------------------------------------------------------------

interface NeedBarConfig {
  key: 'hunger' | 'sleep' | 'hygiene' | 'entertainment'
  label: string
  icon: string
}

const NEED_BARS: NeedBarConfig[] = [
  { key: 'hunger', label: 'HGR', icon: '🍔' },
  { key: 'sleep', label: 'SLP', icon: '💤' },
  { key: 'hygiene', label: 'HYG', icon: '🧼' },
  { key: 'entertainment', label: 'FUN', icon: '🎮' },
]

// ---------------------------------------------------------------------------
// Button icons (simple ASCII/text for CRT aesthetic)
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<TamagotchiActionId, string> = {
  feed: '🍕',
  play: '🎲',
  clean: '🛁',
  sleep: '🛏️',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map need value (0 = satisfied, 1 = critical) to a color. */
function needColor(value: number): string {
  if (value < 0.3) return '#33ff33' // green — satisfied
  if (value < 0.5) return '#aaff33' // yellow-green
  if (value < 0.7) return '#ffbb33' // amber
  if (value < 0.85) return '#ff6633' // orange-red
  return '#ff3333' // red — critical
}

/** Format remaining cooldown seconds. */
function formatCooldown(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TamagotchiBarProps {
  characterName: string
  gameActions: GameActions | null
  onInteraction: (action: TamagotchiAction, phrases: string[]) => void
  onRing: () => void
}

export function TamagotchiBar({ characterName, gameActions, onInteraction, onRing }: TamagotchiBarProps) {
  const [needs, setNeeds] = useState<Record<string, number>>({
    hunger: 0,
    sleep: 0,
    hygiene: 0,
    entertainment: 0,
  })
  const [cooldowns, setCooldowns] = useState<Record<TamagotchiActionId | 'doorbell', number>>({
    feed: 0,
    play: 0,
    clean: 0,
    sleep: 0,
    doorbell: 0,
  })
  const phraseSeedRef = useRef(0)

  // Derive actions from character's seeded hobby type
  const appearance = seedFromName(characterName)
  const actions = getTamagotchiActions(appearance.hobbyType)

  // Poll game state for needs every 2s
  useEffect(() => {
    if (!gameActions) return
    const poll = setInterval(() => {
      const state = gameActions.getState()
      if (state) {
        setNeeds(state.needs)
      }
    }, 2000)
    // Initial read
    const state = gameActions.getState()
    if (state) setNeeds(state.needs)
    return () => clearInterval(poll)
  }, [gameActions])

  // Cooldown ticker — update every second while any cooldown is active
  useEffect(() => {
    const hasActive = Object.values(cooldowns).some((t) => t > Date.now())
    if (!hasActive) return
    const tick = setInterval(() => {
      setCooldowns((prev) => {
        const now = Date.now()
        const allExpired = Object.values(prev).every((t) => t <= now)
        if (allExpired) return { feed: 0, play: 0, clean: 0, sleep: 0, doorbell: 0 }
        // Return same object to skip re-render if nothing changed
        return { ...prev }
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [cooldowns])

  const handleClick = useCallback(
    (action: TamagotchiAction) => {
      if (!gameActions) return
      const now = Date.now()
      if (cooldowns[action.id] > now) return

      // Check if character is already doing this activity
      const state = gameActions.getState()
      if (state && state.currentActivity === action.activity) {
        gameActions.injectThought('Already doing that!')
        return
      }

      const phrases = pickTamagotchiPhrases(action, phraseSeedRef.current++)
      onInteraction(action, phrases)

      setCooldowns((prev) => ({
        ...prev,
        [action.id]: now + action.cooldownMs,
      }))
    },
    [gameActions, cooldowns, onInteraction],
  )

  const handleDoorbell = useCallback(() => {
    const now = Date.now()
    if (cooldowns.doorbell > now) return
    onRing()
    setCooldowns((prev) => ({ ...prev, doorbell: now + DOORBELL_COOLDOWN_MS }))
  }, [cooldowns, onRing])

  const now = Date.now()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '6px 12px',
        background: '#0a0a0a',
        borderTop: `1px solid ${CRT_DIM}`,
        borderBottom: `1px solid ${CRT_DIM}`,
        fontFamily: FONT,
        fontSize: 11,
        color: CRT_GREEN,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Need bars */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {NEED_BARS.map((bar) => {
          const value = needs[bar.key] ?? 0
          return (
            <div
              key={bar.key}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>{bar.icon}</span>
              <div
                style={{
                  width: 8,
                  height: 32,
                  background: '#1a1a1a',
                  border: `1px solid ${CRT_DIM}`,
                  borderRadius: 2,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Fill from bottom. Value 0 = empty (satisfied), 1 = full (critical). */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    width: '100%',
                    height: `${Math.round(value * 100)}%`,
                    background: needColor(value),
                    transition: 'height 1s ease, background-color 1s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 8, color: CRT_DIM, letterSpacing: 0.5 }}>{bar.label}</span>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 36,
          background: CRT_DIM,
          flexShrink: 0,
        }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {actions.map((action) => {
          const onCooldown = cooldowns[action.id] > now
          const remainingMs = onCooldown ? cooldowns[action.id] - now : 0

          return (
            <button
              key={action.id}
              onClick={() => handleClick(action)}
              disabled={onCooldown || !gameActions}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '4px 10px',
                background: onCooldown ? '#1a1a1a' : '#0f1f0f',
                border: `1px solid ${onCooldown ? 'rgba(51,255,51,0.2)' : CRT_DIM}`,
                borderRadius: 3,
                color: onCooldown ? 'rgba(51,255,51,0.3)' : CRT_GREEN,
                fontFamily: FONT,
                fontSize: 10,
                cursor: onCooldown ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                minWidth: 52,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>
                {ACTION_ICONS[action.id]}
              </span>
              <span style={{ fontWeight: 'bold', letterSpacing: 1 }}>
                {onCooldown ? formatCooldown(remainingMs) : action.label}
              </span>
            </button>
          )
        })}

        {/* Doorbell */}
        {(() => {
          const bellCooldown = cooldowns.doorbell > now
          const bellRemainingMs = bellCooldown ? cooldowns.doorbell - now : 0
          return (
            <button
              onClick={handleDoorbell}
              disabled={bellCooldown || !gameActions}
              aria-label={bellCooldown ? `Doorbell on cooldown, ${Math.ceil(bellRemainingMs / 1000)} seconds remaining` : 'Ring the doorbell'}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '4px 10px',
                background: bellCooldown ? '#1a1a1a' : '#0f1f0f',
                border: `1px solid ${bellCooldown ? 'rgba(51,255,51,0.2)' : CRT_DIM}`,
                borderRadius: 3,
                color: bellCooldown ? 'rgba(51,255,51,0.3)' : CRT_GREEN,
                fontFamily: FONT,
                fontSize: 10,
                cursor: bellCooldown ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                minWidth: 52,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>🔔</span>
              <span style={{ fontWeight: 'bold', letterSpacing: 1 }}>
                {bellCooldown ? formatCooldown(bellRemainingMs) : 'BELL'}
              </span>
            </button>
          )
        })()}
      </div>
    </div>
  )
}
