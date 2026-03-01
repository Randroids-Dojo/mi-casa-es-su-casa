// ---------------------------------------------------------------------------
// House layout generation — deterministic, seeded by character name
// ---------------------------------------------------------------------------
//
// Generates a randomized room layout for a character's casa. The layout is
// fully deterministic: the same name always produces the same layout. All
// 9 rooms are shuffled freely across 3 floors (3+3+3 slots), with wall
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
  | 'landing'

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
  /** Left edge x-coordinate of the staircase column per floor (floors 1 & 2 only) */
  staircaseX: Record<1 | 2, number>
  /** 0-based position of staircase in the combined (rooms+staircase) sequence per floor (floors 1 & 2 only) */
  staircaseIndex: Record<1 | 2, number>
  /** Staircase bounds in world-x per floor (floors 1 & 2 only) */
  stairBounds: Record<1 | 2, { xMin: number; xMax: number; centerX: number }>
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
  landing: { min: 4, preferred: 5 },
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
  'landing',
]

/** Width (in voxels) reserved for the staircase column */
export const STAIRCASE_WIDTH = 5

/** Total room space per floor for floors 1 & 2 (x=1..27 in default position = 26 voxels) */
export const ROOM_SPACE = 26

/**
 * Room space for floor 3: no staircase column, so rooms use the full floor width.
 * ROOM_SPACE (26) + STAIRCASE_WIDTH (5) = 31 voxels.
 */
export const FLOOR3_ROOM_SPACE = ROOM_SPACE + STAIRCASE_WIDTH

/**
 * Default staircase index (0-based position in the combined rooms+staircase
 * sequence per floor, floors 1 & 2 only). The default places the staircase
 * at the last position (rightmost in world-x = leftmost on screen).
 * Floors 1 & 2 each have 3 rooms → index 3.
 */
export const DEFAULT_STAIRCASE_INDEX: Record<1 | 2, number> = { 1: 3, 2: 3 }

/** Default staircase left-edge x per floor (derived from DEFAULT_STAIRCASE_INDEX, floors 1 & 2 only) */
export const DEFAULT_STAIRCASE_X: Record<1 | 2, number> = { 1: 27, 2: 27 }

// ---------------------------------------------------------------------------
// Layout generation
// ---------------------------------------------------------------------------

/**
 * Builds a HouseLayout from a specific room ordering (9 rooms: 3+3+3 floor
 * distribution). The first 3 go to floor 1, next 3 to floor 2, last 3 to
 * floor 3. Floors 1 & 2 have a staircase column; floor 3 does not (the
 * landing room serves as the staircase exit on floor 3).
 *
 * Room widths are computed proportionally from preferred sizes:
 * - Floors 1 & 2: rooms share ROOM_SPACE (26 voxels) with staircase using 5
 * - Floor 3: rooms share FLOOR3_ROOM_SPACE (31 voxels)
 *
 * `staircaseIndex` is a per-floor 0-based position for floors 1 & 2 only.
 */
