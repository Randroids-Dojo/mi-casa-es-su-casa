// ---------------------------------------------------------------------------
// Room definitions — positions, activities available in each room
// ---------------------------------------------------------------------------
//
// House coordinate system:
//   Width:  32 voxels (x: 0–32)
//   Depth:   8 voxels (z: 0–8)
//   Floors: 3, each FLOOR_HEIGHT voxels tall
//   Floor Y origins: floor1=0, floor2=FLOOR_HEIGHT, floor3=FLOOR_HEIGHT*2
//
// Staircase connects all floors on the right side (x ≈ 27–32).
// Room positions vary per character — see src/lib/layout.ts.

import * as THREE from 'three'
import { FLOOR_HEIGHT } from './house'
import type { HouseLayout, LayoutRoomId } from '@/lib/layout'

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

export type ActivityType =
  | 'relax'
  | 'watch_tv'
  | 'read'
  | 'cook'
  | 'eat'
  | 'sleep'
  | 'dress'
  | 'work'
  | 'type'
  | 'bathe'
  | 'groom'
  | 'paint'
  | 'play_instrument'
  | 'tinker'
  | 'rummage'
  | 'use_bathroom'
  | 'idle'

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

export type RoomId =
  | 'living_room'
  | 'kitchen'
  | 'entrance'
  | 'bedroom'
  | 'study'
  | 'bathroom'
  | 'hobby_room'
  | 'storage'
  | 'staircase'
  | 'landing'

export interface Room {
  id: RoomId
  floor: 1 | 2 | 3
  /** World-space center position of the room */
  center: THREE.Vector3
  /** Activities available in this room */
  activities: ActivityType[]
  /** Rooms directly reachable from this room (same floor or via staircase) */
  adjacentRooms: RoomId[]
}

// ---------------------------------------------------------------------------
// House constants (imported from house.ts)
// ---------------------------------------------------------------------------

/** Returns the Y world coordinate of the floor surface (top of slab) for a floor. */
function floorCenterY(floor: 1 | 2 | 3): number {
  return (floor - 1) * FLOOR_HEIGHT + 1
}

// ---------------------------------------------------------------------------
// Static activity map — activities are intrinsic to room type, not position
// ---------------------------------------------------------------------------

export const ACTIVITY_MAP: Readonly<Record<LayoutRoomId, readonly ActivityType[]>> = {
  entrance: ['idle'],
  living_room: ['relax', 'watch_tv', 'read', 'idle'],
  kitchen: ['cook', 'eat', 'idle'],
  bedroom: ['sleep', 'dress', 'idle'],
  study: ['work', 'type', 'read', 'idle'],
  bathroom: ['bathe', 'groom', 'use_bathroom', 'idle'],
  hobby_room: ['paint', 'play_instrument', 'tinker', 'read', 'idle'],
  storage: ['rummage', 'idle'],
  landing: ['read', 'idle'],
}

// ---------------------------------------------------------------------------
// Default room definitions (original fixed layout)
// ---------------------------------------------------------------------------

