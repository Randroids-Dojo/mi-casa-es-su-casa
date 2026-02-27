import * as THREE from 'three'
import { PALETTE } from './palette'
import type { Vec3, Room, VoxelSpec } from './types'

// ---------------------------------------------------------------------------
// House constants
// ---------------------------------------------------------------------------

/** Width of the house in voxels */
export const HOUSE_WIDTH = 32
/** Height per floor in voxels (walls + ceiling) */
export const FLOOR_HEIGHT = 8
/** Depth of the house in voxels */
export const HOUSE_DEPTH = 8
/** Wall thickness in voxels */
export const WALL_THICKNESS = 1
/** Number of floors */
export const FLOOR_COUNT = 3

// Staircase occupies a 5-wide column on the far right (x = 27..32)
const STAIR_X_START = 27

// ---------------------------------------------------------------------------
// Voxel builder helpers
// ---------------------------------------------------------------------------

/**
 * Creates a box mesh (voxel) at the given position with the given color.
 * Position is the *center* of the voxel in world space.
 */
function makeVoxel(
  position: Vec3,
  color: number,
  size: Vec3 = { x: 1, y: 1, z: 1 },
  structural = false,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  const material = new THREE.MeshLambertMaterial({ color })
  // Structural elements (walls, floors) use polygonOffset so that furniture
  // at the same depth always renders in front, eliminating z-fighting.
  if (structural) {
    material.polygonOffset = true
    material.polygonOffsetFactor = 1
    material.polygonOffsetUnits = 1
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(position.x, position.y, position.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Add multiple voxel specs to a group */
function addVoxels(group: THREE.Group, specs: VoxelSpec[]): void {
  for (const spec of specs) {
    group.add(makeVoxel(spec.position, spec.color, spec.size))
  }
}

// ---------------------------------------------------------------------------
// Floor geometry builder
// ---------------------------------------------------------------------------

/**
 * Returns the Y world position of the bottom of a given floor (1-indexed).
 */
function floorY(floor: 1 | 2 | 3): number {
  return (floor - 1) * FLOOR_HEIGHT
}

/**
 * Builds the structural shell for one floor:
 * - Floor slab
 * - Left wall
 * - Right wall
 * - Back wall
 * (No front wall — dollhouse cutaway)
 */
function buildFloorShell(
  group: THREE.Group,
  floor: 1 | 2 | 3,
): void {
  const baseY = floorY(floor)
  const hw = HOUSE_WIDTH
  const hd = HOUSE_DEPTH
  const wt = WALL_THICKNESS

  // Floor slab — inset by wall thickness on all enclosed sides so its outer
  // faces don't coincide with the wall faces and cause z-fighting.
  group.add(
    makeVoxel(
      { x: hw / 2, y: baseY + 0.5, z: (hd - wt) / 2 },
      PALETTE.FLOOR_WOOD,
      { x: hw - 2 * wt, y: wt, z: hd - wt },
      true,
    ),
  )

  // Left exterior wall
  group.add(
    makeVoxel(
      { x: 0.5, y: baseY + FLOOR_HEIGHT / 2, z: hd / 2 },
      PALETTE.WALL_EXTERIOR,
      { x: wt, y: FLOOR_HEIGHT, z: hd },
      true,
    ),
  )

  // Right exterior wall
  group.add(
    makeVoxel(
      { x: hw - 0.5, y: baseY + FLOOR_HEIGHT / 2, z: hd / 2 },
      PALETTE.WALL_EXTERIOR,
      { x: wt, y: FLOOR_HEIGHT, z: hd },
      true,
    ),
  )

  // Back exterior wall
  group.add(
    makeVoxel(
      { x: hw / 2, y: baseY + FLOOR_HEIGHT / 2, z: hd - 0.5 },
      PALETTE.WALL_EXTERIOR,
      { x: hw, y: FLOOR_HEIGHT, z: wt },
      true,
    ),
  )
}

// ---------------------------------------------------------------------------
// Interior room divider walls
// ---------------------------------------------------------------------------

function buildInteriorWalls(group: THREE.Group, floor: 1 | 2 | 3): void {
  const baseY = floorY(floor)
  const hd = HOUSE_DEPTH
  const wallH = FLOOR_HEIGHT - 1
  const wt = WALL_THICKNESS

  const wallZCenter = (hd - 1) / 2  // 3.5
  const wallZSize = hd - 1           // 7

  // Staircase divider wall (shared by all floors)
  group.add(
    makeVoxel(
      { x: STAIR_X_START + 0.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
      PALETTE.WALL_INTERIOR,
      { x: wt, y: wallH, z: wallZSize },
      true,
    ),
  )

  if (floor === 1) {
    // Entry / living room divider at x=4
    group.add(
      makeVoxel(
        { x: 4.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
        true,
      ),
    )
    // Living room / kitchen divider at x=16
    group.add(
      makeVoxel(
        { x: 16.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
        true,
      ),
    )
  } else if (floor === 2) {
    // Bedroom / bathroom divider at x=14
    group.add(
      makeVoxel(
        { x: 14.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
        true,
      ),
    )
    // Bathroom / study divider at x=20
    group.add(
      makeVoxel(
        { x: 20.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
        true,
      ),
    )
  } else if (floor === 3) {
    // Music room / library divider at x=16
    group.add(
      makeVoxel(
        { x: 16.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
        true,
      ),
    )
  }
}

// ---------------------------------------------------------------------------
// Furniture builders per room
// ---------------------------------------------------------------------------

// Floor 1: Entry Hall (x=1..4)
function buildEntranceHall(group: THREE.Group): void {
  const baseY = floorY(1)
  const ft = baseY + 1

  addVoxels(group, [
    // Front door frame on back wall
    { position: { x: 2.5, y: ft + 2, z: 7.5 }, color: PALETTE.DOOR, size: { x: 2, y: 4, z: 0.5 } },
    // Coat rack
    { position: { x: 1.5, y: ft + 2, z: 5 }, color: PALETTE.BOOKSHELF, size: { x: 0.5, y: 4, z: 0.5 } },
    // Coat rack hooks (small horizontal protrusions)
    { position: { x: 1.75, y: ft + 3, z: 4.8 }, color: PALETTE.DESK, size: { x: 0.5, y: 0.5, z: 0.4 } },
    { position: { x: 1.75, y: ft + 2, z: 4.8 }, color: PALETTE.DESK, size: { x: 0.5, y: 0.5, z: 0.4 } },
    // Entry rug (thin flat slab)
    { position: { x: 2.5, y: ft + 0.1, z: 4 }, color: PALETTE.SOFA, size: { x: 2, y: 0.1, z: 3 } },
  ])
}

// Floor 1: Living Room (x=4..16)
function buildLivingRoom(group: THREE.Group): void {
  const baseY = floorY(1)
  const ft = baseY + 1

  addVoxels(group, [
    // Sofa — wide 3-seater
    { position: { x: 8, y: ft + 0.5, z: 6.5 }, color: PALETTE.SOFA, size: { x: 5, y: 1, z: 1.5 } },
    { position: { x: 8, y: ft + 1.5, z: 7.2 }, color: PALETTE.SOFA, size: { x: 5, y: 2, z: 0.5 } },
    // Sofa cushions (accent)
    { position: { x: 7, y: ft + 1, z: 6 }, color: PALETTE.BED, size: { x: 1, y: 0.5, z: 1 } },
    { position: { x: 9, y: ft + 1, z: 6 }, color: PALETTE.BED, size: { x: 1, y: 0.5, z: 1 } },
    // TV stand
    { position: { x: 8, y: ft + 0.5, z: 1.5 }, color: PALETTE.DESK, size: { x: 4, y: 1, z: 1 } },
    // TV screen
    { position: { x: 8, y: ft + 1.75, z: 1.6 }, color: PALETTE.TV_SCREEN, size: { x: 3.5, y: 2, z: 0.3 } },
    // Fireplace (right side of living room, near divider)
    { position: { x: 14.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 2, y: 3, z: 1 } },
    // Fireplace mantel
    { position: { x: 14.5, y: ft + 3, z: 7.2 }, color: PALETTE.STAIRCASE, size: { x: 3, y: 0.5, z: 1.5 } },
    // Fire glow (orange block inside fireplace)
    { position: { x: 14.5, y: ft + 0.5, z: 7.3 }, color: 0xe05c1a, size: { x: 1.2, y: 1, z: 0.5 } },
    // Armchair
    { position: { x: 12, y: ft + 0.5, z: 5 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: 12, y: ft + 1.5, z: 5.7 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1.5, z: 0.5 } },
    // Coffee table
    { position: { x: 8, y: ft + 0.5, z: 4.5 }, color: PALETTE.TABLE, size: { x: 3, y: 0.5, z: 1.5 } },
    // Bookshelf (left side)
    { position: { x: 5.5, y: ft + 2, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 2, y: 4, z: 0.5 } },
    // Books on shelf (color accents)
    { position: { x: 5, y: ft + 1, z: 7.4 }, color: 0x8b3a3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 5.5, y: ft + 2, z: 7.4 }, color: 0x3a6b3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 6, y: ft + 3, z: 7.4 }, color: 0x3a3a8b, size: { x: 0.5, y: 1, z: 0.3 } },
    // Lamp
    { position: { x: 6, y: ft + 1, z: 4.5 }, color: PALETTE.FRIDGE, size: { x: 0.3, y: 2, z: 0.3 } },
    { position: { x: 6, y: ft + 2.2, z: 4.5 }, color: 0xfff4c0, size: { x: 0.8, y: 0.4, z: 0.8 } },
  ])
}

// Floor 1: Kitchen (x=16..27)
function buildKitchen(group: THREE.Group): void {
  const baseY = floorY(1)
  const ft = baseY + 1

  addVoxels(group, [
    // Counter along back wall
    { position: { x: 22.5, y: ft + 0.5, z: 7.5 }, color: PALETTE.COUNTER, size: { x: 9, y: 1, z: 1 } },
    // Counter backsplash
    { position: { x: 22.5, y: ft + 2, z: 7.8 }, color: 0xd0e8e8, size: { x: 9, y: 2, z: 0.3 } },
    // Stove (on counter, left side)
    { position: { x: 18.5, y: ft + 1.5, z: 7.3 }, color: PALETTE.STOVE, size: { x: 2, y: 1, z: 0.7 } },
    // Stove top burners
    { position: { x: 18, y: ft + 2, z: 7.2 }, color: 0x444444, size: { x: 0.7, y: 0.3, z: 0.7 } },
    { position: { x: 19, y: ft + 2, z: 7.2 }, color: 0x444444, size: { x: 0.7, y: 0.3, z: 0.7 } },
    // Sink (on counter, center)
    { position: { x: 22.5, y: ft + 1.5, z: 7.3 }, color: PALETTE.FRIDGE, size: { x: 1.5, y: 0.7, z: 0.7 } },
    // Fridge (tall, right of counter)
    { position: { x: 25.5, y: ft + 2, z: 7 }, color: PALETTE.FRIDGE, size: { x: 1.5, y: 4, z: 1.5 } },
    // Fridge handle
    { position: { x: 24.9, y: ft + 2, z: 7 }, color: PALETTE.STOVE, size: { x: 0.2, y: 2, z: 0.3 } },
    // Dining table
    { position: { x: 21, y: ft + 0.5, z: 4.5 }, color: PALETTE.TABLE, size: { x: 4, y: 1, z: 2.5 } },
    // Table leg detail
    { position: { x: 19.5, y: ft + 0.5, z: 3.5 }, color: PALETTE.DESK, size: { x: 0.3, y: 1, z: 0.3 } },
    { position: { x: 22.5, y: ft + 0.5, z: 3.5 }, color: PALETTE.DESK, size: { x: 0.3, y: 1, z: 0.3 } },
    // Chairs
    { position: { x: 19.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.WARDROBE, size: { x: 1, y: 1, z: 1 } },
    { position: { x: 22.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.WARDROBE, size: { x: 1, y: 1, z: 1 } },
    // Upper cabinet
    { position: { x: 20, y: ft + 4.5, z: 7.6 }, color: PALETTE.COUNTER, size: { x: 4, y: 2, z: 0.7 } },
  ])
}

// Floor 2: Bedroom (x=1..14)
function buildBedroom(group: THREE.Group): void {
  const baseY = floorY(2)
  const ft = baseY + 1

  addVoxels(group, [
    // Bed (wide double bed)
    { position: { x: 5.5, y: ft + 0.5, z: 6.5 }, color: PALETTE.BED, size: { x: 5, y: 1, z: 2 } },
    // Duvet / blanket
    { position: { x: 5.5, y: ft + 1, z: 6.5 }, color: 0xb8a0cc, size: { x: 4.5, y: 0.3, z: 2 } },
    // Pillows
    { position: { x: 4, y: ft + 1, z: 5.7 }, color: PALETTE.CEILING, size: { x: 1.5, y: 0.5, z: 0.8 } },
    { position: { x: 6.5, y: ft + 1, z: 5.7 }, color: PALETTE.CEILING, size: { x: 1.5, y: 0.5, z: 0.8 } },
    // Bed headboard
    { position: { x: 5.5, y: ft + 2, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 5.5, y: 3, z: 0.5 } },
    // Nightstand (left side)
    { position: { x: 2.5, y: ft + 0.5, z: 6.5 }, color: PALETTE.DESK, size: { x: 1.5, y: 1, z: 1.5 } },
    // Bedside lamp
    { position: { x: 2.5, y: ft + 1.5, z: 6.5 }, color: PALETTE.FRIDGE, size: { x: 0.3, y: 1, z: 0.3 } },
    { position: { x: 2.5, y: ft + 2.1, z: 6.5 }, color: 0xfff4c0, size: { x: 0.7, y: 0.3, z: 0.7 } },
    // Wardrobe (double, against back wall left)
    { position: { x: 2, y: ft + 2.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 3, y: 5, z: 0.8 } },
    // Wardrobe door detail
    { position: { x: 1.5, y: ft + 2.5, z: 7.2 }, color: PALETTE.DESK, size: { x: 1, y: 4, z: 0.3 } },
    { position: { x: 2.5, y: ft + 2.5, z: 7.2 }, color: PALETTE.DESK, size: { x: 1, y: 4, z: 0.3 } },
    // Dresser (against back wall right)
    { position: { x: 11, y: ft + 0.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 4, y: 1, z: 1 } },
    { position: { x: 11, y: ft + 1.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 4, y: 1, z: 1 } },
    // Dresser drawer handles
    { position: { x: 10, y: ft + 0.5, z: 7.1 }, color: PALETTE.FRIDGE, size: { x: 0.8, y: 0.3, z: 0.3 } },
    { position: { x: 12, y: ft + 0.5, z: 7.1 }, color: PALETTE.FRIDGE, size: { x: 0.8, y: 0.3, z: 0.3 } },
    // Rug
    { position: { x: 6, y: ft + 0.1, z: 4.5 }, color: 0x7a5cb8, size: { x: 7, y: 0.1, z: 3 } },
  ])
}

// Floor 2: Bathroom (x=14..20)
function buildBathroom(group: THREE.Group): void {
  const baseY = floorY(2)
  const ft = baseY + 1

  addVoxels(group, [
    // Floor tiles
    { position: { x: 17, y: ft - 0.4, z: 4 }, color: PALETTE.TILE, size: { x: 6, y: 0.1, z: 6 } },
    // Bathtub
    { position: { x: 16.5, y: ft + 0.5, z: 6.5 }, color: PALETTE.PORCELAIN, size: { x: 4, y: 1, z: 2 } },
    { position: { x: 16.5, y: ft + 0.9, z: 6.5 }, color: PALETTE.TILE, size: { x: 3, y: 0.5, z: 1.5 } },
    // Bath tap
    { position: { x: 15.3, y: ft + 1.5, z: 7 }, color: PALETTE.CHROME, size: { x: 0.3, y: 0.7, z: 0.3 } },
    // Sink
    { position: { x: 15.5, y: ft + 1, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 0.5, z: 1 } },
    // Sink pedestal
    { position: { x: 15.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 0.8, y: 1, z: 0.8 } },
    // Toilet
    { position: { x: 18.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: 18.5, y: ft + 1, z: 3.2 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 0.5, z: 0.8 } },
    // Mirror above sink
    { position: { x: 15.5, y: ft + 3, z: 7.6 }, color: 0xc0d8e8, size: { x: 2, y: 2, z: 0.3 } },
    // Towel rail
    { position: { x: 18, y: ft + 2.5, z: 7.6 }, color: PALETTE.CHROME, size: { x: 2, y: 0.3, z: 0.3 } },
    // Towel (on rail)
    { position: { x: 18, y: ft + 1.5, z: 7.3 }, color: 0x4a9b9b, size: { x: 1.5, y: 2, z: 0.3 } },
  ])
}

// Floor 2: Study (x=20..27)
function buildStudy(group: THREE.Group): void {
  const baseY = floorY(2)
  const ft = baseY + 1

  addVoxels(group, [
    // Desk (L-shaped: main desk + side return)
    { position: { x: 23, y: ft + 0.5, z: 7 }, color: PALETTE.DESK, size: { x: 5, y: 1, z: 2 } },
    { position: { x: 21, y: ft + 0.5, z: 5.5 }, color: PALETTE.DESK, size: { x: 1.5, y: 1, z: 1 } },
    // Computer monitor
    { position: { x: 22.5, y: ft + 1.75, z: 7.3 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 1.5, z: 0.3 } },
    // Keyboard
    { position: { x: 22.5, y: ft + 1, z: 6.4 }, color: PALETTE.STOVE, size: { x: 2, y: 0.2, z: 0.8 } },
    // Desk chair
    { position: { x: 23, y: ft + 0.5, z: 5 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: 23, y: ft + 1.5, z: 5.7 }, color: PALETTE.SOFA, size: { x: 1.5, y: 2, z: 0.5 } },
    // Tall bookshelf (left side)
    { position: { x: 21, y: ft + 2.5, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 2, y: 5, z: 0.8 } },
    // Book spines (color accents)
    { position: { x: 20.5, y: ft + 1, z: 7.2 }, color: 0x8b3a3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 21, y: ft + 2, z: 7.2 }, color: 0x3a5a8b, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 21.5, y: ft + 3.5, z: 7.2 }, color: 0x3a8b3a, size: { x: 0.5, y: 1, z: 0.3 } },
    // Tall bookshelf (right side)
    { position: { x: 25.5, y: ft + 2.5, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 2, y: 5, z: 0.8 } },
    // More book accents
    { position: { x: 25, y: ft + 1, z: 7.2 }, color: 0x8b6a3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 26, y: ft + 2.5, z: 7.2 }, color: 0x6a3a8b, size: { x: 0.5, y: 1, z: 0.3 } },
    // Desk lamp
    { position: { x: 24.5, y: ft + 1, z: 6.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 2, z: 0.2 } },
    { position: { x: 24.5, y: ft + 2.2, z: 6.3 }, color: 0xfff4c0, size: { x: 0.7, y: 0.3, z: 0.7 } },
  ])
}

// Floor 3: Music Room / Piano Room (x=1..16) — LCP-inspired
function buildMusicRoom(group: THREE.Group): void {
  const baseY = floorY(3)
  const ft = baseY + 1

  addVoxels(group, [
    // Upright piano (against back-left wall)
    { position: { x: 4, y: ft + 2, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 4, y: 4, z: 1 } },
    // Piano keys (lighter strip on front)
    { position: { x: 4, y: ft + 0.5, z: 7.1 }, color: PALETTE.CEILING, size: { x: 3.5, y: 0.5, z: 0.5 } },
    // Piano black keys (dark accent)
    { position: { x: 3.5, y: ft + 0.8, z: 6.9 }, color: PALETTE.TV_SCREEN, size: { x: 0.4, y: 0.4, z: 0.3 } },
    { position: { x: 4.5, y: ft + 0.8, z: 6.9 }, color: PALETTE.TV_SCREEN, size: { x: 0.4, y: 0.4, z: 0.3 } },
    // Piano bench
    { position: { x: 4, y: ft + 0.5, z: 5.5 }, color: PALETTE.WARDROBE, size: { x: 2.5, y: 1, z: 1 } },
    // Record player / stereo on cabinet
    { position: { x: 10, y: ft + 0.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 3, y: 1, z: 1 } },
    { position: { x: 10, y: ft + 1.5, z: 7.3 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 0.5, z: 0.5 } },
    // Speakers (either side)
    { position: { x: 7.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 1.5, y: 3, z: 1 } },
    { position: { x: 12.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 1.5, y: 3, z: 1 } },
    // Couch (center)
    { position: { x: 8, y: ft + 0.5, z: 4.5 }, color: PALETTE.SOFA, size: { x: 4, y: 1, z: 1.5 } },
    { position: { x: 8, y: ft + 1.5, z: 5.2 }, color: PALETTE.SOFA, size: { x: 4, y: 1.5, z: 0.5 } },
    // Rug
    { position: { x: 8, y: ft + 0.1, z: 4.5 }, color: 0x8b3a5a, size: { x: 6, y: 0.1, z: 4 } },
    // Easel (right side, against back wall so character transit path doesn't clip it)
    { position: { x: 14, y: ft + 2, z: 7 }, color: PALETTE.STAIRCASE, size: { x: 0.5, y: 4, z: 0.5 } },
    { position: { x: 14, y: ft + 3, z: 6.5 }, color: PALETTE.CEILING, size: { x: 2, y: 2, z: 0.3 } },
  ])
}

// Floor 3: Library (x=16..27)
function buildLibrary(group: THREE.Group): void {
  const baseY = floorY(3)
  const ft = baseY + 1

  addVoxels(group, [
    // Three tall bookshelves across the back wall
    { position: { x: 18, y: ft + 2.5, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 3, y: 5, z: 0.8 } },
    { position: { x: 21.5, y: ft + 2.5, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 3, y: 5, z: 0.8 } },
    { position: { x: 25, y: ft + 2.5, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 3, y: 5, z: 0.8 } },
    // Book color accents on shelves
    { position: { x: 17.5, y: ft + 1, z: 7.2 }, color: 0x8b3a3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 18.5, y: ft + 2, z: 7.2 }, color: 0x3a5a8b, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 19, y: ft + 3.5, z: 7.2 }, color: 0x3a8b3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 21, y: ft + 1.5, z: 7.2 }, color: 0x8b6a3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 22.5, y: ft + 3, z: 7.2 }, color: 0x6a3a8b, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: 24.5, y: ft + 2, z: 7.2 }, color: 0x8b8b3a, size: { x: 0.5, y: 1, z: 0.3 } },
    // Reading armchair
    { position: { x: 19, y: ft + 0.5, z: 4.5 }, color: PALETTE.WARDROBE, size: { x: 2, y: 1, z: 2 } },
    { position: { x: 19, y: ft + 1.5, z: 5.4 }, color: PALETTE.WARDROBE, size: { x: 2, y: 2, z: 0.5 } },
    // Side table (with lamp)
    { position: { x: 21, y: ft + 0.5, z: 4 }, color: PALETTE.DESK, size: { x: 1, y: 1, z: 1 } },
    { position: { x: 21, y: ft + 1, z: 4 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 2, z: 0.2 } },
    { position: { x: 21, y: ft + 2.1, z: 4 }, color: 0xfff4c0, size: { x: 0.8, y: 0.3, z: 0.8 } },
    // Writing desk (right side)
    { position: { x: 24.5, y: ft + 0.5, z: 4 }, color: PALETTE.DESK, size: { x: 3, y: 1, z: 1.5 } },
    // Quill / pen pot
    { position: { x: 25, y: ft + 1.2, z: 3.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.4, y: 1, z: 0.4 } },
    // Rug
    { position: { x: 21.5, y: ft + 0.1, z: 4.5 }, color: 0x3a5a3a, size: { x: 8, y: 0.1, z: 5 } },
  ])
}

// ---------------------------------------------------------------------------
// Staircase builder
// ---------------------------------------------------------------------------

function buildStaircase(group: THREE.Group): void {
  // Staircase corridor: x = STAIR_X_START..HOUSE_WIDTH (27..32), 5 wide.
  // Steps are 3 wide, centered in the corridor.
  // 8 steps per floor (one step per voxel of FLOOR_HEIGHT).
  // Steps rise in Y and advance in Z (front→back).

  const stairSteps = FLOOR_HEIGHT
  const stepCenterX = STAIR_X_START + 2.5  // = 29.5
  const stepWidth = 3
  const startZ = 0.5

  for (let f = 1; f <= FLOOR_COUNT - 1; f++) {
    const baseY = floorY(f as 1 | 2 | 3)

    for (let step = 0; step < stairSteps; step++) {
      const stepTopY = baseY + 1 + (step + 1)
      const stepCenterY = stepTopY - 0.5
      const stepCenterZ = startZ + step + 0.5

      group.add(
        makeVoxel(
          { x: stepCenterX, y: stepCenterY, z: stepCenterZ },
          PALETTE.STAIRCASE,
          { x: stepWidth, y: 1, z: 1 },
        ),
      )
    }

    // Landing platform at the top
    const landingTopY = baseY + FLOOR_HEIGHT + 1
    group.add(
      makeVoxel(
        { x: stepCenterX, y: landingTopY - 0.5, z: startZ + stairSteps + 0.5 },
        PALETTE.STAIRCASE,
        { x: stepWidth, y: 1, z: 1 },
      ),
    )
  }
}

// ---------------------------------------------------------------------------
// Room bounds registry
// ---------------------------------------------------------------------------

export function getRooms(): Room[] {
  return [
    {
      id: 'entrance_hall',
      floor: 1,
      bounds: {
        min: { x: 1, y: floorY(1), z: 1 },
        max: { x: 4, y: floorY(1) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'living_room',
      floor: 1,
      bounds: {
        min: { x: 4, y: floorY(1), z: 1 },
        max: { x: 16, y: floorY(1) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'kitchen',
      floor: 1,
      bounds: {
        min: { x: 16, y: floorY(1), z: 1 },
        max: { x: STAIR_X_START, y: floorY(1) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'bedroom',
      floor: 2,
      bounds: {
        min: { x: 1, y: floorY(2), z: 1 },
        max: { x: 14, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'study',
      floor: 2,
      bounds: {
        min: { x: 20, y: floorY(2), z: 1 },
        max: { x: STAIR_X_START, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'bathroom',
      floor: 2,
      bounds: {
        min: { x: 14, y: floorY(2), z: 1 },
        max: { x: 20, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'hobby_room',
      floor: 3,
      bounds: {
        min: { x: 1, y: floorY(3), z: 1 },
        max: { x: 16, y: floorY(3) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'storage',
      floor: 3,
      bounds: {
        min: { x: 16, y: floorY(3), z: 1 },
        max: { x: STAIR_X_START, y: floorY(3) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'staircase',
      floor: 1,
      bounds: {
        min: { x: STAIR_X_START, y: 0, z: 1 },
        max: { x: HOUSE_WIDTH - 1, y: FLOOR_HEIGHT * FLOOR_COUNT, z: HOUSE_DEPTH - 1 },
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Main house builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bathroom door — swings closed when character is inside
// ---------------------------------------------------------------------------

/**
 * Builds a bathroom door panel on a pivot group so it can swing open/closed.
 * Hinge is on the left edge (bedroom side). When closed (rotation.y = 0)
 * the panel covers the bathroom's front opening. When open (rotation.y = -PI/2)
 * the panel tucks alongside the bedroom-side wall, out of view.
 */
function buildBathroomDoor(): THREE.Group {
  const baseY = floorY(2)
  const wallH = FLOOR_HEIGHT - 1 // same as interior wall height
  const doorWidth = 5.5           // from hinge (x=15) to study wall (x=20.5)
  const doorThickness = 0.3

  // Pivot group — positioned at the hinge point
  const pivot = new THREE.Group()
  pivot.position.set(15, baseY + wallH / 2 + 1, 0.15)

  // Door panel — offset so its left edge sits at the pivot (hinge)
  const geo = new THREE.BoxGeometry(doorWidth, wallH, doorThickness)
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.DOOR })
  const panel = new THREE.Mesh(geo, mat)
  panel.position.set(doorWidth / 2, 0, 0) // left edge at pivot
  panel.castShadow = true
  panel.receiveShadow = true
  pivot.add(panel)

  // Door knob
  const knobGeo = new THREE.BoxGeometry(0.25, 0.25, 0.2)
  const knobMat = new THREE.MeshLambertMaterial({ color: PALETTE.CHROME })
  const knob = new THREE.Mesh(knobGeo, knobMat)
  knob.position.set(doorWidth - 0.6, -0.5, -doorThickness / 2 - 0.1)
  pivot.add(knob)

  // Start with door open
  pivot.rotation.y = -Math.PI / 2

  return pivot
}

// ---------------------------------------------------------------------------
// House result type
// ---------------------------------------------------------------------------

export interface HouseResult {
  group: THREE.Group
  bathroomDoor: THREE.Group
}

/**
 * Builds the complete house geometry as a THREE.Group.
 * The house origin is at (0,0,0) — bottom-left-front corner.
 *
 * Layout (LCP-inspired, left→right):
 *   Floor 1: Entry Hall (x 1–4) | Living Room (x 4–16) | Kitchen (x 16–27) | Staircase (x 27–32)
 *   Floor 2: Bedroom (x 1–14) | Bathroom (x 14–20) | Study (x 20–27) | Staircase
 *   Floor 3: Music Room (x 1–16) | Library (x 16–27) | Staircase
 */
export function buildHouse(): HouseResult {
  const house = new THREE.Group()

  for (const floor of [1, 2, 3] as const) {
    buildFloorShell(house, floor)
    buildInteriorWalls(house, floor)
  }

  buildEntranceHall(house)
  buildLivingRoom(house)
  buildKitchen(house)
  buildBedroom(house)
  buildBathroom(house)
  buildStudy(house)
  buildMusicRoom(house)
  buildLibrary(house)
  buildStaircase(house)

  // Bathroom door is a separate group so we can animate it
  const bathroomDoor = buildBathroomDoor()
  house.add(bathroomDoor)

  return { group: house, bathroomDoor }
}
