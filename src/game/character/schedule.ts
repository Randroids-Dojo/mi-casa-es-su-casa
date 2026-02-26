// ---------------------------------------------------------------------------
// Daily schedule and activity selection
// ---------------------------------------------------------------------------
//
// Selects the next room + activity based on:
//   1. Time of day (game clock)
//   2. Current needs (critical needs override schedule)
//   3. Personality bias (weights preferred activities)
//   4. Semi-deterministic randomness (seeded from name + day + hour)

import type { RoomId, ActivityType } from '../rooms'
import { ROOM_MAP } from '../rooms'
import type { Needs } from './needs'
import { getMostUrgentNeed, getCriticalNeeds, CRITICAL_NEED_THRESHOLD } from './needs'
import type { PersonalityBias, HobbyType } from './seeder'
import { seededRngFromKey } from './seeder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameClock {
  /** Current hour of the day, 0–24, may be fractional (14.5 = 2:30pm) */
  hour: number
  /** Integer day count since character creation */
  day: number
}

export interface ActivitySelection {
  room: RoomId
  activity: ActivityType
  /** How long to perform this activity, in game hours */
  durationHours: number
}

// ---------------------------------------------------------------------------
// Schedule slots
// ---------------------------------------------------------------------------

/**
 * A scheduled slot defines what the character should prefer doing at a given
 * hour range. Multiple candidate slots are defined per period and one is
 * weighted-randomly selected.
 */
interface ScheduleSlot {
  startHour: number
  endHour: number
  candidates: Array<{
    room: RoomId
    activity: ActivityType
    durationHours: number
    /** Base weight for selection (higher = more likely) */
    weight: number
  }>
}

