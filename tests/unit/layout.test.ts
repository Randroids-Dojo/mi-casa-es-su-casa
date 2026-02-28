// ---------------------------------------------------------------------------
// Unit tests for layout generation and room data builder
// ---------------------------------------------------------------------------
//
// These tests verify:
//   1. Determinism: same name always produces same layout
//   2. Variety: different names produce different layouts
//   3. Validity: all floors sum to 26 voxels, no room below minimum width
//   4. Traversability: adjacency graph is symmetric and fully connected
//
// Run:  npm run test:unit

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { generateLayout, getDefaultLayout } from '../../src/lib/layout'
import type { HouseLayout, LayoutRoomId } from '../../src/lib/layout'
import { buildLayoutRoomData } from '../../src/lib/roomDataBuilder'

// ---------------------------------------------------------------------------
// Room size constraints (must match layout.ts)
// ---------------------------------------------------------------------------

const ROOM_MIN_WIDTHS: Record<LayoutRoomId, number> = {
  entrance: 3,
  living_room: 6,
  kitchen: 6,
  bedroom: 6,
  bathroom: 5,
  study: 5,
  hobby_room: 6,
  storage: 5,
}

const ALL_ROOMS: LayoutRoomId[] = [
  'entrance',
  'living_room',
  'kitchen',
  'bedroom',
  'bathroom',
  'study',
  'hobby_room',
  'storage',
]

const FLOOR_ROOM_WIDTH = 26 // x=1 to x=27

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('layout determinism', () => {
  test('same name always produces same layout', () => {
    const a = generateLayout('Alice')
    const b = generateLayout('Alice')

    assert.deepStrictEqual(a.slots, b.slots)
    assert.deepStrictEqual(a.walls, b.walls)
  })

  test('case-insensitive (Alice === alice)', () => {
    const a = generateLayout('Alice')
    const b = generateLayout('alice')

    assert.deepStrictEqual(a.slots, b.slots)
  })
})

// ---------------------------------------------------------------------------
// Variety
// ---------------------------------------------------------------------------

describe('layout variety', () => {
  test('different names produce different layouts', () => {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']
    const layouts = names.map(generateLayout)

    // At least some pairs should differ in room assignment
    let differenceFound = false
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const aRoomOrder = layouts[i].slots.map((s) => s.roomId).join(',')
        const bRoomOrder = layouts[j].slots.map((s) => s.roomId).join(',')
        if (aRoomOrder !== bRoomOrder) {
          differenceFound = true
          break
        }
      }
      if (differenceFound) break
    }
    assert.ok(differenceFound, 'Expected at least two different layouts among 5 names')
  })
})

// ---------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------

