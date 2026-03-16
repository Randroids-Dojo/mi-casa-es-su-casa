// ---------------------------------------------------------------------------
// Offline character simulation — server-safe (no Three.js)
// ---------------------------------------------------------------------------
//
// When a character hasn't been observed for a while, this module fast-forwards
// through the schedule to produce a plausible new state. The simulation is
// deterministic: same saved state + same elapsed time = same output.
//
// Imports only server-safe modules (seeder, needs, roomData). Schedule data
// (time slots, personality weights) is inlined here to avoid importing
// schedule.ts which depends on rooms.ts → Three.js.

import type { CharacterState, Needs } from './characterSchema'
import type { ActivityType } from '@/game/rooms'
import { ROOM_CENTERS, ROOM_ACTIVITIES } from './roomData'
import { seedFromName, seededRngFromKey } from '@/game/character/seeder'
import { generateLayout } from './layout'
import type { HouseLayout } from './layout'
import { buildLayoutRoomData } from './roomDataBuilder'
import type { LayoutRoomData } from './roomDataBuilder'
import type { PersonalityBias, HobbyType } from '@/game/character/seeder'
import {
  advanceNeeds,
  applyActivityEffect,
  getCriticalNeeds,
  getMostUrgentNeed,
  CRITICAL_NEED_THRESHOLD,
} from '@/game/character/needs'

// ---------------------------------------------------------------------------
// Time conversion
// ---------------------------------------------------------------------------

/**
 * Matches REAL_SECONDS_PER_GAME_MINUTE from character.ts.
 * 1 real second = 10 game minutes.
 */
const REAL_SECONDS_PER_GAME_MINUTE = 1 / 10

function realSecondsToGameHours(realSeconds: number): number {
  return realSeconds / REAL_SECONDS_PER_GAME_MINUTE / 60
}

// ---------------------------------------------------------------------------
// Schedule data (mirrored from schedule.ts to avoid Three.js dependency)
// ---------------------------------------------------------------------------

type RoomId = string

interface ScheduleCandidate {
  room: RoomId
  activity: string
  durationHours: number
  weight: number
}

interface ScheduleSlot {
  startHour: number
  endHour: number
  candidates: ScheduleCandidate[]
}

const BASE_SCHEDULE: readonly ScheduleSlot[] = [
  {
    startHour: 0, endHour: 6,
    candidates: [
      { room: 'bedroom', activity: 'sleep', durationHours: 2, weight: 10 },
    ],
  },
  {
    startHour: 6, endHour: 9,
    candidates: [
      { room: 'bathroom', activity: 'bathe', durationHours: 0.5, weight: 6 },
      { room: 'bathroom', activity: 'groom', durationHours: 0.25, weight: 4 },
      { room: 'kitchen', activity: 'eat', durationHours: 0.5, weight: 5 },
      { room: 'bedroom', activity: 'dress', durationHours: 0.25, weight: 3 },
    ],
  },
  {
    startHour: 9, endHour: 12,
    candidates: [
      { room: 'study', activity: 'work', durationHours: 1, weight: 6 },
      { room: 'study', activity: 'type', durationHours: 1, weight: 4 },
      { room: 'study', activity: 'read', durationHours: 0.75, weight: 3 },
      { room: 'hobby_room', activity: 'paint', durationHours: 1, weight: 4 },
      { room: 'hobby_room', activity: 'tinker', durationHours: 1, weight: 3 },
      { room: 'hobby_room', activity: 'play_instrument', durationHours: 1, weight: 3 },
      { room: 'bathroom', activity: 'use_bathroom', durationHours: 0.25, weight: 1 },
    ],
  },
  {
    startHour: 12, endHour: 13,
    candidates: [
      { room: 'kitchen', activity: 'cook', durationHours: 0.5, weight: 5 },
      { room: 'kitchen', activity: 'eat', durationHours: 0.5, weight: 6 },
    ],
  },
  {
    startHour: 13, endHour: 17,
    candidates: [
      { room: 'living_room', activity: 'relax', durationHours: 1, weight: 5 },
      { room: 'living_room', activity: 'watch_tv', durationHours: 1, weight: 5 },
      { room: 'living_room', activity: 'read', durationHours: 0.75, weight: 4 },
      { room: 'hobby_room', activity: 'paint', durationHours: 1, weight: 4 },
      { room: 'hobby_room', activity: 'tinker', durationHours: 1, weight: 3 },
      { room: 'hobby_room', activity: 'play_instrument', durationHours: 1, weight: 3 },
      { room: 'study', activity: 'read', durationHours: 0.75, weight: 2 },
      { room: 'bathroom', activity: 'use_bathroom', durationHours: 0.25, weight: 1 },
    ],
  },
  {
    startHour: 17, endHour: 19,
    candidates: [
      { room: 'kitchen', activity: 'cook', durationHours: 0.5, weight: 6 },
      { room: 'kitchen', activity: 'eat', durationHours: 0.5, weight: 6 },
    ],
  },
  {
    startHour: 19, endHour: 23,
    candidates: [
      { room: 'living_room', activity: 'watch_tv', durationHours: 1, weight: 6 },
      { room: 'living_room', activity: 'relax', durationHours: 1, weight: 5 },
      { room: 'living_room', activity: 'read', durationHours: 0.75, weight: 4 },
      { room: 'hobby_room', activity: 'play_instrument', durationHours: 1, weight: 3 },
      { room: 'hobby_room', activity: 'tinker', durationHours: 1, weight: 2 },
      { room: 'study', activity: 'read', durationHours: 0.75, weight: 3 },
      { room: 'bathroom', activity: 'use_bathroom', durationHours: 0.25, weight: 1 },
    ],
  },
  {
    startHour: 23, endHour: 24,
    candidates: [
      { room: 'bedroom', activity: 'sleep', durationHours: 2, weight: 9 },
    ],
  },
]

