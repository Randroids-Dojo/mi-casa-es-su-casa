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
import { seededRngFromKey } from './seeder'

// ---------------------------------------------------------------------------
// BFS pathfinding
// ---------------------------------------------------------------------------

/**
 * Finds a path from `from` to `to`.
 *
 * When a seed string is provided the path is randomized:
 *   - 70%: shuffled BFS (picks among equally-short paths at random)
 *   - 30%: scenic detour — visits a random neighbor of `from` first,
 *     then BFS from there (adds one extra room hop for variety)
 *
 * Without a seed, returns the deterministic shortest path (original BFS).
 */
export function findPath(from: RoomId, to: RoomId, seed?: string): RoomId[] {
  if (from === to) return [from]

  if (!seed) {
    return _bfsPath(from, to)
  }

  const rng = seededRngFromKey(seed)

  // Scenic detour (30% chance): visit a random neighbor first
  const fromRoom = ROOM_MAP[from]
  const eligibleDetours = fromRoom.adjacentRooms.filter(
    (r) => r !== to && r !== from,
  )

  if (rng.next() < 0.3 && eligibleDetours.length > 0) {
    const detourRoom = rng.pick(eligibleDetours)
    const restPath = _bfsShuffled(detourRoom, to, rng)
    return [from, ...restPath]
  }

  // Shuffled BFS (70% chance)
  return _bfsShuffled(from, to, rng)
}

/** Standard deterministic BFS (original implementation). */
function _bfsPath(from: RoomId, to: RoomId): RoomId[] {
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

  return [from, to]
}

/** BFS with Fisher-Yates shuffled neighbor exploration order. */
function _bfsShuffled(
  from: RoomId,
  to: RoomId,
  rng: { next(): number; pick<T>(arr: readonly T[]): T },
): RoomId[] {
  if (from === to) return [from]

  const queue: RoomId[][] = [[from]]
  const visited = new Set<RoomId>([from])

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    const room = ROOM_MAP[current]

    // Shuffle neighbors so BFS explores equally-short paths in random order
    const neighbors = [...room.adjacentRooms]
    for (let i = neighbors.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1))
      ;[neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]]
    }

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue
      const newPath = [...path, neighbor]
      if (neighbor === to) return newPath
      visited.add(neighbor)
      queue.push(newPath)
    }
  }

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

// ---------------------------------------------------------------------------
// Staircase geometry constants (must match buildStaircase in house.ts)
// ---------------------------------------------------------------------------

/** World-space X center of the staircase column */
const STAIR_X = ROOM_MAP['staircase'].center.x  // 29.5

/**
 * Z coordinate of the bottom step (front of house, closest to camera).
 * The camera looks in the +Z direction so low-Z = close to viewer.
 */
const STAIR_Z_BOTTOM = 1

/**
 * Z coordinate near the top step (toward back wall).
 * Using 7 rather than 8 keeps the character clear of the back wall geometry.
 */
const STAIR_Z_TOP = 7

// ---------------------------------------------------------------------------

/**
 * Returns the world-space position of a character partway along a full path,
 * given their current leg index and progress within that leg.
 *
 * Staircase legs use a two-phase movement:
 *   - Room → Staircase: walk horizontally to the stair entry at the
 *     current floor level and the correct front/back Z for the climb direction.
 *   - Staircase → Room: Phase 1 climbs at x=STAIR_X so the Y change happens
 *     entirely inside the staircase column (no floor clipping). Phase 2 walks
 *     horizontally at the destination floor Y to the room center.
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

  // ---- Leg toward the staircase ----
  if (toRoomId === 'staircase') {
    // Determine ascent/descent by looking at the room after the staircase.
    const nextRoomId = toIdx < path.length - 1 ? path[toIdx + 1] : null
    const fromFloor = ROOM_MAP[fromRoomId].floor
    const nextFloor = nextRoomId ? ROOM_MAP[nextRoomId].floor : fromFloor
    const ascending = nextFloor > fromFloor

    // Walk horizontally at floor level to the correct stair entry Z.
    const fromCenter = ROOM_MAP[fromRoomId].center
    const entryZ = ascending ? STAIR_Z_BOTTOM : STAIR_Z_TOP
    const entryY = fromCenter.y
    const staircaseEntry = new THREE.Vector3(STAIR_X, entryY, entryZ)
    return new THREE.Vector3().lerpVectors(fromCenter, staircaseEntry, legProgress)
  }

  // ---- Leg away from the staircase ----
  if (fromRoomId === 'staircase') {
    // Determine ascent/descent from the room that preceded the staircase.
    const prevRoomId = fromIdx > 0 ? path[fromIdx - 1] : null
    const prevFloor = prevRoomId ? ROOM_MAP[prevRoomId].floor : ROOM_MAP[toRoomId].floor
    const toFloor = ROOM_MAP[toRoomId].floor
    const ascending = toFloor > prevFloor
    const numFlights = Math.abs(toFloor - prevFloor)

    const destCenter = ROOM_MAP[toRoomId].center

    // Phase 2 (0.5 → 1): walk horizontally from the stair exit to the room center.
    if (legProgress > 0.5) {
      const t = (legProgress - 0.5) / 0.5
      const exitY = destCenter.y
      const exitZ = ascending ? STAIR_Z_TOP : STAIR_Z_BOTTOM
      return new THREE.Vector3(
        THREE.MathUtils.lerp(STAIR_X, destCenter.x, t),
        THREE.MathUtils.lerp(exitY, destCenter.y, t),
        THREE.MathUtils.lerp(exitZ, destCenter.z, t),
      )
    }

    // Phase 1 (0 → 0.5): traverse each flight of stairs in sequence.
    // Progress [0, 0.5] maps to [0, numFlights] in flight-space so multi-floor
    // paths route through each intermediate landing rather than cutting through
    // the next flight's geometry.
    const climbProgress = (legProgress / 0.5) * numFlights
    const flightIdx = Math.min(Math.floor(climbProgress), numFlights - 1)
    const flightT = climbProgress - flightIdx  // [0, 1] within this flight

    if (ascending) {
      const flightFromFloor = (prevFloor + flightIdx) as 1 | 2 | 3
      const flightToFloor = (prevFloor + flightIdx + 1) as 1 | 2 | 3
      return new THREE.Vector3(
        STAIR_X,
        THREE.MathUtils.lerp(
          getFloorCenterY(flightFromFloor),
          getFloorCenterY(flightToFloor),          // top landing of this flight
          flightT,
        ),
        THREE.MathUtils.lerp(STAIR_Z_BOTTOM, STAIR_Z_TOP, flightT),
      )
    } else {
      const flightFromFloor = (prevFloor - flightIdx) as 1 | 2 | 3
      const flightToFloor = (prevFloor - flightIdx - 1) as 1 | 2 | 3
      return new THREE.Vector3(
        STAIR_X,
        THREE.MathUtils.lerp(
          getFloorCenterY(flightFromFloor),        // top landing of this flight
          getFloorCenterY(flightToFloor),
          flightT,
        ),
        THREE.MathUtils.lerp(STAIR_Z_TOP, STAIR_Z_BOTTOM, flightT),
      )
    }
  }

  // ---- Normal leg between two non-staircase rooms ----
  return getPositionAlongLeg(fromRoomId, toRoomId, legProgress)
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
