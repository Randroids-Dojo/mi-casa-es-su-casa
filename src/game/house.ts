import * as THREE from 'three'
import { PALETTE } from './palette'
import type { Vec3, Room, VoxelSpec } from './types'

// ---------------------------------------------------------------------------
// House constants
// ---------------------------------------------------------------------------

/** Width of the house in voxels */
export const HOUSE_WIDTH = 16
/** Height per floor in voxels (walls + ceiling) */
export const FLOOR_HEIGHT = 8
/** Depth of the house in voxels */
export const HOUSE_DEPTH = 8
/** Wall thickness in voxels */
export const WALL_THICKNESS = 1
/** Number of floors */
export const FLOOR_COUNT = 3

// Staircase occupies the rightmost 2 columns
const STAIR_X_START = HOUSE_WIDTH - 3

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
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  const material = new THREE.MeshLambertMaterial({ color })
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
 * - Ceiling slab
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

  // Floor slab — full width, full depth, 1 voxel thick
  // Centered at X=hw/2, Y=baseY+0.5, Z=hd/2
  group.add(
    makeVoxel(
      { x: hw / 2, y: baseY + 0.5, z: hd / 2 },
      PALETTE.FLOOR_WOOD,
      { x: hw, y: wt, z: hd },
    ),
  )

  // Ceiling slab (= floor slab for the floor above, drawn here as ceiling)
  // For floors 1 and 2, the ceiling is the floor of the next level — no
  // separate slab needed. For floor 3 (top floor) we intentionally omit
  // the roof to keep the dollhouse open to the sky.

  // Left exterior wall (x=0)
  group.add(
    makeVoxel(
      { x: 0.5, y: baseY + FLOOR_HEIGHT / 2, z: hd / 2 },
      PALETTE.WALL_EXTERIOR,
      { x: wt, y: FLOOR_HEIGHT, z: hd },
    ),
  )

  // Right exterior wall (x=hw-1)
  group.add(
    makeVoxel(
      { x: hw - 0.5, y: baseY + FLOOR_HEIGHT / 2, z: hd / 2 },
      PALETTE.WALL_EXTERIOR,
      { x: wt, y: FLOOR_HEIGHT, z: hd },
    ),
  )

  // Back exterior wall (z=hd-1)
  group.add(
    makeVoxel(
      { x: hw / 2, y: baseY + FLOOR_HEIGHT / 2, z: hd - 0.5 },
      PALETTE.WALL_EXTERIOR,
      { x: hw, y: FLOOR_HEIGHT, z: wt },
    ),
  )
}

// ---------------------------------------------------------------------------
// Interior room divider walls
// ---------------------------------------------------------------------------