const PERSONALITY_WEIGHT_MODIFIERS: Readonly<
  Record<PersonalityBias, Partial<Record<string, number>>>
> = {
  introverted: { read: 2.0, tinker: 1.5, paint: 1.5, watch_tv: 0.7, relax: 1.3, play_instrument: 1.2 },
  extroverted: { watch_tv: 1.5, relax: 1.3, work: 1.4, type: 1.2, read: 0.7 },
  lazy: { relax: 2.5, watch_tv: 2.0, sleep: 1.5, work: 0.4, type: 0.5, paint: 0.6 },
  energetic: { work: 1.8, type: 1.5, tinker: 1.5, play_instrument: 1.3, relax: 0.5, sleep: 0.7 },
}

const HOBBY_WEIGHT_MODIFIERS: Readonly<
  Record<HobbyType, Partial<Record<string, number>>>
> = {
  music: { play_instrument: 3.0 },
  painting: { paint: 3.0 },
  tinkering: { tinker: 3.0 },
  reading: { read: 3.0 },
}

const CRITICAL_NEED_RESOLUTION: Readonly<
  Record<string, { room: RoomId; activity: ActivityType; durationHours: number }>
> = {
  hunger: { room: 'kitchen', activity: 'eat', durationHours: 0.5 },
  sleep: { room: 'bedroom', activity: 'sleep', durationHours: 2 },
  hygiene: { room: 'bathroom', activity: 'bathe', durationHours: 0.5 },
  entertainment: { room: 'living_room', activity: 'watch_tv', durationHours: 1 },
}

// ---------------------------------------------------------------------------
// Simplified activity selection (server-safe mirror of selectNextActivity)
// ---------------------------------------------------------------------------

function selectActivity(
  clock: { hour: number; day: number },
  needs: Needs,
  personality: PersonalityBias,
  hobbyType: HobbyType,
  currentRoom: string,
  characterName: string,
  roomData?: LayoutRoomData,
): { room: string; activity: string; durationHours: number } {
  const activities = roomData?.activities ?? ROOM_ACTIVITIES
  // 1. Critical needs override
  const criticals = getCriticalNeeds(needs)
  if (criticals.length > 0) {
    const urgent = getMostUrgentNeed(needs)
    if (needs[urgent] >= CRITICAL_NEED_THRESHOLD) {
      return CRITICAL_NEED_RESOLUTION[urgent]
    }
  }

  // 2. Find schedule slot
  const normalizedHour = ((clock.hour % 24) + 24) % 24
  const slot = BASE_SCHEDULE.find(
    (s) => normalizedHour >= s.startHour && normalizedHour < s.endHour,
  )

  if (!slot || slot.candidates.length === 0) {
    return { room: 'bedroom', activity: 'sleep', durationHours: 1 }
  }

  // 3. Filter to viable candidates (activity exists in room)
  const viable = slot.candidates.filter((c) => {
    const roomActivities = activities[c.room]
    return roomActivities && roomActivities.includes(c.activity)
  })

  const rng = seededRngFromKey(
    `${characterName}:${clock.day}:${Math.floor(normalizedHour)}`,
  )

  if (viable.length === 0) {
    const cozyRooms = ['living_room', 'kitchen', 'bedroom', 'study', 'hobby_room', 'bathroom']
    const idleRoom = rng.pick(cozyRooms)
    return { room: idleRoom, activity: 'idle', durationHours: 0.25 }
  }

  // 4. Weighted random selection with personality + hobby modifiers
  const pMods = PERSONALITY_WEIGHT_MODIFIERS[personality]
  const hMods = HOBBY_WEIGHT_MODIFIERS[hobbyType]

  const weights = viable.map((c) => {
    let w = c.weight
    const pm = pMods[c.activity]
    if (pm !== undefined) w *= pm
    const hm = hMods[c.activity]
    if (hm !== undefined) w *= hm
    if (c.room === currentRoom) w *= 1.2
    return Math.max(0.1, w)
  })

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  let pick = rng.next() * totalWeight
  for (let i = 0; i < viable.length; i++) {
    pick -= weights[i]
    if (pick <= 0) {
      return { room: viable[i].room, activity: viable[i].activity, durationHours: viable[i].durationHours }
    }
  }

  const last = viable[viable.length - 1]
  return { room: last.room, activity: last.activity, durationHours: last.durationHours }
}

