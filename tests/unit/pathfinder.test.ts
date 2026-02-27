// ---------------------------------------------------------------------------
// Unit tests for pathfinder position interpolation
// ---------------------------------------------------------------------------
//
// These tests verify the physical invariants of character movement:
//   1. Horizontal segments keep Y at the floor level (no floating)
//   2. Stair climbing Y is monotonic and bounded by floor levels
//   3. Position is continuous across leg boundaries (no teleporting)
//
// Run:  npm run test:unit

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  approachStaircasePosition,
  climbStaircasePosition,
  exitStaircasePosition,
  getPositionAlongPath,
  findPath,
  STAIR_X,
  STAIR_Z_BOTTOM,
  STAIR_Z_TOP,
} from '../../src/game/character/pathfinder'
import { getFloorCenterY, ROOM_MAP, ROOMS } from '../../src/game/rooms'
import type { RoomId } from '../../src/game/rooms'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPSILON = 0.001

function approxEqual(a: number, b: number, msg: string): void {
  assert.ok(
    Math.abs(a - b) < EPSILON,
    `${msg} — got ${a}, expected ${b} (diff=${Math.abs(a - b).toFixed(6)})`,
  )
}

/** All rooms the character can visit (everything except staircase). */
const allRooms: RoomId[] = ROOMS.filter((r) => r.id !== 'staircase').map(
  (r) => r.id,
)

/** Every (from, to) pair where the rooms are on different floors. */
const crossFloorPairs: [RoomId, RoomId][] = []
for (const from of allRooms) {
  for (const to of allRooms) {
    if (ROOM_MAP[from].floor !== ROOM_MAP[to].floor) {
      crossFloorPairs.push([from, to])
    }
  }
}

/** Progress sample points from 0 to 1 in steps of 0.05. */
const progressSteps: number[] = []
for (let p = 0; p <= 1.001; p += 0.05) {
  progressSteps.push(Math.min(p, 1))
}

// ---------------------------------------------------------------------------
// approachStaircasePosition
// ---------------------------------------------------------------------------

describe('approachStaircasePosition', () => {
  test('Y stays at floor level for every room and progress value', () => {
    for (const room of allRooms) {
      const center = ROOM_MAP[room].center
      for (const ascending of [true, false]) {
        for (const p of progressSteps) {
          const pos = approachStaircasePosition(center, ascending, p)
          approxEqual(
            pos.y,
            center.y,
            `${room} asc=${ascending} p=${p.toFixed(2)}`,
          )
        }
      }
    }
  })

  test('starts at room center', () => {
    for (const room of allRooms) {
      const center = ROOM_MAP[room].center
      const pos = approachStaircasePosition(center, true, 0)
      approxEqual(pos.x, center.x, `${room} start x`)
      approxEqual(pos.z, center.z, `${room} start z`)
    }
  })

  test('ends at STAIR_X with correct Z', () => {
    const center = ROOM_MAP['kitchen'].center
    const asc = approachStaircasePosition(center, true, 1)
    approxEqual(asc.x, STAIR_X, 'ascending end x')
    approxEqual(asc.z, STAIR_Z_BOTTOM, 'ascending end z')

    const desc = approachStaircasePosition(center, false, 1)
    approxEqual(desc.x, STAIR_X, 'descending end x')
    approxEqual(desc.z, STAIR_Z_TOP, 'descending end z')
  })
})

// ---------------------------------------------------------------------------
// exitStaircasePosition
// ---------------------------------------------------------------------------

describe('exitStaircasePosition', () => {
  test('Y stays at floor level for every room and progress value', () => {
    for (const room of allRooms) {
      const center = ROOM_MAP[room].center
      for (const ascending of [true, false]) {
        for (const p of progressSteps) {
          const pos = exitStaircasePosition(center, ascending, p)
          approxEqual(
            pos.y,
            center.y,
            `${room} asc=${ascending} p=${p.toFixed(2)}`,
          )
        }
      }
    }
  })

  test('starts at STAIR_X with correct Z', () => {
    const center = ROOM_MAP['bedroom'].center
    const asc = exitStaircasePosition(center, true, 0)
    approxEqual(asc.x, STAIR_X, 'ascending start x')
    approxEqual(asc.z, STAIR_Z_TOP, 'ascending start z')

    const desc = exitStaircasePosition(center, false, 0)
    approxEqual(desc.x, STAIR_X, 'descending start x')
    approxEqual(desc.z, STAIR_Z_BOTTOM, 'descending start z')
  })

  test('ends at room center', () => {
    for (const room of allRooms) {
      const center = ROOM_MAP[room].center
      const pos = exitStaircasePosition(center, true, 1)
      approxEqual(pos.x, center.x, `${room} end x`)
      approxEqual(pos.y, center.y, `${room} end y`)
      approxEqual(pos.z, center.z, `${room} end z`)
    }
  })
})

// ---------------------------------------------------------------------------
// climbStaircasePosition
// ---------------------------------------------------------------------------