export function layoutFromOrder(
  rooms: LayoutRoomId[],
  staircaseIndex: Record<1 | 2, number> = DEFAULT_STAIRCASE_INDEX,
  customWallPositions?: Partial<Record<1 | 2 | 3, number[]>>,
): HouseLayout {
  // Assign to floors: first 3 → floor 1, next 3 → floor 2, last 3 → floor 3
  const floorAssignments: LayoutRoomId[][] = [
    rooms.slice(0, 3),
    rooms.slice(3, 6),
    rooms.slice(6, 9),
  ]

  const slots: RoomSlot[] = []
  const walls: WallPosition[] = []
  const staircaseX: Record<1 | 2, number> = { 1: 0, 2: 0 }
  const stairBounds: Record<1 | 2, { xMin: number; xMax: number; centerX: number }> = {
    1: { xMin: 0, xMax: 0, centerX: 0 },
    2: { xMin: 0, xMax: 0, centerX: 0 },
  }

  for (let f = 0; f < 3; f++) {
    const floor = (f + 1) as 1 | 2 | 3
    const floorRooms = floorAssignments[f]
    const nRooms = floorRooms.length  // always 3
    const hasStaircase = floor !== 3
    const availableRoomSpace = floor === 3 ? FLOOR3_ROOM_SPACE : ROOM_SPACE
    const stairIdx = hasStaircase ? staircaseIndex[floor as 1 | 2] : -1

    // Custom walls only apply when staircase is at the last position (or floor 3)
    const useCustomWalls = !hasStaircase || stairIdx === nRooms
    const customFloorWalls = useCustomWalls ? customWallPositions?.[floor] : undefined

    // Compute proportional room widths (total must equal availableRoomSpace)
    let roomWidths: number[]

    if (customFloorWalls && customFloorWalls.length === nRooms - 1) {
      // Derive widths from explicit wall positions
      roomWidths = []
      let prevX = 1
      for (let i = 0; i < nRooms; i++) {
        const nextX = i < customFloorWalls.length ? customFloorWalls[i] : 1 + availableRoomSpace
        roomWidths.push(nextX - prevX)
        prevX = nextX
      }
    } else {
      // Proportional widths from preferred sizes
      const totalPreferred = floorRooms.reduce((sum, r) => sum + ROOM_SIZES[r].preferred, 0)
      const scale = availableRoomSpace / totalPreferred
      roomWidths = []
      let usedWidth = 0

      for (let i = 0; i < nRooms; i++) {
        let width: number
        if (i === nRooms - 1) {
          width = availableRoomSpace - usedWidth
        } else {
          width = Math.max(
            ROOM_SIZES[floorRooms[i]].min,
            Math.round(ROOM_SIZES[floorRooms[i]].preferred * scale),
          )
          const remainingRooms = floorRooms.slice(i + 1)
          const remainingMinWidth = remainingRooms.reduce((sum, r) => sum + ROOM_SIZES[r].min, 0)
          width = Math.min(width, availableRoomSpace - usedWidth - remainingMinWidth)
        }
        roomWidths.push(width)
        usedWidth += width
      }
    }

    // Build combined sequence:
    // - Floors 1 & 2: iterate positions 0..nRooms; at stairIdx place staircase, else room
    // - Floor 3: iterate positions 0..nRooms-1; all are rooms (no staircase)
    let currentX = 1
    let roomIdx = 0
    let prevWasRoom = false
    const loopMax = hasStaircase ? nRooms : nRooms - 1

    for (let pos = 0; pos <= loopMax; pos++) {
      if (hasStaircase && pos === stairIdx) {
        // Staircase slot (floors 1 & 2 only)
        const xMin = currentX
        const xMax = currentX + STAIRCASE_WIDTH
        staircaseX[floor as 1 | 2] = xMin
        stairBounds[floor as 1 | 2] = { xMin, xMax, centerX: (xMin + xMax) / 2 }
        currentX = xMax
        prevWasRoom = false
      } else {
        // Room slot
        const roomId = floorRooms[roomIdx]
        const width = roomWidths[roomIdx]
        const xMin = currentX
        const xMax = currentX + width

        // Room-to-room wall: only when both this and previous slot were rooms
        if (prevWasRoom) {
          walls.push({ floor, x: xMin })
        }

        slots.push({ roomId, floor, xMin, xMax, centerX: (xMin + xMax) / 2 })
        currentX = xMax
        prevWasRoom = true
        roomIdx++
      }
    }
  }

  const slotMap = Object.fromEntries(
    slots.map((s) => [s.roomId, s]),
  ) as Record<LayoutRoomId, RoomSlot>

  return { slots, walls, slotMap, staircaseX, staircaseIndex, stairBounds }
}

/**
 * Returns the valid [min, max] x-range for dragging the wall at wallIndex on a floor.
 * Ensures neither adjacent room shrinks below its minimum width.
 */
export function getWallBounds(
  floor: 1 | 2 | 3,
  wallIndex: number,
  layout: HouseLayout,
): { min: number; max: number } {
  const floorSlots = layout.slots
    .filter((s) => s.floor === floor)
    .sort((a, b) => a.xMin - b.xMin)
  const leftSlot = floorSlots[wallIndex]
  const rightSlot = floorSlots[wallIndex + 1]
  return {
    min: leftSlot.xMin + ROOM_SIZES[leftSlot.roomId].min,
    max: rightSlot.xMax - ROOM_SIZES[rightSlot.roomId].min,
  }
}

/**
 * Generates a deterministic house layout from a character name.
 * The same name always produces the same layout.
 */
export function generateLayout(characterName: string): HouseLayout {
  const rng = seededRngFromKey(`layout:${characterName.toLowerCase()}`)

  // Fisher-Yates shuffle all 9 rooms
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

  return layoutFromOrder(rooms, DEFAULT_STAIRCASE_INDEX)
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
 * and landing as the rightmost room on floor 3 (aligned with the staircase exit).
 */
export function getDefaultLayout(): HouseLayout {
  // Floor 1: entrance(leftmost) | living_room | kitchen
  // Floor 2: bedroom | bathroom | study
  // Floor 3: hobby_room | storage | landing (landing aligns with staircase exit)
  return layoutFromOrder(
    ['entrance', 'living_room', 'kitchen', 'bedroom', 'bathroom', 'study', 'hobby_room', 'storage', 'landing'],
    DEFAULT_STAIRCASE_INDEX,
  )
}
