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
  /** Left edge x-coordinate of the staircase column per floor */
  staircaseX: Record<1 | 2 | 3, number>
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

/** All room IDs in canonical order (for shuffling / validation) */
export const ALL_ROOMS: readonly LayoutRoomId[] = [
  'entrance',
  'living_room',
  'kitchen',
  'bedroom',
  'bathroom',
  'study',
  'hobby_room',
  'storage',
]

/** Default staircase x position (left edge) per floor */
export const DEFAULT_STAIRCASE_X: Record<1 | 2 | 3, number> = { 1: 27, 2: 27, 3: 27 }

// ---------------------------------------------------------------------------
// Layout generation
// ---------------------------------------------------------------------------

/**
 * Builds a HouseLayout from a specific room ordering (8 rooms: 3+3+2 floor
 * distribution). The first 3 go to floor 1, next 3 to floor 2, last 2 to
 * floor 3. Room widths are computed proportionally from preferred sizes,
 * scaled to fit the available width on each floor (staircaseX[floor] - 1).
 */
export function layoutFromOrder(
  rooms: LayoutRoomId[],
  staircaseX: Record<1 | 2 | 3, number> = DEFAULT_STAIRCASE_X,
): HouseLayout {
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
    const floorStairX = staircaseX[floor]
    const floorRoomWidth = floorStairX - 1  // available room width for this floor

    // Calculate proportional widths
    const totalPreferred = floorRooms.reduce(
      (sum, r) => sum + ROOM_SIZES[r].preferred,
      0,
    )
    const scale = floorRoomWidth / totalPreferred

    let currentX = 1 // room space starts at x=1 (after left exterior wall)

    for (let i = 0; i < floorRooms.length; i++) {
      const roomId = floorRooms[i]
      let width: number

      if (i === floorRooms.length - 1) {
        // Last room gets remainder to ensure exact fit
        width = floorStairX - currentX
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
        const maxWidth = floorStairX - currentX - remainingMinWidth
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

  return { slots, walls, slotMap, staircaseX }
}

/**
 * Returns the valid [min, max] range for staircaseX on a given floor.
 * min = sum of all rooms' minimum widths + 1 (leftmost start)
 * max = 27 (HOUSE_WIDTH - staircase_width: leaves 5 voxels for the staircase)
 */
export function getStaircaseXBounds(
  floor: 1 | 2 | 3,
  layout: HouseLayout,
): { min: number; max: number } {
  const minStairX = layout.slots
    .filter((s) => s.floor === floor)
    .reduce((sum, s) => sum + ROOM_SIZES[s.roomId].min, 1)
  return { min: minStairX, max: 27 }
}

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

  // Pin entrance to leftmost slot on its floor (floor 1: idx 0, floor 2: idx 3, floor 3: idx 6)
  // The camera renders with x-axis inverted, so the leftmost slot (x=1) appears on the right of screen.
  const entranceIdx = rooms.indexOf('entrance')
  const floorFirstIdx = entranceIdx <= 2 ? 0 : entranceIdx <= 5 ? 3 : 6
  if (entranceIdx !== floorFirstIdx) {
    ;[rooms[entranceIdx], rooms[floorFirstIdx]] = [rooms[floorFirstIdx], rooms[entranceIdx]]
  }

  return layoutFromOrder(rooms, DEFAULT_STAIRCASE_X)
}

/**
 * Extracts the room ordering from an existing layout as a flat array:
 * [floor1_left, floor1_mid, floor1_right, floor2_left, ... floor3_right].
 */
export function roomOrderFromLayout(layout: HouseLayout): LayoutRoomId[] {
  const byFloor: Record<number, RoomSlot[]> = { 1: [], 2: [], 3: [] }
  for (const slot of layout.slots) {
    byFloor[slot.floor].push(slot)
  }
  const order: LayoutRoomId[] = []
  for (const floor of [1, 2, 3]) {
    const sorted = byFloor[floor].sort((a, b) => a.xMin - b.xMin)
    for (const slot of sorted) {
      order.push(slot.roomId)
    }
  }
  return order
}

/**
 * Returns the default layout with entrance as the leftmost room on floor 1
 * (leftmost slot = rightmost on screen due to camera x-axis inversion).
 */
export function getDefaultLayout(): HouseLayout {
  // Floor 1: entrance(leftmost) | living_room | kitchen
  return layoutFromOrder(
    ['entrance', 'living_room', 'kitchen', 'bedroom', 'bathroom', 'study', 'hobby_room', 'storage'],
    DEFAULT_STAIRCASE_X,
  )
}