describe('climbStaircasePosition', () => {
  const floorPairs: [1 | 2 | 3, 1 | 2 | 3][] = [
    [1, 2],
    [2, 1],
    [1, 3],
    [3, 1],
    [2, 3],
    [3, 2],
  ]

  test('starts at origin floor Y and ends at destination floor Y', () => {
    for (const [from, to] of floorPairs) {
      const start = climbStaircasePosition(from, to, 0)
      const end = climbStaircasePosition(from, to, 1)
      approxEqual(start.y, getFloorCenterY(from), `climb ${from}→${to} start Y`)
      approxEqual(end.y, getFloorCenterY(to), `climb ${from}→${to} end Y`)
    }
  })

  test('Y changes monotonically (no floating or backtracking)', () => {
    for (const [from, to] of floorPairs) {
      const ascending = to > from
      let prevY = climbStaircasePosition(from, to, 0).y

      for (const p of progressSteps.slice(1)) {
        const y = climbStaircasePosition(from, to, p).y
        if (ascending) {
          assert.ok(
            y >= prevY - EPSILON,
            `climb ${from}→${to} ascending: Y decreased at p=${p.toFixed(2)} (${prevY} → ${y})`,
          )
        } else {
          assert.ok(
            y <= prevY + EPSILON,
            `climb ${from}→${to} descending: Y increased at p=${p.toFixed(2)} (${prevY} → ${y})`,
          )
        }
        prevY = y
      }
    }
  })

  test('multi-floor climb passes through intermediate floor Y', () => {
    // Floor 1→3 should reach floor 2 Y at the midpoint
    const mid13 = climbStaircasePosition(1, 3, 0.5)
    approxEqual(mid13.y, getFloorCenterY(2), 'climb 1→3 midpoint')

    // Floor 3→1 should reach floor 2 Y at the midpoint
    const mid31 = climbStaircasePosition(3, 1, 0.5)
    approxEqual(mid31.y, getFloorCenterY(2), 'climb 3→1 midpoint')
  })

  test('X stays at STAIR_X throughout climb', () => {
    for (const [from, to] of floorPairs) {
      for (const p of progressSteps) {
        const pos = climbStaircasePosition(from, to, p)
        approxEqual(pos.x, STAIR_X, `climb ${from}→${to} p=${p.toFixed(2)} x`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Full-path: position continuity at leg boundaries
// ---------------------------------------------------------------------------

describe('full-path position continuity', () => {
  test('no position jump at leg boundaries for all cross-floor paths', () => {
    for (const [from, to] of crossFloorPairs) {
      const path = findPath(from, to)
      if (path.length < 3) continue

      for (let legIndex = 2; legIndex < path.length; legIndex++) {
        const prevEnd = getPositionAlongPath(path, legIndex - 1, 1.0)
        const thisStart = getPositionAlongPath(path, legIndex, 0.0)

        approxEqual(
          prevEnd.y,
          thisStart.y,
          `${from}→${to} [${path.join(',')}] Y at boundary leg ${legIndex - 1}→${legIndex}`,
        )
        approxEqual(
          prevEnd.x,
          thisStart.x,
          `${from}→${to} [${path.join(',')}] X at boundary leg ${legIndex - 1}→${legIndex}`,
        )
        approxEqual(
          prevEnd.z,
          thisStart.z,
          `${from}→${to} [${path.join(',')}] Z at boundary leg ${legIndex - 1}→${legIndex}`,
        )
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Full-path: Y invariants across entire traversal
// ---------------------------------------------------------------------------

describe('full-path Y invariants', () => {
  test('Y stays at floor level during horizontal (non-staircase) legs', () => {
    for (const [from, to] of crossFloorPairs) {
      const path = findPath(from, to)

      for (let legIndex = 1; legIndex < path.length; legIndex++) {
        const fromRoom = path[legIndex - 1]
        const toRoom = path[legIndex]

        // Skip legs involving the staircase (Y changes during climb)
        if (fromRoom === 'staircase' || toRoom === 'staircase') continue

        const expectedY = ROOM_MAP[fromRoom].center.y
        for (const p of progressSteps) {
          const pos = getPositionAlongPath(path, legIndex, p)
          approxEqual(
            pos.y,
            expectedY,
            `${from}→${to} leg ${fromRoom}→${toRoom} p=${p.toFixed(2)}`,
          )
        }
      }
    }
  })

  test('Y never exceeds destination floor level during cross-floor paths', () => {
    for (const [from, to] of crossFloorPairs) {
      const path = findPath(from, to)
      const fromY = ROOM_MAP[from].center.y
      const toY = ROOM_MAP[to].center.y
      const minY = Math.min(fromY, toY)
      const maxY = Math.max(fromY, toY)

      for (let legIndex = 1; legIndex < path.length; legIndex++) {
        for (const p of progressSteps) {
          const pos = getPositionAlongPath(path, legIndex, p)
          assert.ok(
            pos.y >= minY - EPSILON && pos.y <= maxY + EPSILON,
            `${from}→${to} leg ${legIndex} p=${p.toFixed(2)}: Y=${pos.y} outside [${minY}, ${maxY}]`,
          )
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Same-floor paths (regression: should never involve Y changes)
// ---------------------------------------------------------------------------

describe('same-floor paths', () => {
  const sameFloorPairs: [RoomId, RoomId][] = []
  for (const from of allRooms) {
    for (const to of allRooms) {
      if (from !== to && ROOM_MAP[from].floor === ROOM_MAP[to].floor) {
        sameFloorPairs.push([from, to])
      }
    }
  }

  test('Y is constant throughout same-floor paths', () => {
    for (const [from, to] of sameFloorPairs) {
      const path = findPath(from, to)
      const expectedY = ROOM_MAP[from].center.y

      for (let legIndex = 1; legIndex < path.length; legIndex++) {
        for (const p of progressSteps) {
          const pos = getPositionAlongPath(path, legIndex, p)
          approxEqual(
            pos.y,
            expectedY,
            `same-floor ${from}→${to} leg ${legIndex} p=${p.toFixed(2)}`,
          )
        }
      }
    }
  })
})