const BASE_SCHEDULE: readonly ScheduleSlot[] = [
  // Midnight – 6am: sleep
  {
    startHour: 0,
    endHour: 6,
    candidates: [
      { room: 'bedroom', activity: 'sleep', durationHours: 2, weight: 10 },
    ],
  },
  // 6am – 9am: morning routine
  {
    startHour: 6,
    endHour: 9,
    candidates: [
      { room: 'bathroom', activity: 'bathe', durationHours: 0.5, weight: 6 },
      { room: 'bathroom', activity: 'groom', durationHours: 0.25, weight: 4 },
      { room: 'kitchen', activity: 'eat', durationHours: 0.5, weight: 5 },
      { room: 'bedroom', activity: 'dress', durationHours: 0.25, weight: 3 },
    ],
  },
  // 9am – 12pm: work / hobbies
  {
    startHour: 9,
    endHour: 12,
    candidates: [
      { room: 'study', activity: 'work', durationHours: 1, weight: 6 },
      { room: 'study', activity: 'type', durationHours: 1, weight: 4 },
      { room: 'study', activity: 'read', durationHours: 0.75, weight: 3 },
      { room: 'hobby_room', activity: 'paint', durationHours: 1, weight: 4 },
      { room: 'hobby_room', activity: 'tinker', durationHours: 1, weight: 3 },
      { room: 'hobby_room', activity: 'play_instrument', durationHours: 1, weight: 3 },
    ],
  },
  // 12pm – 1pm: lunch
  {
    startHour: 12,
    endHour: 13,
    candidates: [
      { room: 'kitchen', activity: 'cook', durationHours: 0.5, weight: 5 },
      { room: 'kitchen', activity: 'eat', durationHours: 0.5, weight: 6 },
    ],
  },
  // 1pm – 5pm: afternoon — mix of leisure and hobbies
  {
    startHour: 13,
    endHour: 17,
    candidates: [
      { room: 'living_room', activity: 'relax', durationHours: 1, weight: 5 },
      { room: 'living_room', activity: 'watch_tv', durationHours: 1, weight: 5 },
      { room: 'living_room', activity: 'read', durationHours: 0.75, weight: 4 },
      { room: 'hobby_room', activity: 'paint', durationHours: 1, weight: 4 },
      { room: 'hobby_room', activity: 'tinker', durationHours: 1, weight: 3 },
      { room: 'hobby_room', activity: 'play_instrument', durationHours: 1, weight: 3 },
      { room: 'study', activity: 'read', durationHours: 0.75, weight: 2 },
    ],
  },
  // 5pm – 7pm: dinner prep / eating
  {
    startHour: 17,
    endHour: 19,
    candidates: [
      { room: 'kitchen', activity: 'cook', durationHours: 0.5, weight: 6 },
      { room: 'kitchen', activity: 'eat', durationHours: 0.5, weight: 6 },
    ],
  },
  // 7pm – 11pm: evening wind-down
  {
    startHour: 19,
    endHour: 23,
    candidates: [
      { room: 'living_room', activity: 'watch_tv', durationHours: 1, weight: 6 },
      { room: 'living_room', activity: 'relax', durationHours: 1, weight: 5 },
      { room: 'living_room', activity: 'read', durationHours: 0.75, weight: 4 },
      { room: 'hobby_room', activity: 'play_instrument', durationHours: 1, weight: 3 },
      { room: 'hobby_room', activity: 'tinker', durationHours: 1, weight: 2 },
      { room: 'study', activity: 'read', durationHours: 0.75, weight: 3 },
    ],
  },
  // 11pm – midnight: bed
  {
    startHour: 23,
    endHour: 24,
    candidates: [
      { room: 'bedroom', activity: 'sleep', durationHours: 2, weight: 9 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Personality weight adjustments
// ---------------------------------------------------------------------------

/**
 * Maps personality bias to activity weight multipliers.
 * Activities not listed use a multiplier of 1.
 */
const PERSONALITY_WEIGHT_MODIFIERS: Readonly<
  Record<PersonalityBias, Partial<Record<ActivityType, number>>>
> = {
  introverted: {
    read: 2.0,
    tinker: 1.5,
    paint: 1.5,
    watch_tv: 0.7,
    relax: 1.3,
    play_instrument: 1.2,
  },
  extroverted: {
    watch_tv: 1.5,
    relax: 1.3,
    work: 1.4,
    type: 1.2,
    read: 0.7,
  },
  lazy: {
    relax: 2.5,
    watch_tv: 2.0,
    sleep: 1.5,
    work: 0.4,
    type: 0.5,
    paint: 0.6,
  },
  energetic: {
    work: 1.8,
    type: 1.5,
    tinker: 1.5,
    play_instrument: 1.3,
    relax: 0.5,
    sleep: 0.7,
  },
}

/**
 * Maps hobby type to activity weight multipliers.
 * Boosts the hobby-relevant activities.
 */
const HOBBY_WEIGHT_MODIFIERS: Readonly<
  Record<HobbyType, Partial<Record<ActivityType, number>>>
> = {
  music: { play_instrument: 3.0 },
  painting: { paint: 3.0 },
  tinkering: { tinker: 3.0 },
  reading: { read: 3.0 },
}

// ---------------------------------------------------------------------------
// Need-driven override rooms/activities
// ---------------------------------------------------------------------------

/** What to do when a specific need becomes critical */
const CRITICAL_NEED_RESOLUTION: Readonly<
  Record<keyof Needs, { room: RoomId; activity: ActivityType; durationHours: number }>
> = {
  hunger: { room: 'kitchen', activity: 'eat', durationHours: 0.5 },
  sleep: { room: 'bedroom', activity: 'sleep', durationHours: 2 },
  hygiene: { room: 'bathroom', activity: 'bathe', durationHours: 0.5 },
  entertainment: { room: 'living_room', activity: 'watch_tv', durationHours: 1 },
}

// ---------------------------------------------------------------------------
// Main selection function
// ---------------------------------------------------------------------------

/**
 * Given the current game clock, needs, personality, and current room,
 * selects the next room + activity + duration for the character to perform.
 *
 * Logic priority:
 *   1. If any need is critical (>= 0.85), resolve the most urgent critical need.
 *   2. Otherwise, use time-of-day schedule with personality-weighted randomness.
 *
 * Randomness is seeded from `name + day + Math.floor(hour)` for semi-determinism.
 */
export function selectNextActivity(
  clock: GameClock,
  needs: Needs,
  personality: PersonalityBias,
  hobbyType: HobbyType,
  currentRoom: RoomId,
  characterName: string,
): ActivitySelection {
  // 1. Check for critical needs override
  const criticalNeeds = getCriticalNeeds(needs)
  if (criticalNeeds.length > 0) {
    // Resolve the most urgent one
    const urgentNeed = getMostUrgentNeed(needs)
    if (needs[urgentNeed] >= CRITICAL_NEED_THRESHOLD) {
      return CRITICAL_NEED_RESOLUTION[urgentNeed]
    }
  }

  // 2. Find applicable schedule slot
  const normalizedHour = ((clock.hour % 24) + 24) % 24
  const slot = BASE_SCHEDULE.find(
    (s) => normalizedHour >= s.startHour && normalizedHour < s.endHour,
  )

  // Fallback: if somehow no slot matches (shouldn't happen with 0-24 coverage), sleep
  if (!slot || slot.candidates.length === 0) {
    return { room: 'bedroom', activity: 'sleep', durationHours: 1 }
  }

  // 3. Calculate weights for each candidate
  const personalityMods = PERSONALITY_WEIGHT_MODIFIERS[personality]
  const hobbyMods = HOBBY_WEIGHT_MODIFIERS[hobbyType]

  const rng = seededRngFromKey(
    `${characterName}:${clock.day}:${Math.floor(normalizedHour)}`,
  )

  // Filter candidates to only rooms where their activities are actually available
  const viableCandidates = slot.candidates.filter((c) => {
    const room = ROOM_MAP[c.room]
    return room.activities.includes(c.activity)
  })

  if (viableCandidates.length === 0) {
    return { room: 'bedroom', activity: 'idle', durationHours: 0.25 }
  }

  const weights = viableCandidates.map((c) => {
    let w = c.weight
    // Apply personality modifier
    const pMod = personalityMods[c.activity]
    if (pMod !== undefined) w *= pMod
    // Apply hobby modifier
    const hMod = hobbyMods[c.activity]
    if (hMod !== undefined) w *= hMod
    // Small same-room bonus (avoid unnecessary movement)
    if (c.room === currentRoom) w *= 1.2
    return Math.max(0.1, w) // ensure positive weight
  })

  // 4. Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  let pick = rng.next() * totalWeight
  for (let i = 0; i < viableCandidates.length; i++) {
    pick -= weights[i]
    if (pick <= 0) {
      const chosen = viableCandidates[i]
      return {
        room: chosen.room,
        activity: chosen.activity,
        durationHours: chosen.durationHours,
      }
    }
  }

  // Fallback to last candidate
  const last = viableCandidates[viableCandidates.length - 1]
  return {
    room: last.room,
    activity: last.activity,
    durationHours: last.durationHours,
  }
}

/**
 * Returns the initial activity for a brand-new character at game start.
 * When a character name is provided, picks a random room and valid activity
 * so each page load feels different.
 */
export function getInitialActivity(characterName?: string): ActivitySelection {
  if (!characterName) {
    return { room: 'living_room', activity: 'idle', durationHours: 0.25 }
  }

  // Rooms where it makes sense to start (exclude staircase — it's a transit hub)
  const startableRooms: RoomId[] = [
    'entrance', 'living_room', 'kitchen', 'bedroom',
    'study', 'bathroom', 'hobby_room', 'storage',
  ]

  // Use a URL query param for test determinism; otherwise Math.random()
  // provides per-load entropy so the same name gets a different room.
  let entropy: number | string = Math.random()
  if (typeof window !== 'undefined') {
    const testSeed = new URLSearchParams(window.location.search).get('__test_seed')
    if (testSeed) entropy = testSeed
  }
  const rng = seededRngFromKey(`${characterName}:start:${entropy}`)
  const room = rng.pick(startableRooms)
  const roomDef = ROOM_MAP[room]
  const activity = rng.pick(roomDef.activities)

  return { room, activity, durationHours: 0.25 }
}

/**
 * Returns a human-readable description of what a character is doing,
 * for thought bubble text and debug display.
 */
export function describeActivity(activity: ActivityType): string {
  const descriptions: Record<ActivityType, string> = {
    relax: 'relaxing',
    watch_tv: 'watching TV',
    read: 'reading',
    cook: 'cooking',
    eat: 'eating',
    sleep: 'sleeping',
    dress: 'getting dressed',
    work: 'working',
    type: 'typing',
    bathe: 'bathing',
    groom: 'grooming',
    paint: 'painting',
    play_instrument: 'playing music',
    tinker: 'tinkering',
    rummage: 'rummaging around',
    idle: 'standing around',
  }
  return descriptions[activity] ?? activity
}