function buildInteriorWalls(group: THREE.Group, floor: 1 | 2 | 3): void {
  const baseY = floorY(floor)
  const hd = HOUSE_DEPTH
  const wallH = FLOOR_HEIGHT - 1 // leave floor/ceiling gap
  const wt = WALL_THICKNESS

  // Interior walls run the full depth of the house:
  // from z=0 (front opening) to z=hd-1 (inner face of back wall).
  // Center at (hd-1)/2, size = hd-1 so walls reach the back wall.
  const wallZCenter = (hd - 1) / 2  // = 3.5
  const wallZSize = hd - 1           // = 7

  if (floor === 1) {
    // Divide living room / kitchen: vertical wall at x=9
    // Leave gap at bottom 1 voxel for floor
    group.add(
      makeVoxel(
        { x: 9.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
      ),
    )

    // Entrance hall: narrow wall separating entrance from living room at x=4
    group.add(
      makeVoxel(
        { x: 4.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
      ),
    )
  } else if (floor === 2) {
    // Bedroom / study divider at x=6
    group.add(
      makeVoxel(
        { x: 6.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
      ),
    )

    // Study / bathroom divider at x=10
    group.add(
      makeVoxel(
        { x: 10.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
      ),
    )
  } else if (floor === 3) {
    // Hobby room / storage divider at x=9
    group.add(
      makeVoxel(
        { x: 9.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
      ),
    )
  }
}

// ---------------------------------------------------------------------------
// Furniture builders per room
// ---------------------------------------------------------------------------

function buildLivingRoom(group: THREE.Group): void {
  const baseY = floorY(1)
  const floorTop = baseY + 1 // top face of floor slab

  // Sofa — 3 wide × 1 deep × 1 tall seat, with 1-tall back
  addVoxels(group, [
    // Sofa seat
    { position: { x: 2, y: floorTop + 0.5, z: 6 }, color: PALETTE.SOFA, size: { x: 3, y: 1, z: 1 } },
    // Sofa back
    { position: { x: 2, y: floorTop + 1.5, z: 6.5 }, color: PALETTE.SOFA, size: { x: 3, y: 1, z: 0.5 } },
    // TV on a small stand
    { position: { x: 2, y: floorTop + 0.5, z: 1.5 }, color: PALETTE.DESK, size: { x: 2, y: 1, z: 1 } },
    { position: { x: 2, y: floorTop + 1.5, z: 1.5 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 1, z: 0.5 } },
    // Bookshelf against back wall
    { position: { x: 3.5, y: floorTop + 1.5, z: 7 }, color: PALETTE.BOOKSHELF, size: { x: 1, y: 2, z: 1 } },
  ])
}

function buildKitchen(group: THREE.Group): void {
  const baseY = floorY(1)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Counter along back wall
    { position: { x: 12, y: floorTop + 0.5, z: 7 }, color: PALETTE.COUNTER, size: { x: 3, y: 1, z: 1 } },
    // Stove on counter
    { position: { x: 11, y: floorTop + 1.5, z: 7 }, color: PALETTE.STOVE, size: { x: 1, y: 1, z: 0.5 } },
    // Fridge — tall (2 high)
    { position: { x: 13.5, y: floorTop + 1, z: 6.5 }, color: PALETTE.FRIDGE, size: { x: 1, y: 2, z: 1 } },
    // Dining table
    { position: { x: 11.5, y: floorTop + 0.5, z: 5.5 }, color: PALETTE.TABLE, size: { x: 2, y: 1, z: 2 } },
    // Table legs (implied by table slab; skip for MVP blocky style)
  ])
}

function buildEntranceHall(group: THREE.Group): void {
  const baseY = floorY(1)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Front door (open cutaway — just the frame color on the back wall side)
    { position: { x: 2, y: floorTop + 1.5, z: 7 }, color: PALETTE.DOOR, size: { x: 2, y: 3, z: 0.5 } },
    // Coat rack (narrow vertical)
    { position: { x: 1.5, y: floorTop + 1.5, z: 5 }, color: PALETTE.BOOKSHELF, size: { x: 0.5, y: 3, z: 0.5 } },
  ])
}

function buildBedroom(group: THREE.Group): void {
  const baseY = floorY(2)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Bed — 3 wide × 2 deep
    { position: { x: 3, y: floorTop + 0.5, z: 6 }, color: PALETTE.BED, size: { x: 3, y: 1, z: 2 } },
    // Pillow
    { position: { x: 3, y: floorTop + 1, z: 5.5 }, color: PALETTE.CEILING, size: { x: 2, y: 0.5, z: 0.5 } },
    // Nightstand
    { position: { x: 5, y: floorTop + 0.5, z: 6.5 }, color: PALETTE.DESK, size: { x: 1, y: 1, z: 1 } },
    // Wardrobe — 2 wide × 2 tall
    { position: { x: 2, y: floorTop + 1.5, z: 7 }, color: PALETTE.WARDROBE, size: { x: 2, y: 3, z: 1 } },
  ])
}

function buildStudy(group: THREE.Group): void {
  const baseY = floorY(2)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Desk
    { position: { x: 8, y: floorTop + 0.5, z: 6.5 }, color: PALETTE.DESK, size: { x: 3, y: 1, z: 2 } },
    // Computer monitor (on desk)
    { position: { x: 8, y: floorTop + 1.5, z: 7 }, color: PALETTE.TV_SCREEN, size: { x: 1, y: 1, z: 0.5 } },
    // Chair (in front of desk, behind character walk path)
    { position: { x: 8, y: floorTop + 0.5, z: 5.5 }, color: PALETTE.SOFA, size: { x: 1, y: 1, z: 1 } },
    // Bookshelf on the wall
    { position: { x: 9.5, y: floorTop + 1.5, z: 7 }, color: PALETTE.BOOKSHELF, size: { x: 1, y: 2, z: 1 } },
  ])
}

function buildBathroom(group: THREE.Group): void {
  const baseY = floorY(2)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Bathtub
    { position: { x: 12, y: floorTop + 0.5, z: 6.5 }, color: PALETTE.COUNTER, size: { x: 2, y: 1, z: 2 } },
    // Bathtub interior (slightly recessed, lighter color)
    { position: { x: 12, y: floorTop + 0.75, z: 6.5 }, color: PALETTE.WALL_INTERIOR, size: { x: 1.5, y: 0.5, z: 1.5 } },
    // Sink — small
    { position: { x: 11.5, y: floorTop + 1, z: 2 }, color: PALETTE.FRIDGE, size: { x: 1, y: 1, z: 1 } },
    // Toilet
    { position: { x: 13, y: floorTop + 0.5, z: 2 }, color: PALETTE.FRIDGE, size: { x: 1, y: 1, z: 1 } },
  ])
}

