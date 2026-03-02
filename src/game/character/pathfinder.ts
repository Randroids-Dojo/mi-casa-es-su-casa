// ---------------------------------------------------------------------------
// Pathfinder — simple room-to-room pathfinding
// ---------------------------------------------------------------------------
//
// Rooms on the same floor connect directly to each other if they are adjacent.
// Moving between floors requires passing through the staircase.
//
// The adjacency graph is derived from Room definitions (default or layout-
// specific). We use a simple BFS since the graph is very small (≤ 9 nodes).

import * as THREE from 'three'
import type { RoomId, Room } from '../rooms'
import { ROOM_MAP, ROOMS, getFloorCenterY } from '../rooms'
import { seededRngFromKey } from './seeder'
import type { StairXPerFloor } from '@/lib/layout'

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
 *
 * An optional `roomMap` can be provided for layout-specific room data.
 */
export function findPath(
  from: RoomId,
  to: RoomId,
  seed?: string,
  roomMap: Readonly<Record<RoomId, Room>> = ROOM_MAP,
): RoomId[] {
  if (from === to) return [from]

  if (!seed) {
    return _bfsPath(from, to, roomMap)
  }

  const rng = seededRngFromKey(seed)

  // Scenic detour (30% chance): visit a random neighbor first
  const fromRoom = roomMap[from]
  const eligibleDetours = fromRoom.adjacentRooms.filter(
    (r) => r !== to && r !== from,
  )

  if (rng.next() < 0.3 && eligibleDetours.length > 0) {
    const detourRoom = rng.pick(eligibleDetours)
    const restPath = _bfsShuffled(detourRoom, to, rng, roomMap)
    return [from, ...restPath]
  }

  // Shuffled BFS (70% chance)
  return _bfsShuffled(from, to, rng, roomMap)
}