describe('layout validity', () => {
  const testNames = ['Alice', 'Bob', 'Charlie', 'TestUser', 'ZZZ', 'a1b2c3']

  for (const name of testNames) {
    test(`${name}: all 8 rooms present`, () => {
      const layout = generateLayout(name)
      const roomIds = layout.slots.map((s) => s.roomId).sort()
      assert.deepStrictEqual(roomIds, [...ALL_ROOMS].sort())
    })

    test(`${name}: each floor sums to ${FLOOR_ROOM_WIDTH} voxels`, () => {
      const layout = generateLayout(name)

      for (const floor of [1, 2, 3] as const) {
        const floorSlots = layout.slots.filter((s) => s.floor === floor)
        const totalWidth = floorSlots.reduce((sum, s) => sum + (s.xMax - s.xMin), 0)
        assert.strictEqual(
          totalWidth,
          FLOOR_ROOM_WIDTH,
          `Floor ${floor} total width is ${totalWidth}, expected ${FLOOR_ROOM_WIDTH}`,
        )
      }
    })

    test(`${name}: no room below minimum width`, () => {
      const layout = generateLayout(name)

      for (const slot of layout.slots) {
        const width = slot.xMax - slot.xMin
        const minWidth = ROOM_MIN_WIDTHS[slot.roomId]
        assert.ok(
          width >= minWidth,
          `${slot.roomId} on floor ${slot.floor} has width ${width}, minimum is ${minWidth}`,
        )
      }
    })

    test(`${name}: rooms don't overlap and cover x=1..27`, () => {
      const layout = generateLayout(name)

      for (const floor of [1, 2, 3] as const) {
        const floorSlots = layout.slots
          .filter((s) => s.floor === floor)
          .sort((a, b) => a.xMin - b.xMin)

        // First room starts at x=1
        assert.strictEqual(floorSlots[0].xMin, 1, `Floor ${floor} first room should start at x=1`)
        // Last room ends at x=27
        assert.strictEqual(
          floorSlots[floorSlots.length - 1].xMax,
          27,
          `Floor ${floor} last room should end at x=27`,
        )

        // No gaps between rooms
        for (let i = 1; i < floorSlots.length; i++) {
          assert.strictEqual(
            floorSlots[i].xMin,
            floorSlots[i - 1].xMax,
            `Floor ${floor}: gap between ${floorSlots[i - 1].roomId} and ${floorSlots[i].roomId}`,
          )
        }
      }
    })

    test(`${name}: 3 rooms on floor 1, 3 on floor 2, 2 on floor 3`, () => {
      const layout = generateLayout(name)

      const f1 = layout.slots.filter((s) => s.floor === 1)
      const f2 = layout.slots.filter((s) => s.floor === 2)
      const f3 = layout.slots.filter((s) => s.floor === 3)

      assert.strictEqual(f1.length, 3, `Floor 1 should have 3 rooms, got ${f1.length}`)
      assert.strictEqual(f2.length, 3, `Floor 2 should have 3 rooms, got ${f2.length}`)
      assert.strictEqual(f3.length, 2, `Floor 3 should have 2 rooms, got ${f3.length}`)
    })

    test(`${name}: centerX is midpoint of xMin and xMax`, () => {
      const layout = generateLayout(name)

      for (const slot of layout.slots) {
        const expected = (slot.xMin + slot.xMax) / 2
        assert.strictEqual(
          slot.centerX,
          expected,
          `${slot.roomId}: centerX ${slot.centerX} !== (${slot.xMin}+${slot.xMax})/2 = ${expected}`,
        )
      }
    })

    test(`${name}: slotMap has correct entries`, () => {
      const layout = generateLayout(name)

      for (const slot of layout.slots) {
        assert.deepStrictEqual(layout.slotMap[slot.roomId], slot)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Default layout backward compatibility
// ---------------------------------------------------------------------------

describe('default layout', () => {
  test('matches original hardcoded positions', () => {
    const layout = getDefaultLayout()

    assert.strictEqual(layout.slotMap.entrance.xMin, 1)
    assert.strictEqual(layout.slotMap.entrance.xMax, 4)
    assert.strictEqual(layout.slotMap.living_room.xMin, 4)
    assert.strictEqual(layout.slotMap.living_room.xMax, 16)
    assert.strictEqual(layout.slotMap.kitchen.xMin, 16)
    assert.strictEqual(layout.slotMap.kitchen.xMax, 27)
    assert.strictEqual(layout.slotMap.bedroom.xMin, 1)
    assert.strictEqual(layout.slotMap.bedroom.xMax, 14)
    assert.strictEqual(layout.slotMap.bathroom.xMin, 14)
    assert.strictEqual(layout.slotMap.bathroom.xMax, 20)
    assert.strictEqual(layout.slotMap.study.xMin, 20)
    assert.strictEqual(layout.slotMap.study.xMax, 27)
    assert.strictEqual(layout.slotMap.hobby_room.xMin, 1)
    assert.strictEqual(layout.slotMap.hobby_room.xMax, 16)
    assert.strictEqual(layout.slotMap.storage.xMin, 16)
    assert.strictEqual(layout.slotMap.storage.xMax, 27)
  })
})

// ---------------------------------------------------------------------------
// Room data builder
// ---------------------------------------------------------------------------

describe('buildLayoutRoomData', () => {
  test('returns correct centers for default layout', () => {
    const layout = getDefaultLayout()
    const data = buildLayoutRoomData(layout)

    assert.strictEqual(data.centers.entrance.x, 2.5)
    assert.strictEqual(data.centers.living_room.x, 10)
    assert.strictEqual(data.centers.kitchen.x, 21.5)
  })

  test('staircase center is always at x=29.5', () => {
    const names = ['Alice', 'Bob', 'Charlie']
    for (const name of names) {
      const layout = generateLayout(name)
      const data = buildLayoutRoomData(layout)
      assert.strictEqual(data.centers.staircase.x, 29.5)
    }
  })

  test('all rooms have activities', () => {
    const layout = generateLayout('TestUser')
    const data = buildLayoutRoomData(layout)

    for (const roomId of ALL_ROOMS) {
      const activities = data.activities[roomId]
      assert.ok(activities, `Missing activities for ${roomId}`)
      assert.ok(activities.length > 0, `Empty activities for ${roomId}`)
      assert.ok(activities.includes('idle'), `${roomId} should have idle activity`)
    }
  })
})

// ---------------------------------------------------------------------------
// Traversability (adjacency graph)
// ---------------------------------------------------------------------------

describe('adjacency traversability', () => {
  const testNames = ['Alice', 'Bob', 'Charlie', 'TestUser']

  for (const name of testNames) {
    test(`${name}: adjacency is symmetric`, () => {
      const layout = generateLayout(name)
      const data = buildLayoutRoomData(layout)

      for (const [roomId, neighbors] of Object.entries(data.adjacency)) {
        for (const neighbor of neighbors) {
          assert.ok(
            data.adjacency[neighbor]?.includes(roomId),
            `${neighbor} should be adjacent to ${roomId} (asymmetric adjacency)`,
          )
        }
      }
    })

    test(`${name}: all rooms reachable from any room (fully connected)`, () => {
      const layout = generateLayout(name)
      const data = buildLayoutRoomData(layout)

      const allRoomIds = [...ALL_ROOMS.map(String), 'staircase']

      // BFS from entrance
      const visited = new Set<string>()
      const queue: string[] = ['entrance']
      visited.add('entrance')

      while (queue.length > 0) {
        const current = queue.shift()!
        const neighbors = data.adjacency[current] ?? []
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }

      for (const roomId of allRoomIds) {
        assert.ok(
          visited.has(roomId),
          `Room ${roomId} is not reachable from entrance`,
        )
      }
    })

    test(`${name}: staircase is connected to all rooms`, () => {
      const layout = generateLayout(name)
      const data = buildLayoutRoomData(layout)

      const staircaseNeighbors = data.adjacency.staircase ?? []
      for (const roomId of ALL_ROOMS) {
        assert.ok(
          staircaseNeighbors.includes(roomId),
          `Staircase should be adjacent to ${roomId}`,
        )
      }
    })
  }
})