// ---------------------------------------------------------------------------
// Clock helpers
// ---------------------------------------------------------------------------

function advanceClock(
  clock: { hour: number; day: number },
  deltaHours: number,
): { hour: number; day: number } {
  let newHour = clock.hour + deltaHours
  let newDay = clock.day
  if (newHour >= 24) {
    newDay += Math.floor(newHour / 24)
    newHour = newHour % 24
  }
  return { hour: newHour, day: newDay }
}

// ---------------------------------------------------------------------------
// Main simulation function
// ---------------------------------------------------------------------------

/** Maximum game hours to simulate (7 game days) */
const MAX_SIMULATION_HOURS = 7 * 24

/** Minimum real seconds before simulation triggers */
export const SIMULATION_THRESHOLD_SECONDS = 60

/**
 * Fast-forwards a character's state by the given number of real seconds.
 * Steps through the schedule in 0.5 game-hour increments, advancing needs
 * and picking new activities at each step. Returns a new CharacterState
 * with updated room, activity, needs, clock, and position.
 *
 * Deterministic: same inputs always produce the same output.
 */
export function simulateOffline(
  state: CharacterState,
  elapsedRealSeconds: number,
  customLayout?: HouseLayout,
): CharacterState {
  if (elapsedRealSeconds <= 0) return state

  const gameHoursElapsed = realSecondsToGameHours(elapsedRealSeconds)
  const hoursToSimulate = Math.min(gameHoursElapsed, MAX_SIMULATION_HOURS)

  // Compute layout-aware room data for this character
  const layout = customLayout ?? generateLayout(state.name)
  const roomData = buildLayoutRoomData(layout)

  const appearance = seedFromName(state.name)
  let clock = { ...state.clock }
  let needs: Needs = { ...state.needs }
  let currentRoom: string = state.currentRoom
  let currentActivity: ActivityType = state.currentActivity
  let pesos = state.pesos ?? 0

  const STEP_SIZE = 0.5 // game hours per simulation step
  let remaining = hoursToSimulate

  while (remaining > 0) {
    const step = Math.min(STEP_SIZE, remaining)

    // Advance clock
    clock = advanceClock(clock, step)

    // Apply current activity effects on needs
    const prevNeeds: Needs = { ...needs }
    needs = applyActivityEffect(needs, currentActivity, step)

    // Award 1 peso for each need that just recovered to zero
    for (const key of ['hunger', 'sleep', 'hygiene', 'entertainment'] as const) {
      if (prevNeeds[key] > 0 && needs[key] === 0) {
        pesos += 1
      }
    }

    // Pick the next activity for this time slot
    const next = selectActivity(
      clock,
      needs,
      appearance.personalityBias,
      appearance.hobbyType,
      currentRoom,
      state.name,
      roomData,
    )
    currentRoom = next.room
    currentActivity = next.activity as ActivityType

    remaining -= step
  }

  // Resolve final position from layout-aware room center
  const centers = roomData.centers
  const center = centers[currentRoom] ?? centers.living_room
  const position = { x: center.x, y: center.y, z: center.z }

  // Decay plant health over elapsed time (same rate as online: 1/96 per game hour)
  const PLANT_DECAY_RATE = 1.0 / 96
  const prevPlantHealth = state.plantHealth ?? 1.0
  const newPlantHealth = Math.max(0, prevPlantHealth - PLANT_DECAY_RATE * hoursToSimulate)

  return {
    ...state,
    currentRoom: currentRoom as typeof state.currentRoom,
    currentActivity: currentActivity as typeof state.currentActivity,
    needs,
    clock,
    position,
    plantHealth: newPlantHealth,
    pesos,
  }
}