export const ROOMS: readonly Room[] = [
  {
    id: 'entrance',
    floor: 1,
    center: new THREE.Vector3(2.5, floorCenterY(1), 4),
    activities: ['idle'],
    adjacentRooms: ['living_room', 'staircase'],
  },
  {
    id: 'living_room',
    floor: 1,
    center: new THREE.Vector3(10, floorCenterY(1), 4),
    activities: ['relax', 'watch_tv', 'read', 'idle'],
    adjacentRooms: ['entrance', 'kitchen', 'staircase'],
  },
  {
    id: 'kitchen',
    floor: 1,
    center: new THREE.Vector3(21.5, floorCenterY(1), 4),
    activities: ['cook', 'eat', 'idle'],
    adjacentRooms: ['living_room', 'staircase'],
  },
  {
    id: 'bedroom',
    floor: 2,
    center: new THREE.Vector3(7.5, floorCenterY(2), 4),
    activities: ['sleep', 'dress', 'idle'],
    adjacentRooms: ['study', 'staircase'],
  },
  {
    id: 'study',
    floor: 2,
    center: new THREE.Vector3(23.5, floorCenterY(2), 4),
    activities: ['work', 'type', 'read', 'idle'],
    adjacentRooms: ['bedroom', 'bathroom', 'staircase'],
  },
  {
    id: 'bathroom',
    floor: 2,
    center: new THREE.Vector3(17, floorCenterY(2), 4),
    activities: ['bathe', 'groom', 'use_bathroom', 'idle'],
    adjacentRooms: ['bedroom', 'study', 'staircase'],
  },
  {
    id: 'hobby_room',
    floor: 3,
    center: new THREE.Vector3(8.5, floorCenterY(3), 4),
    activities: ['paint', 'play_instrument', 'tinker', 'read', 'idle'],
    adjacentRooms: ['storage', 'staircase'],
  },
  {
    id: 'storage',
    floor: 3,
    center: new THREE.Vector3(21.5, floorCenterY(3), 4),
    activities: ['rummage', 'idle'],
    adjacentRooms: ['hobby_room', 'staircase'],
  },
  {
    id: 'staircase',
    floor: 1,
    center: new THREE.Vector3(29.5, floorCenterY(1), 4),
    activities: ['idle'],
    adjacentRooms: [
      'entrance',
      'living_room',
      'kitchen',
      'bedroom',
      'study',
      'bathroom',
      'hobby_room',
      'storage',
    ],
  },
]

/** Map from RoomId to Room for O(1) lookup */
export const ROOM_MAP: Readonly<Record<RoomId, Room>> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Readonly<Record<RoomId, Room>>

// ---------------------------------------------------------------------------
// Build rooms from a layout
// ---------------------------------------------------------------------------

/**
 * Builds Room definitions from a HouseLayout. The rooms have layout-specific
 * centers and adjacency, with the same activity lists as the default layout.
 */
export function buildRooms(layout: HouseLayout): {
  rooms: Room[]
  roomMap: Record<RoomId, Room>
} {
  // Group slots by floor and sort by xMin for adjacency
  const floorSlots: Record<number, typeof layout.slots> = { 1: [], 2: [], 3: [] }
  for (const slot of layout.slots) {
    floorSlots[slot.floor].push(slot)
  }
  for (const floor of [1, 2, 3]) {
    floorSlots[floor].sort((a, b) => a.xMin - b.xMin)
  }

  const rooms: Room[] = []

  for (const floor of [1, 2, 3] as const) {
    const slots = floorSlots[floor]
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const roomId = slot.roomId as RoomId
      const neighbors: RoomId[] = []

      // Left neighbor
      if (i > 0) neighbors.push(slots[i - 1].roomId as RoomId)
      // Right neighbor
      if (i < slots.length - 1) neighbors.push(slots[i + 1].roomId as RoomId)
      // Always connected to staircase
      neighbors.push('staircase')

      rooms.push({
        id: roomId,
        floor,
        center: new THREE.Vector3(slot.centerX, floorCenterY(floor), 4),
        activities: [...ACTIVITY_MAP[slot.roomId]],
        adjacentRooms: neighbors,
      })
    }
  }

  // Add staircase — center uses floor 1's staircaseX
  rooms.push({
    id: 'staircase',
    floor: 1,
    center: new THREE.Vector3(layout.staircaseX[1] + 2.5, floorCenterY(1), 4),
    activities: ['idle'],
    adjacentRooms: layout.slots.map((s) => s.roomId as RoomId),
  })

  const roomMap = Object.fromEntries(
    rooms.map((r) => [r.id, r]),
  ) as Record<RoomId, Room>

  return { rooms, roomMap }
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Returns the Room definition for a given RoomId */
export function getRoom(id: RoomId): Room {
  return ROOM_MAP[id]
}

/** Returns the floor number for a given room */
export function getRoomFloor(id: RoomId): 1 | 2 | 3 {
  return ROOM_MAP[id].floor
}

/** Returns all activities available in a given room */
export function getRoomActivities(id: RoomId): ActivityType[] {
  return [...ROOM_MAP[id].activities]
}

/**
 * Returns the world-space Y center for a given floor.
 * Useful for staircase position calculations.
 */
export function getFloorCenterY(floor: 1 | 2 | 3): number {
  return floorCenterY(floor)
}
