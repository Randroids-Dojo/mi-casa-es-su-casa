// ---------------------------------------------------------------------------
// Pathfinder — simple room-to-room pathfinding
// ---------------------------------------------------------------------------
//
// Rooms on the same floor connect directly to each other if they are adjacent.
// Moving between floors requires passing through the staircase.
//
// The adjacency graph is derived from the ROOMS definitions in rooms.ts.
// We use a simple BFS since the graph is very small (≤ 9 nodes).

import * as THREE from 'three'
import type { RoomId } from '../rooms'
import { ROOM_MAP, ROOMS, getFloorCenterY } from '../rooms'

// ---------------------------------------------------------------------------
// BFS pathfinding
// ---------------------------------------------------------------------------

/**
 * Finds the shortest path from `from` to `to` by room count.
 * Returns an array of RoomIds including both start and end.
 * If no path exists (shouldn't happen in a connected house), returns [from, to].
 */
export function findPath(from: RoomId, to: RoomId): RoomId[] {
  if (from === to) return [from]

  // BFS
  const queue: RoomId[][] = [[from]]
  const visited = new Set<RoomId>([from])

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    const room = ROOM_MAP[current]

    for (const neighbor of room.adjacentRooms) {
      if (visited.has(neighbor)) continue
      const newPath = [...path, neighbor]
      if (neighbor === to) return newPath
      visited.add(neighbor)
      queue.push(newPath)
    }
  }

  // Fallback: direct route (should never happen with valid adjacency graph)
  return [from, to]
}

/**
 * Returns true if the path between two rooms requires traversing the staircase.
 * (i.e., the rooms are on different floors)
 */
export function requiresStaircase(from: RoomId, to: RoomId): boolean {
  if (from === to) return false
  const path = findPath(from, to)
  return path.includes('staircase')
}

// ---------------------------------------------------------------------------
// 3D position interpolation along a path
// ---------------------------------------------------------------------------

/**
 * Returns the world-space position of a character that is `progress` of
 * the way from `fromRoom` to `toRoom`.
 *
 * `progress` is in [0, 1]:
 *   0 = at the center of fromRoom
 *   1 = at the center of toRoom
 *
 * The interpolation is a simple linear lerp between room centers.
 * For staircase traversal, the character arcs through the staircase center.
 */
export function getPositionAlongLeg(
  fromRoom: RoomId,
  toRoom: RoomId,
  progress: number,
): THREE.Vector3 {
  const from = ROOM_MAP[fromRoom].center
  const to = ROOM_MAP[toRoom].center

  return new THREE.Vector3().lerpVectors(from, to, progress)
}

/**
 * Returns the world-space position of a character partway along a full path,
 * given their current leg index and progress within that leg.
 */
export function getPositionAlongPath(
  path: RoomId[],
  legIndex: number,
  legProgress: number,
): THREE.Vector3 {
  if (path.length === 0) {
    return new THREE.Vector3(0, 0, 0)
  }

  // Clamp to valid indices
  const fromIdx = Math.max(0, Math.min(legIndex - 1, path.length - 1))
  const toIdx = Math.max(0, Math.min(legIndex, path.length - 1))

  if (fromIdx === toIdx) {
    return ROOM_MAP[path[fromIdx]].center.clone()
  }

  const fromRoomId = path[fromIdx]
  const toRoomId = path[toIdx]

  // When a leg involves the staircase as a waypoint, adjust its Y so the
  // character walks horizontally to/from the staircase at the correct floor
  // height, and Y transitions (climbing) happen naturally during staircase legs.
  let fromCenter = ROOM_MAP[fromRoomId].center.clone()
  let toCenter = ROOM_MAP[toRoomId].center.clone()

  if (fromRoomId === 'staircase') {
    // Moving away from staircase: start at the floor Y the character arrived from
    const prevRoomId = path[fromIdx - 1]
    if (prevRoomId) {
      fromCenter.y = ROOM_MAP[prevRoomId].center.y
    }
  } else if (toRoomId === 'staircase') {
    // Moving toward staircase: keep staircase at current floor Y so character
    // walks horizontally before climbing begins on the next leg
    toCenter.y = fromCenter.y
  }

  return new THREE.Vector3().lerpVectors(fromCenter, toCenter, legProgress)
}

/**
 * Returns the world-space position of the staircase entry/exit at a given floor.
 * Used during floor transitions to position the character correctly.
 */
export function getStaircasePosition(floor: 1 | 2 | 3): THREE.Vector3 {
  // Staircase corridor center: x≈29.5, z≈4 (right column, x=27–32)
  return new THREE.Vector3(29.5, getFloorCenterY(floor), 4)
}

/**
 * Returns the direction the character should face (as a Y-axis rotation angle)
 * when moving from one room to another.
 */
export function getFacingAngle(fromRoom: RoomId, toRoom: RoomId): number {
  const from = ROOM_MAP[fromRoom].center
  const to = ROOM_MAP[toRoom].center

  const dx = to.x - from.x
  const dz = to.z - from.z

  if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) {
    return 0 // same position, no turn needed
  }

  return Math.atan2(dx, dz)
}

// ---------------------------------------------------------------------------
// Graph validation helper (useful in tests)
// ---------------------------------------------------------------------------

/**
 * Verifies that the adjacency graph is symmetric — if room A lists room B
 * as adjacent, then B should also list A.
 * Returns an array of asymmetry descriptions (empty = valid graph).
 */
export function validateAdjacencyGraph(): string[] {
  const errors: string[] = []

  for (const room of ROOMS) {
    for (const neighbor of room.adjacentRooms) {
      const neighborRoom = ROOM_MAP[neighbor]
      if (!neighborRoom) {
        errors.push(`Room ${room.id} lists unknown neighbor: ${neighbor}`)
        continue
      }
      if (!neighborRoom.adjacentRooms.includes(room.id)) {
        errors.push(
          `Asymmetric edge: ${room.id} → ${neighbor}, but ${neighbor} does not list ${room.id}`,
        )
      }
    }
  }

  return errors
}