/** Standard deterministic BFS (original implementation). */
function _bfsPath(
  from: RoomId,
  to: RoomId,
  roomMap: Readonly<Record<RoomId, Room>>,
): RoomId[] {
  const queue: RoomId[][] = [[from]]
  const visited = new Set<RoomId>([from])

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    const room = roomMap[current]

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
  roomMap: Readonly<Record<RoomId, Room>>,
): RoomId[] {
  if (from === to) return [from]

  const queue: RoomId[][] = [[from]]
  const visited = new Set<RoomId>([from])

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    const room = roomMap[current]

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
export function requiresStaircase(
  from: RoomId,
  to: RoomId,
  roomMap: Readonly<Record<RoomId, Room>> = ROOM_MAP,
): boolean {
  if (from === to) return false
  const path = findPath(from, to, undefined, roomMap)
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
  roomMap: Readonly<Record<RoomId, Room>> = ROOM_MAP,
): THREE.Vector3 {
  const from = roomMap[fromRoom].center
  const to = roomMap[toRoom].center

  return new THREE.Vector3().lerpVectors(from, to, progress)
}

// ---------------------------------------------------------------------------
// Staircase geometry constants (must match buildStaircase in house.ts)
// ---------------------------------------------------------------------------

/** World-space X center of the staircase column */
export const STAIR_X = 29.5

/**
 * Z coordinate where the character enters/exits the staircase at the bottom.
 * Positioned in front of the first step (step 0 front face is at Z = 0.5)
 * so the character never clips inside step geometry.
 */
export const STAIR_Z_BOTTOM = 0

/**
 * Z coordinate near the top step (toward back wall).
 * Matches the compressed stair geometry: last step center at Z ≈ 6.1,
 * landing at Z ≈ 6.9.  Keeps the character clear of the back wall (z=7.0).
 */
export const STAIR_Z_TOP = 6.5

// ---------------------------------------------------------------------------
// Segment interpolation functions
// ---------------------------------------------------------------------------
// Each function handles one kind of movement and has a clear Y-position
// contract.  Keeping them separate makes it easy to unit-test the invariant
// that horizontal segments never change Y.

/** Resolves the staircase center X for a given floor, falling back to STAIR_X. */
function resolveStairX(floor: 1 | 2 | 3, stairXPerFloor?: StairXPerFloor): number {
  return stairXPerFloor?.[floor] ?? STAIR_X
}

/** Progress thresholds for the three-phase staircase→room movement. */
const PHASE_CLIMB_END = 1 / 3
const PHASE_LAND_END = 2 / 3
const PHASE_LAND_DURATION = PHASE_LAND_END - PHASE_CLIMB_END

/**
 * Horizontal walk from a room center toward the staircase entry point.
 *
 * **Y contract:** Y === fromCenter.y at every progress value.
 */
export function approachStaircasePosition(
  fromCenter: THREE.Vector3,
  ascending: boolean,
  progress: number,
  stairX = STAIR_X,
): THREE.Vector3 {
  const entryZ = ascending ? STAIR_Z_BOTTOM : STAIR_Z_TOP
  const entry = new THREE.Vector3(stairX, fromCenter.y, entryZ)
  return new THREE.Vector3().lerpVectors(fromCenter, entry, progress)
}

/**
 * Vertical climb / descent through the staircase column, including horizontal
 * landing walks between flights when staircases are at different X positions.
 *
 * For a single flight (adjacent floors) the function just climbs.
 * For multi-floor paths the segments alternate: climb, land, climb, land, …
 * Each segment is allocated equal progress time so Y changes monotonically
 * and X never drifts during a climb.
 *
 * **X contract:** X stays constant at `stairXPerFloor[flightFromFloor]` during
 * each climb segment. During a landing walk between flights, X lerps from the
 * completed flight's stairX to the next flight's stairX at the intermediate
 * floor Y.
 *
 * **Y contract:** Y interpolates from getFloorCenterY(prevFloor) to
 * getFloorCenterY(toFloor), monotonically (constant during landing walks).
 */
export function climbStaircasePosition(
  prevFloor: 1 | 2 | 3,
  toFloor: 1 | 2 | 3,
  progress: number,
  stairXPerFloor?: StairXPerFloor,
): THREE.Vector3 {
  const ascending = toFloor > prevFloor
  const numFlights = Math.abs(toFloor - prevFloor)
  const dir = ascending ? 1 : -1
  // climbStartZ / climbEndZ are the Z values at the bottom and top of every staircase flight.
  // Both are needed at the top level because the landing walk uses both to smoothly
  // transition from the exit of one flight (climbEndZ) to the entry of the next (climbStartZ).
  const climbStartZ = ascending ? STAIR_Z_BOTTOM : STAIR_Z_TOP
  const climbEndZ = ascending ? STAIR_Z_TOP : STAIR_Z_BOTTOM

  // Segments alternate: climb0, land0, climb1, land1, …, climbN-1
  // Total: 2*numFlights - 1 segments, each with equal duration.
  // This also handles single-flight (numFlights=1): one segment, no landing.
  const segmentCount = 2 * numFlights - 1
  const scaledProgress = progress * segmentCount
  const segmentIdx = Math.min(Math.floor(scaledProgress), segmentCount - 1)
  const segmentT = scaledProgress - segmentIdx

  if (segmentIdx % 2 === 0) {
    // Climb segment: X fixed at this flight's stairX, Y and Z interpolate from entry to exit
    const flightIdx = segmentIdx / 2
    const flightFromFloor = (prevFloor + dir * flightIdx) as 1 | 2 | 3
    const flightToFloor = (prevFloor + dir * (flightIdx + 1)) as 1 | 2 | 3
    // The staircase column connecting two adjacent floors belongs to the LOWER floor.
    // Use Math.min so both ascending (flightFromFloor < flightToFloor) and descending
    // (flightFromFloor > flightToFloor) flights resolve to the same physical column.
    return new THREE.Vector3(
      resolveStairX(Math.min(flightFromFloor, flightToFloor) as 1 | 2 | 3, stairXPerFloor),
      THREE.MathUtils.lerp(getFloorCenterY(flightFromFloor), getFloorCenterY(flightToFloor), segmentT),
      THREE.MathUtils.lerp(climbStartZ, climbEndZ, segmentT),
    )
  } else {
    // Landing walk segment: walk at the intermediate floor Y, transitioning both X and Z.
    // X moves from the previous flight's stairX to the next flight's stairX.
    // Z moves from climbEndZ (exit of previous flight) back to climbStartZ (entry of next flight),
    // so the character walks from the back of one staircase to the front of the next.
    const completedFlightIdx = (segmentIdx - 1) / 2
    const landingFloor = (prevFloor + dir * (completedFlightIdx + 1)) as 1 | 2 | 3
    // Each flight's column belongs to the LOWER of its two floors.
    const completedFlightLower = Math.min(prevFloor + dir * completedFlightIdx, prevFloor + dir * (completedFlightIdx + 1)) as 1 | 2 | 3
    const nextFlightLower = Math.min(prevFloor + dir * (completedFlightIdx + 1), prevFloor + dir * (completedFlightIdx + 2)) as 1 | 2 | 3
    const fromX = resolveStairX(completedFlightLower, stairXPerFloor)
    const toX = resolveStairX(nextFlightLower, stairXPerFloor)
    return new THREE.Vector3(
      THREE.MathUtils.lerp(fromX, toX, segmentT),
      getFloorCenterY(landingFloor),
      THREE.MathUtils.lerp(climbEndZ, climbStartZ, segmentT),
    )
  }
}

/**
 * Horizontal walk from the staircase exit point to a room center.
 *
 * **Y contract:** Y === destCenter.y at every progress value.
 */
export function exitStaircasePosition(
  destCenter: THREE.Vector3,
  ascending: boolean,
  progress: number,
  stairX = STAIR_X,
): THREE.Vector3 {
  const exitZ = ascending ? STAIR_Z_TOP : STAIR_Z_BOTTOM
  const exit = new THREE.Vector3(stairX, destCenter.y, exitZ)
  return new THREE.Vector3().lerpVectors(exit, destCenter, progress)
}

// ---------------------------------------------------------------------------

/**
 * Returns the world-space position of a character partway along a full path,
 * given their current leg index and progress within that leg.
 *
 * Staircase legs use a three-phase movement:
 *   - Room → Staircase: walk horizontally to the stair entry at the current
 *     floor level and the correct front/back Z for the climb direction.
 *   - Staircase → Room, phase 1 (0–1/3): climb inside the staircase column;
 *     X stays at the current flight's staircase center X.
 *   - Staircase → Room, phase 2 (1/3–2/3): landing walk — move horizontally at
 *     the destination floor Y from the top of the last staircase column to the
 *     entry of the destination floor's staircase exit point.
 *   - Staircase → Room, phase 3 (2/3–1): walk horizontally to the room center.
 *
 * Phases 1 and 2 together ensure that independently-positioned staircases on
 * different floors are traversed correctly with no positional snap.
 */
export function getPositionAlongPath(
  path: RoomId[],
  legIndex: number,
  legProgress: number,
  roomMap: Readonly<Record<RoomId, Room>> = ROOM_MAP,
  stairXPerFloor?: StairXPerFloor,
): THREE.Vector3 {
  if (path.length === 0) {
    return new THREE.Vector3(0, 0, 0)
  }

  // Clamp to valid indices
  const fromIdx = Math.max(0, Math.min(legIndex - 1, path.length - 1))
  const toIdx = Math.max(0, Math.min(legIndex, path.length - 1))

  if (fromIdx === toIdx) {
    return roomMap[path[fromIdx]].center.clone()
  }

  const fromRoomId = path[fromIdx]
  const toRoomId = path[toIdx]

  // ---- Leg toward the staircase ----
  if (toRoomId === 'staircase') {
    const nextRoomId = toIdx < path.length - 1 ? path[toIdx + 1] : null
    const fromFloor = roomMap[fromRoomId].floor
    const nextFloor = nextRoomId ? roomMap[nextRoomId].floor : fromFloor
    const ascending = nextFloor > fromFloor
    // For ascending, the staircase column starts at fromFloor.
    // For descending, the staircase column that connects fromFloor to fromFloor-1
    // is the one on the LOWER floor (fromFloor - 1).
    const approachStairX = ascending
      ? resolveStairX(fromFloor, stairXPerFloor)
      : resolveStairX((fromFloor - 1) as 1 | 2 | 3, stairXPerFloor)
    return approachStaircasePosition(roomMap[fromRoomId].center, ascending, legProgress, approachStairX)
  }

  // ---- Leg away from the staircase ----
  if (fromRoomId === 'staircase') {
    const prevRoomId = fromIdx > 0 ? path[fromIdx - 1] : null
    const prevFloor = prevRoomId ? roomMap[prevRoomId].floor : roomMap[toRoomId].floor
    const toFloor = roomMap[toRoomId].floor
    const destCenter = roomMap[toRoomId].center
    const ascending = toFloor > prevFloor

    // Phase 3 (2/3–1): walk horizontally from the staircase exit to the room center
    if (legProgress > PHASE_LAND_END) {
      return exitStaircasePosition(
        destCenter,
        ascending,
        (legProgress - PHASE_LAND_END) / (1 - PHASE_LAND_END),
        resolveStairX(toFloor, stairXPerFloor),
      )
    }

    // Phase 2 (1/3–2/3): landing walk — move horizontally at destination floor Y
    // from the top of the last staircase column to the exit of the destination staircase.
    if (legProgress > PHASE_CLIMB_END) {
      const landProgress = (legProgress - PHASE_CLIMB_END) / PHASE_LAND_DURATION
      // The last staircase climbed belongs to the floor just below (or above) the destination
      // The last flight's column belongs to the lower of its two floors.
      // Ascending: last flight went from (toFloor-1) to toFloor → lower = toFloor-1.
      // Descending: last flight went from (toFloor+1) to toFloor → lower = toFloor.
      const lastClimbFromFloor = (ascending ? toFloor - 1 : toFloor) as 1 | 2 | 3
      const exitZ = ascending ? STAIR_Z_TOP : STAIR_Z_BOTTOM
      return new THREE.Vector3(
        THREE.MathUtils.lerp(resolveStairX(lastClimbFromFloor, stairXPerFloor), resolveStairX(toFloor, stairXPerFloor), landProgress),
        getFloorCenterY(toFloor),
        exitZ,
      )
    }

    // Phase 1 (0–1/3): climb / descend the staircase
    return climbStaircasePosition(prevFloor, toFloor, legProgress / PHASE_CLIMB_END, stairXPerFloor)
  }

  // ---- Normal leg between two non-staircase rooms ----
  return getPositionAlongLeg(fromRoomId, toRoomId, legProgress, roomMap)
}

/**
 * Returns the world-space position of the staircase entry/exit at a given floor.
 * Used during floor transitions to position the character correctly.
 */
export function getStaircasePosition(floor: 1 | 2 | 3, stairX = STAIR_X): THREE.Vector3 {
  return new THREE.Vector3(stairX, getFloorCenterY(floor), 4)
}

/**
 * Returns the direction the character should face (as a Y-axis rotation angle)
 * when moving from one room to another.
 */
export function getFacingAngle(
  fromRoom: RoomId,
  toRoom: RoomId,
  roomMap: Readonly<Record<RoomId, Room>> = ROOM_MAP,
): number {
  const from = roomMap[fromRoom].center
  const to = roomMap[toRoom].center

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
export function validateAdjacencyGraph(
  rooms: readonly Room[] = ROOMS,
  roomMap: Readonly<Record<RoomId, Room>> = ROOM_MAP,
): string[] {
  const errors: string[] = []

  for (const room of rooms) {
    for (const neighbor of room.adjacentRooms) {
      const neighborRoom = roomMap[neighbor]
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
