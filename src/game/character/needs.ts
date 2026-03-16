// ---------------------------------------------------------------------------
// Needs system — hunger, sleep, hygiene, entertainment
// ---------------------------------------------------------------------------
//
// Each need is a float in [0, 1]:
//   0 = fully satisfied
//   1 = critically urgent
//
// Needs increase passively over game-time and decrease when the character
// performs the relevant activity. If any need exceeds 0.85 it becomes
// "critical" and overrides the normal schedule.

import type { ActivityType } from '../rooms'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Needs {
  /** 0–1: increases over time, decreases when eating */
  hunger: number
  /** 0–1: increases over time, decreases when sleeping */
  sleep: number
  /** 0–1: increases slowly, decreases when bathing/grooming */
  hygiene: number
  /** 0–1: increases when idle/bored, decreases during fun activities */
  entertainment: number
}

// ---------------------------------------------------------------------------
// Decay / recovery rates (per game hour)
// ---------------------------------------------------------------------------

/**
 * How fast each need increases per game hour when not being addressed.
 * A value of 0.05 means the need fills completely in 20 game hours.
 */
const NEED_INCREASE_RATE: Readonly<Record<keyof Needs, number>> = {
  hunger: 0.06, // fills in ~17 game hours
  sleep: 0.05, // fills in ~20 game hours
  hygiene: 0.02, // fills in ~50 game hours (stays manageable longer)
  entertainment: 0.04, // fills in ~25 game hours
}

/**
 * How much each activity reduces each need per game hour of performance.
 * Only non-zero entries are listed; all others default to 0.
 */
const ACTIVITY_EFFECT_RATE: Readonly<
  Partial<Record<ActivityType, Partial<Record<keyof Needs, number>>>>
> = {
  eat: { hunger: -0.8 }, // eating reduces hunger quickly
  cook: { hunger: -0.1 }, // cooking slightly reduces hunger (snacking)
  sleep: { sleep: -0.5 }, // sleeping reduces sleep need
  bathe: { hygiene: -1.0 }, // bathing reduces hygiene need significantly
  groom: { hygiene: -0.4 }, // grooming also helps
  relax: { entertainment: -0.3, sleep: -0.04 },
  watch_tv: { entertainment: -0.4 },
  read: { entertainment: -0.35 },
  paint: { entertainment: -0.5 },
  play_instrument: { entertainment: -0.5 },
  tinker: { entertainment: -0.45 },
  work: { entertainment: -0.1 }, // work is mildly stimulating
  type: { entertainment: -0.1 },
  idle: {}, // idle does nothing beneficial
  rummage: { entertainment: -0.15 },
  dress: { hygiene: -0.1 },
  water_plant: {}, // plant watering has no need effects
}

/** All need keys in a stable order */
export const NEED_KEYS: readonly (keyof Needs)[] = ['hunger', 'sleep', 'hygiene', 'entertainment']

/** Threshold above which a need is considered critical (overrides schedule) */
export const CRITICAL_NEED_THRESHOLD = 0.85

/** Default starting needs for a brand-new character */
export const DEFAULT_NEEDS: Readonly<Needs> = {
  hunger: 0.2,
  sleep: 0.1,
  hygiene: 0.15,
  entertainment: 0.1,
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Clamps a value to [0, 1].
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * Returns the most urgent need (the one with the highest value).
 * Ties broken by fixed priority order: sleep > hunger > hygiene > entertainment.
 */
export function getMostUrgentNeed(needs: Needs): keyof Needs {
  const priority: readonly (keyof Needs)[] = ['sleep', 'hunger', 'hygiene', 'entertainment']
  let best: keyof Needs = priority[0]
  for (const key of priority) {
    if (needs[key] > needs[best]) {
      best = key
    }
  }
  return best
}

/**
 * Returns the value of the most urgent need.
 */
export function getMostUrgentNeedValue(needs: Needs): number {
  return needs[getMostUrgentNeed(needs)]
}

/**
 * Returns true if any need is at or above the critical threshold.
 */
export function hasAnyCriticalNeed(needs: Needs): boolean {
  return getMostUrgentNeedValue(needs) >= CRITICAL_NEED_THRESHOLD
}

/**
 * Returns a list of needs that are at or above the critical threshold.
 */
export function getCriticalNeeds(needs: Needs): (keyof Needs)[] {
  return (Object.keys(needs) as (keyof Needs)[]).filter(
    (k) => needs[k] >= CRITICAL_NEED_THRESHOLD,
  )
}

/**
 * Advances all needs by `deltaHours` game hours of passive decay.
 * All needs increase toward 1 over time; none can exceed 1 or drop below 0.
 */
export function advanceNeeds(needs: Needs, deltaHours: number): Needs {
  return {
    hunger: clamp01(needs.hunger + NEED_INCREASE_RATE.hunger * deltaHours),
    sleep: clamp01(needs.sleep + NEED_INCREASE_RATE.sleep * deltaHours),
    hygiene: clamp01(needs.hygiene + NEED_INCREASE_RATE.hygiene * deltaHours),
    entertainment: clamp01(
      needs.entertainment + NEED_INCREASE_RATE.entertainment * deltaHours,
    ),
  }
}

/**
 * Applies the effect of performing an activity for `deltaHours` game hours.
 * While the passive decay still accumulates, activity effects subtract from needs.
 * Net result: needs may decrease, hold steady, or still increase depending on rate.
 */
export function applyActivityEffect(
  needs: Needs,
  activity: ActivityType,
  deltaHours: number,
): Needs {
  const effects = ACTIVITY_EFFECT_RATE[activity] ?? {}

  const result: Needs = advanceNeeds(needs, deltaHours)

  // Apply activity-specific recovery on top of natural decay
  for (const key of Object.keys(effects) as (keyof Needs)[]) {
    const rate = effects[key] ?? 0
    result[key] = clamp01(result[key] + rate * deltaHours)
  }

  return result
}

/**
 * Applies a single instantaneous activity effect (no time delta).
 * Useful for one-shot events (e.g., character just ate a full meal).
 */
/**
 * Counts how many needs transitioned from non-zero to zero between two states.
 * Used to award pesos when a need fully recovers.
 */
export function countRecoveredNeeds(prev: Needs, next: Needs): number {
  let count = 0
  for (const key of NEED_KEYS) {
    if (prev[key] > 0 && next[key] === 0) count += 1
  }
  return count
}

export function applyInstantActivityEffect(needs: Needs, activity: ActivityType): Needs {
  const effects = ACTIVITY_EFFECT_RATE[activity] ?? {}
  const result: Needs = { ...needs }

  for (const key of Object.keys(effects) as (keyof Needs)[]) {
    const rate = effects[key] ?? 0
    // Instant effect uses 1 game hour worth of effect as a base
    result[key] = clamp01(result[key] + rate)
  }

  return result
}
