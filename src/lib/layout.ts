// ---------------------------------------------------------------------------
// House layout generation — deterministic, seeded by character name
// ---------------------------------------------------------------------------
//
// Generates a randomized room layout for a character's casa. The layout is
// fully deterministic: the same name always produces the same layout. All
// 8 rooms are shuffled freely across 3 floors (3+3+2 slots), with wall
// positions computed proportionally based on room preferred widths.
//
// Server-safe — no Three.js dependency.

import { seededRngFromKey } from '@/game/character/seeder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LayoutRoomId =
  | 'living_room'
  | 'kitchen'
  | 'entrance'
  | 'bedroom'
  | 'study'
  | 'bathroom'
  | 'hobby_room'
  | 'storage'

export interface RoomSlot {
  roomId: LayoutRoomId
  floor: 1 | 2 | 3
  /** Left edge x-coordinate (inclusive) */
  xMin: number
  /** Right edge x-coordinate (exclusive) */
  xMax: number
  /** Center x-coordinate */
  centerX: number
}

export interface WallPosition {
  floor: 1 | 2 | 3
  /** x-coordinate of the wall center */
  x: number
}

export interface HouseLayout {
  slots: RoomSlot[]
  walls: WallPosition[]
  /** O(1) lookup by roomId */
  slotMap: Readonly<Record<LayoutRoomId, RoomSlot>>
}

// ---------------------------------------------------------------------------
// Room size preferences
// ---------------------------------------------------------------------------

interface RoomSizePrefs {
  min: number
  preferred: number
}

const ROOM_SIZES: Readonly<Record<LayoutRoomId, RoomSizePrefs>> = {
  entrance: { min: 3, preferred: 4 },
  living_room: { min: 6, preferred: 12 },
  kitchen: { min: 6, preferred: 11 },
  bedroom: { min: 6, preferred: 13 },
  bathroom: { min: 5, preferred: 6 },
  study: { min: 5, preferred: 7 },
  hobby_room: { min: 6, preferred: 15 },
  storage: { min: 5, preferred: 11 },
}

/** All room IDs in canonical order (for shuffling) */
const ALL_ROOMS: readonly LayoutRoomId[] = [
  'entrance',
  'living_room',
  'kitchen',
  'bedroom',
  'bathroom',
  'study',
  'hobby_room',
  'storage',
]

/** Total room space per floor (x=1 to x=27, excluding exterior walls and staircase) */
const FLOOR_ROOM_WIDTH = 26

// ---------------------------------------------------------------------------
// Layout generation
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic house layout from a character name.
 * The same name always produces the same layout.
 */
export function generateLayout(characterName: string): HouseLayout {
  const rng = seededRngFromKey(`layout:${characterName.toLowerCase()}`)

  // Fisher-Yates shuffle all 8 rooms
  const rooms = [...ALL_ROOMS]
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[rooms[i], rooms[j]] = [rooms[j], rooms[i]]
  }

  // Assign to floors: first 3 → floor 1, next 3 → floor 2, last 2 → floor 3
  const floorAssignments: LayoutRoomId[][] = [
    rooms.slice(0, 3),
    rooms.slice(3, 6),
    rooms.slice(6, 8),
  ]

  const slots: RoomSlot[] = []
  const walls: WallPosition[] = []

  for (let f = 0; f < 3; f++) {
    const floor = (f + 1) as 1 | 2 | 3
    const floorRooms = floorAssignments[f]

    // Calculate proportional widths
    const totalPreferred = floorRooms.reduce(
      (sum, r) => sum + ROOM_SIZES[r].preferred,
      0,
    )
    const scale = FLOOR_ROOM_WIDTH / totalPreferred

    let currentX = 1 // room space starts at x=1 (after left exterior wall)

    for (let i = 0; i < floorRooms.length; i++) {
      const roomId = floorRooms[i]
      let width: number

      if (i === floorRooms.length - 1) {
        // Last room gets remainder to ensure exact fit
        width = 27 - currentX
      } else {
        // Proportional width, respecting minimum
        width = Math.max(
          ROOM_SIZES[roomId].min,
          Math.round(ROOM_SIZES[roomId].preferred * scale),
        )
        // Ensure remaining rooms can still fit their minimums
        const remainingRooms = floorRooms.slice(i + 1)
        const remainingMinWidth = remainingRooms.reduce(
          (sum, r) => sum + ROOM_SIZES[r].min,
          0,
        )
        const maxWidth = 27 - currentX - remainingMinWidth
        width = Math.min(width, maxWidth)
      }

      const xMin = currentX
      const xMax = currentX + width

      slots.push({
        roomId,
        floor,
        xMin,
        xMax,
        centerX: (xMin + xMax) / 2,
      })

      // Add interior wall between rooms (not after the last room on a floor)
      if (i < floorRooms.length - 1) {
        walls.push({ floor, x: xMax })
      }

      currentX = xMax
    }
  }

  const slotMap = Object.fromEntries(
    slots.map((s) => [s.roomId, s]),
  ) as Record<LayoutRoomId, RoomSlot>

  return { slots, walls, slotMap }
}

/**
 * Returns the default layout that matches the original hardcoded room positions.
 * Useful for backward compatibility and tests.
 */
export function getDefaultLayout(): HouseLayout {
  const slots: RoomSlot[] = [
    { roomId: 'entrance', floor: 1, xMin: 1, xMax: 4, centerX: 2.5 },
    { roomId: 'living_room', floor: 1, xMin: 4, xMax: 16, centerX: 10 },
    { roomId: 'kitchen', floor: 1, xMin: 16, xMax: 27, centerX: 21.5 },
    { roomId: 'bedroom', floor: 2, xMin: 1, xMax: 14, centerX: 7.5 },
    { roomId: 'bathroom', floor: 2, xMin: 14, xMax: 20, centerX: 17 },
    { roomId: 'study', floor: 2, xMin: 20, xMax: 27, centerX: 23.5 },
    { roomId: 'hobby_room', floor: 3, xMin: 1, xMax: 16, centerX: 8.5 },
    { roomId: 'storage', floor: 3, xMin: 16, xMax: 27, centerX: 21.5 },
  ]

  const walls: WallPosition[] = [
    { floor: 1, x: 4 },
    { floor: 1, x: 16 },
    { floor: 2, x: 14 },
    { floor: 2, x: 20 },
    { floor: 3, x: 16 },
  ]

  const slotMap = Object.fromEntries(
    slots.map((s) => [s.roomId, s]),
  ) as Record<LayoutRoomId, RoomSlot>

  return { slots, walls, slotMap }
}
