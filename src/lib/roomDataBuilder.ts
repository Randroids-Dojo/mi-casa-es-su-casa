// ---------------------------------------------------------------------------
// Layout-aware room data builder — server-safe (no Three.js)
// ---------------------------------------------------------------------------
//
// Builds room centers, activities, and adjacency from a HouseLayout.
// Used by simulateOffline.ts and other server-side code that needs
// layout-specific room data without importing Three.js.

import type { HouseLayout, LayoutRoomId } from './layout'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLOOR_HEIGHT = 8

function floorY(floor: number): number {
  return (floor - 1) * FLOOR_HEIGHT + 1
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoomPosition {
  x: number
  y: number
  z: number
}

export interface LayoutRoomData {
  centers: Readonly<Record<string, RoomPosition>>
  activities: Readonly<Record<string, readonly string[]>>
  adjacency: Readonly<Record<string, string[]>>
}

// ---------------------------------------------------------------------------
// Static activity lists (intrinsic to room type, not position)
// ---------------------------------------------------------------------------

const ROOM_ACTIVITY_MAP: Readonly<Record<LayoutRoomId, readonly string[]>> = {
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
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds layout-aware room data (centers, activities, adjacency) from a
 * HouseLayout. The result is server-safe (plain objects, no Three.js).
 */
export function buildLayoutRoomData(layout: HouseLayout): LayoutRoomData {
  // Build centers from slots
  const centers: Record<string, RoomPosition> = {}
  for (const slot of layout.slots) {
    centers[slot.roomId] = {
      x: slot.centerX,
      y: floorY(slot.floor),
      z: 4,
    }
  }
  // Staircase center — uses floor 1's staircaseX
  centers['staircase'] = { x: layout.staircaseX[1] + 2.5, y: floorY(1), z: 4 }

  // Activities are intrinsic to room type
  const activities: Record<string, readonly string[]> = {
    ...ROOM_ACTIVITY_MAP,
    staircase: ['idle'],
  }

  // Build adjacency: linear chain per floor + staircase hub
  const adjacency: Record<string, string[]> = {}

  // Group slots by floor
  const floorSlots: Record<number, typeof layout.slots> = { 1: [], 2: [], 3: [] }
  for (const slot of layout.slots) {
    floorSlots[slot.floor].push(slot)
  }

  // Sort each floor's slots by xMin (left to right)
  for (const floor of [1, 2, 3]) {
    floorSlots[floor].sort((a, b) => a.xMin - b.xMin)
  }

  // Build adjacency for each room
  for (const floor of [1, 2, 3]) {
    const slots = floorSlots[floor]
    for (let i = 0; i < slots.length; i++) {
      const roomId = slots[i].roomId
      const neighbors: string[] = []

      // Left neighbor
      if (i > 0) neighbors.push(slots[i - 1].roomId)
      // Right neighbor
      if (i < slots.length - 1) neighbors.push(slots[i + 1].roomId)
      // Always connected to staircase
      neighbors.push('staircase')

      adjacency[roomId] = neighbors
    }
  }

  // Staircase is adjacent to all rooms
  adjacency['staircase'] = layout.slots.map((s) => s.roomId)

  return { centers, activities, adjacency }
}
