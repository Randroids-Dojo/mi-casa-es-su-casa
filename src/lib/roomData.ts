// ---------------------------------------------------------------------------
// Server-safe room metadata — plain objects, no Three.js dependency
// ---------------------------------------------------------------------------
//
// This module duplicates room center positions and activity lists from
// src/game/rooms.ts in a form that can be imported by server-side code
// (API routes, offline simulation) without pulling in Three.js.
//
// If you change room positions or activities in rooms.ts, update this file
// to match.

const FLOOR_HEIGHT = 8

function floorY(floor: number): number {
  return (floor - 1) * FLOOR_HEIGHT + 1
}

export interface RoomPosition {
  x: number
  y: number
  z: number
}

/** Room center positions as plain objects (mirrors rooms.ts Vector3 values) */
export const ROOM_CENTERS: Readonly<Record<string, RoomPosition>> = {
  entrance: { x: 2.5, y: floorY(1), z: 4 },
  living_room: { x: 10, y: floorY(1), z: 4 },
  kitchen: { x: 21.5, y: floorY(1), z: 4 },
  bedroom: { x: 7.5, y: floorY(2), z: 4 },
  study: { x: 23.5, y: floorY(2), z: 4 },
  bathroom: { x: 17, y: floorY(2), z: 4 },
  hobby_room: { x: 8.5, y: floorY(3), z: 4 },
  storage: { x: 21.5, y: floorY(3), z: 4 },
  staircase: { x: 29.5, y: floorY(1), z: 4 },
}

/** Activities available in each room (mirrors rooms.ts) */
export const ROOM_ACTIVITIES: Readonly<Record<string, readonly string[]>> = {
  entrance: ['idle'],
  living_room: ['relax', 'watch_tv', 'read', 'idle'],
  kitchen: ['cook', 'eat', 'idle'],
  bedroom: ['sleep', 'dress', 'idle'],
  study: ['work', 'type', 'read', 'idle'],
  bathroom: ['bathe', 'groom', 'use_bathroom', 'idle'],
  hobby_room: ['paint', 'play_instrument', 'tinker', 'read', 'idle'],
  storage: ['rummage', 'idle'],
  staircase: ['idle'],
}
