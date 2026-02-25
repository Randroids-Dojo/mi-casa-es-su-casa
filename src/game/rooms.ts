// ---------------------------------------------------------------------------
// Room definitions — positions, activities available in each room
// ---------------------------------------------------------------------------
//
// House coordinate system:
//   Width:  16 voxels (x: 0–16)
//   Depth:   8 voxels (z: 0–8)
//   Floors: 3, each FLOOR_HEIGHT voxels tall
//   Floor Y origins: floor1=0, floor2=FLOOR_HEIGHT, floor3=FLOOR_HEIGHT*2
//
// Room centers are the midpoint of each room's bounds in world space.
// Staircase connects all floors on the right side (x ≈ 13–15).

import * as THREE from 'three'
import { FLOOR_HEIGHT } from './house'

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

/** Returns the Y world coordinate of the center of a floor's walkable area */
function floorCenterY(floor: 1 | 2 | 3): number {
  // Floor slab is at (floor-1)*FLOOR_HEIGHT + 1 (top of slab)
  // Character stands on top of the slab; center for nav is 1 voxel above slab
  return (floor - 1) * FLOOR_HEIGHT + 1.5
}

// ---------------------------------------------------------------------------
// Room definitions
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
    center: new THREE.Vector3(7, floorCenterY(1), 4),
    activities: ['relax', 'watch_tv', 'read', 'idle'],
    adjacentRooms: ['entrance', 'kitchen', 'staircase'],
  },
  {
    id: 'kitchen',
    floor: 1,
    center: new THREE.Vector3(11.5, floorCenterY(1), 4),
    activities: ['cook', 'eat', 'idle'],
    adjacentRooms: ['living_room', 'staircase'],
  },
  {
    id: 'bedroom',
    floor: 2,
    center: new THREE.Vector3(3.5, floorCenterY(2), 4),
    activities: ['sleep', 'dress', 'idle'],
    adjacentRooms: ['study', 'staircase'],
  },
  {
    id: 'study',
    floor: 2,
    center: new THREE.Vector3(8.5, floorCenterY(2), 4),
    activities: ['work', 'type', 'read', 'idle'],
    adjacentRooms: ['bedroom', 'bathroom', 'staircase'],
  },
  {
    id: 'bathroom',
    floor: 2,
    center: new THREE.Vector3(12, floorCenterY(2), 4),
    activities: ['bathe', 'groom', 'idle'],
    adjacentRooms: ['study', 'staircase'],
  },
  {
    id: 'hobby_room',
    floor: 3,
    center: new THREE.Vector3(5, floorCenterY(3), 4),
    activities: ['paint', 'play_instrument', 'tinker', 'read', 'idle'],
    adjacentRooms: ['storage', 'staircase'],
  },
  {
    id: 'storage',
    floor: 3,
    center: new THREE.Vector3(11.5, floorCenterY(3), 4),
    activities: ['rummage', 'idle'],
    adjacentRooms: ['hobby_room', 'staircase'],
  },
  {
    id: 'staircase',
    floor: 1, // spans all floors; floor 1 is just the base designation
    center: new THREE.Vector3(14, floorCenterY(1), 4),
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

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map from RoomId to Room for O(1) lookup */
export const ROOM_MAP: Readonly<Record<RoomId, Room>> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Readonly<Record<RoomId, Room>>

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