function buildHobbyRoom(group: THREE.Group): void {
  const baseY = floorY(3)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Easel (angled stand — approximate with two voxels)
    { position: { x: 4, y: floorTop + 1.5, z: 5 }, color: PALETTE.BOOKSHELF, size: { x: 0.5, y: 3, z: 0.5 } },
    // Canvas on easel
    { position: { x: 4, y: floorTop + 2.5, z: 4.5 }, color: PALETTE.CEILING, size: { x: 1.5, y: 1.5, z: 0.25 } },
    // Workbench
    { position: { x: 6.5, y: floorTop + 0.5, z: 6.5 }, color: PALETTE.DESK, size: { x: 3, y: 1, z: 2 } },
    // Instrument (small block)
    { position: { x: 2, y: floorTop + 1, z: 3 }, color: PALETTE.SOFA, size: { x: 1, y: 1, z: 0.5 } },
  ])
}

function buildStorage(group: THREE.Group): void {
  const baseY = floorY(3)
  const floorTop = baseY + 1

  addVoxels(group, [
    // Boxes stacked
    { position: { x: 11, y: floorTop + 0.5, z: 7 }, color: PALETTE.TABLE, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: 12.5, y: floorTop + 0.5, z: 7 }, color: PALETTE.DESK, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: 11.5, y: floorTop + 1.5, z: 7 }, color: PALETTE.BOOKSHELF, size: { x: 1.5, y: 1, z: 1.5 } },
    // Old furniture (low block)
    { position: { x: 12, y: floorTop + 0.5, z: 5.5 }, color: PALETTE.WARDROBE, size: { x: 2, y: 1, z: 2 } },
  ])
}

// ---------------------------------------------------------------------------
// Staircase builder
// ---------------------------------------------------------------------------

function buildStaircase(group: THREE.Group): void {
  // Proper voxel staircase: each step rises 1 unit in Y and advances 1 unit
  // in Z, creating the classic ascending staircase silhouette.
  //
  // With FLOOR_HEIGHT=8 we use 8 steps per floor so rise = 8/8 = 1 unit/step.
  // Steps run in the Z direction (front→back) inside the right-side corridor.
  //
  // Step i (0-indexed within a floor):
  //   top-face Y  = baseY + 1 + (i + 1)       — each step 1 unit above the last
  //   center Y    = baseY + 1 + (i + 1) - 0.5  — center of 1-unit-tall block
  //   center Z    = startZ + i + 0.5            — 1 unit deep per step, no overlap
  //
  // The step is 2 units wide in X (corridor width) and 1×1 in Y×Z.

  const stairSteps = FLOOR_HEIGHT // one step per voxel of floor height = 8 steps
  const stepCenterX = STAIR_X_START + 1 // x=14, middle of the staircase corridor
  const stepWidth = 2 // corridor width in X
  const startZ = 0.5 // first step starts at the front edge of the corridor

  for (let f = 1; f <= FLOOR_COUNT - 1; f++) {
    const baseY = floorY(f as 1 | 2 | 3)

    for (let step = 0; step < stairSteps; step++) {
      // Top of this step is 1 unit above the previous; the block is 1 unit tall.
      const stepTopY = baseY + 1 + (step + 1)
      const stepCenterY = stepTopY - 0.5

      // Each step is 1 unit deep in Z, advancing toward the back wall.
      const stepCenterZ = startZ + step + 0.5

      group.add(
        makeVoxel(
          { x: stepCenterX, y: stepCenterY, z: stepCenterZ },
          PALETTE.STAIRCASE,
          { x: stepWidth, y: 1, z: 1 },
        ),
      )
    }

    // Landing platform at the top of the run — flush with the floor above.
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
        min: { x: 5, y: floorY(1), z: 1 },
        max: { x: 9, y: floorY(1) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'kitchen',
      floor: 1,
      bounds: {
        min: { x: 10, y: floorY(1), z: 1 },
        max: { x: STAIR_X_START, y: floorY(1) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'bedroom',
      floor: 2,
      bounds: {
        min: { x: 1, y: floorY(2), z: 1 },
        max: { x: 6, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'study',
      floor: 2,
      bounds: {
        min: { x: 7, y: floorY(2), z: 1 },
        max: { x: 10, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'bathroom',
      floor: 2,
      bounds: {
        min: { x: 11, y: floorY(2), z: 1 },
        max: { x: STAIR_X_START, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'hobby_room',
      floor: 3,
      bounds: {
        min: { x: 1, y: floorY(3), z: 1 },
        max: { x: 9, y: floorY(3) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'storage',
      floor: 3,
      bounds: {
        min: { x: 10, y: floorY(3), z: 1 },
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

/**
 * Builds the complete house geometry as a THREE.Group.
 * The house origin is at (0,0,0) — bottom-left-front corner.
 */
export function buildHouse(): THREE.Group {
  const house = new THREE.Group()

  // Build floor shells (structure)
  for (const floor of [1, 2, 3] as const) {
    buildFloorShell(house, floor)
    buildInteriorWalls(house, floor)
  }

  // Build furniture per room
  buildLivingRoom(house)
  buildKitchen(house)
  buildEntranceHall(house)
  buildBedroom(house)
  buildStudy(house)
  buildBathroom(house)
  buildHobbyRoom(house)
  buildStorage(house)

  // Build staircase
  buildStaircase(house)

  return house
}
