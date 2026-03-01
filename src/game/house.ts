import * as THREE from 'three'
import { PALETTE } from './palette'
import type { Vec3, Room, VoxelSpec } from './types'
import type { HouseLayout, LayoutRoomId, RoomSlot } from '@/lib/layout'

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
// Interior room divider walls — layout-driven
// ---------------------------------------------------------------------------

function buildInteriorWalls(
  group: THREE.Group,
  floor: 1 | 2 | 3,
  wallXPositions: number[],
  stairBounds?: { xMin: number; xMax: number },
): void {
  const baseY = floorY(floor)
  const hd = HOUSE_DEPTH
  const wallH = FLOOR_HEIGHT - 1
  const wt = WALL_THICKNESS

  const wallZCenter = (hd - 1) / 2  // 3.5
  const wallZSize = hd - 1           // 7

  function addWall(wallX: number): void {
    group.add(
      makeVoxel(
        { x: wallX + 0.5, y: baseY + wallH / 2 + 1, z: wallZCenter },
        PALETTE.WALL_INTERIOR,
        { x: wt, y: wallH, z: wallZSize },
        true,
      ),
    )
  }

  // Left staircase divider: between room-below and staircase (exists when staircase not at leftmost position)
  if (stairBounds && stairBounds.xMin > 1) {
    addWall(stairBounds.xMin)
  }

  // Right staircase divider: between staircase and room-above (exists when staircase not at rightmost position)
  if (stairBounds && stairBounds.xMax < HOUSE_WIDTH) {
    addWall(stairBounds.xMax - 1)
  }

  // Room-to-room interior walls from layout
  for (const wallX of wallXPositions) {
    addWall(wallX)
  }
}

// ---------------------------------------------------------------------------
// Furniture builders — parameterized by (group, xMin, xMax, floor)
//
// Each room builder places furniture using anchor-based positioning:
//   cx = center of room, xMin/xMax = edges, ft = floor top surface Y
// Furniture sizes are unchanged; only positions adapt to room bounds.
// Non-essential furniture is conditionally omitted when room is too narrow.
// ---------------------------------------------------------------------------

function buildEntranceRoom(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2

  addVoxels(group, [
    // Front door frame on back wall — centered
    { position: { x: cx, y: ft + 2, z: 7.5 }, color: PALETTE.DOOR, size: { x: 2, y: 4, z: 0.5 } },
    // Coat rack — left side
    { position: { x: xMin + 0.5, y: ft + 2, z: 5 }, color: PALETTE.BOOKSHELF, size: { x: 0.5, y: 4, z: 0.5 } },
    // Coat rack hooks
    { position: { x: xMin + 0.75, y: ft + 3, z: 4.8 }, color: PALETTE.DESK, size: { x: 0.5, y: 0.5, z: 0.4 } },
    { position: { x: xMin + 0.75, y: ft + 2, z: 4.8 }, color: PALETTE.DESK, size: { x: 0.5, y: 0.5, z: 0.4 } },
    // Entry rug — centered
    { position: { x: cx, y: ft + 0.1, z: 4 }, color: PALETTE.SOFA, size: { x: 2, y: 0.1, z: 3 } },
  ])
}

function buildLivingRoomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  const specs: VoxelSpec[] = [
    // Sofa — centered, back area
    { position: { x: cx, y: ft + 0.5, z: 6.5 }, color: PALETTE.SOFA, size: { x: 5, y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 7.2 }, color: PALETTE.SOFA, size: { x: 5, y: 2, z: 0.5 } },
    // Sofa cushions — raised to sit on top of sofa base (y=ft+1) to avoid embedded geometry z-fighting
    { position: { x: cx - 1, y: ft + 1.25, z: 6 }, color: PALETTE.BED, size: { x: 1, y: 0.5, z: 1 } },
    { position: { x: cx + 1, y: ft + 1.25, z: 6 }, color: PALETTE.BED, size: { x: 1, y: 0.5, z: 1 } },
    // TV stand — centered, front
    { position: { x: cx, y: ft + 0.5, z: 1.5 }, color: PALETTE.DESK, size: { x: 4, y: 1, z: 1 } },
    // TV screen
    { position: { x: cx, y: ft + 1.75, z: 1.6 }, color: PALETTE.TV_SCREEN, size: { x: 3.5, y: 2, z: 0.3 } },
    // Coffee table — centered
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.TABLE, size: { x: 3, y: 0.5, z: 1.5 } },
    // Bookshelf — left side, back wall
    { position: { x: xMin + 1.5, y: ft + 2, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 2, y: 4, z: 0.5 } },
    // Books on shelf (z=7.2 keeps front face at 7.05, clear of shelf front at 7.25)
    { position: { x: xMin + 1, y: ft + 1, z: 7.2 }, color: 0x8b3a3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: xMin + 1.5, y: ft + 2, z: 7.2 }, color: 0x3a6b3a, size: { x: 0.5, y: 1, z: 0.3 } },
    { position: { x: xMin + 2, y: ft + 3, z: 7.2 }, color: 0x3a3a8b, size: { x: 0.5, y: 1, z: 0.3 } },
    // Lamp — left side (shade at ft+2.3 clears pole top face at ft+2)
    { position: { x: xMin + 2, y: ft + 1, z: 4.5 }, color: PALETTE.FRIDGE, size: { x: 0.3, y: 2, z: 0.3 } },
    { position: { x: xMin + 2, y: ft + 2.3, z: 4.5 }, color: 0xfff4c0, size: { x: 0.8, y: 0.4, z: 0.8 } },
  ]

  // Fireplace + armchair — right side (only if room is wide enough)
  if (w >= 10) {
    specs.push(
      // Fireplace
      { position: { x: xMax - 1.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 2, y: 3, z: 1 } },
      { position: { x: xMax - 1.5, y: ft + 3, z: 7.2 }, color: PALETTE.STAIRCASE, size: { x: 3, y: 0.5, z: 1.5 } },
      { position: { x: xMax - 1.5, y: ft + 0.5, z: 7.3 }, color: 0xe05c1a, size: { x: 1.2, y: 1, z: 0.5 } },
      // Armchair
      { position: { x: cx + 2, y: ft + 0.5, z: 5 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1, z: 1.5 } },
      { position: { x: cx + 2, y: ft + 1.5, z: 5.7 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1.5, z: 0.5 } },
    )
  }

  addVoxels(group, specs)
}

function buildKitchenFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin
  const counterW = Math.min(w - 2, 9)

  const specs: VoxelSpec[] = [
    // Counter along back wall — centered
    { position: { x: cx, y: ft + 0.5, z: 7.5 }, color: PALETTE.COUNTER, size: { x: counterW, y: 1, z: 1 } },
    // Counter backsplash
    { position: { x: cx, y: ft + 2, z: 7.8 }, color: 0xd0e8e8, size: { x: counterW, y: 2, z: 0.3 } },
    // Stove — left side of counter
    { position: { x: xMin + 2.5, y: ft + 1.5, z: 7.3 }, color: PALETTE.STOVE, size: { x: 2, y: 1, z: 0.7 } },
    // Stove top burners
    { position: { x: xMin + 2, y: ft + 2, z: 7.2 }, color: 0x444444, size: { x: 0.7, y: 0.3, z: 0.7 } },
    { position: { x: xMin + 3, y: ft + 2, z: 7.2 }, color: 0x444444, size: { x: 0.7, y: 0.3, z: 0.7 } },
    // Sink — center of counter
    { position: { x: cx, y: ft + 1.5, z: 7.3 }, color: PALETTE.FRIDGE, size: { x: 1.5, y: 0.7, z: 0.7 } },
    // Fridge — right side
    { position: { x: xMax - 1.5, y: ft + 2, z: 7 }, color: PALETTE.FRIDGE, size: { x: 1.5, y: 4, z: 1.5 } },
    // Fridge handle
    { position: { x: xMax - 2.1, y: ft + 2, z: 7 }, color: PALETTE.STOVE, size: { x: 0.2, y: 2, z: 0.3 } },
    // Dining table — centered
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.TABLE, size: { x: 4, y: 1, z: 2.5 } },
    // Table legs
    { position: { x: cx - 1.5, y: ft + 0.5, z: 3.5 }, color: PALETTE.DESK, size: { x: 0.3, y: 1, z: 0.3 } },
    { position: { x: cx + 1.5, y: ft + 0.5, z: 3.5 }, color: PALETTE.DESK, size: { x: 0.3, y: 1, z: 0.3 } },
    // Chairs
    { position: { x: cx - 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.WARDROBE, size: { x: 1, y: 1, z: 1 } },
    { position: { x: cx + 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.WARDROBE, size: { x: 1, y: 1, z: 1 } },
  ]

  // Upper cabinet (only if wide enough)
  if (w >= 8) {
    specs.push(
      { position: { x: xMin + 4, y: ft + 4.5, z: 7.6 }, color: PALETTE.COUNTER, size: { x: 4, y: 2, z: 0.7 } },
    )
  }

  addVoxels(group, specs)
}

function buildBedroomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  const specs: VoxelSpec[] = [
    // Bed — centered, back area
    { position: { x: cx, y: ft + 0.5, z: 6.5 }, color: PALETTE.BED, size: { x: 5, y: 1, z: 2 } },
    // Duvet — depth 1.8 (not 2) so its front/back faces don't coincide with the bed's (z=5.5 and z=7.5)
    { position: { x: cx, y: ft + 1, z: 6.5 }, color: 0xb8a0cc, size: { x: 4.5, y: 0.3, z: 1.8 } },
    // Pillows — raised to sit on top of bed (y=ft+1) to avoid embedded geometry z-fighting
    { position: { x: cx - 1.5, y: ft + 1.25, z: 5.7 }, color: PALETTE.CEILING, size: { x: 1.5, y: 0.5, z: 0.8 } },
    { position: { x: cx + 1, y: ft + 1.25, z: 5.7 }, color: PALETTE.CEILING, size: { x: 1.5, y: 0.5, z: 0.8 } },
    // Headboard — centered, back wall
    { position: { x: cx, y: ft + 2, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 5.5, y: 3, z: 0.5 } },
    // Rug — centered
    { position: { x: cx, y: ft + 0.1, z: 4.5 }, color: 0x7a5cb8, size: { x: Math.min(7, w - 2), y: 0.1, z: 3 } },
  ]

  // Nightstand + lamp (left of bed; x offset keeps it clear of bed's left edge to avoid coplanar top faces)
  if (w >= 8) {
    specs.push(
      { position: { x: xMin + 0.75, y: ft + 0.5, z: 6.5 }, color: PALETTE.DESK, size: { x: 1.0, y: 1, z: 1.5 } },
      { position: { x: xMin + 0.75, y: ft + 1.5, z: 6.5 }, color: PALETTE.FRIDGE, size: { x: 0.3, y: 1, z: 0.3 } },
      { position: { x: xMin + 0.75, y: ft + 2.1, z: 6.5 }, color: 0xfff4c0, size: { x: 0.7, y: 0.3, z: 0.7 } },
    )
  }

  // Wardrobe (left side, back wall; door panels at z=7.0 for clear separation from wardrobe front at 7.1)
  if (w >= 8) {
    specs.push(
      { position: { x: xMin + 1.5, y: ft + 2.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 3, y: 5, z: 0.8 } },
      { position: { x: xMin + 1, y: ft + 2.5, z: 7.0 }, color: PALETTE.DESK, size: { x: 1, y: 4, z: 0.3 } },
      { position: { x: xMin + 2, y: ft + 2.5, z: 7.0 }, color: PALETTE.DESK, size: { x: 1, y: 4, z: 0.3 } },
    )
  }

  // Dresser (right side, back wall; rows sized to 0.9 to leave 0.1 gap and avoid shared coplanar y-face)
  if (w >= 10) {
    specs.push(
      { position: { x: xMax - 3, y: ft + 0.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 4, y: 0.9, z: 1 } },
      { position: { x: xMax - 3, y: ft + 1.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 4, y: 0.9, z: 1 } },
      { position: { x: xMax - 4, y: ft + 0.5, z: 7.1 }, color: PALETTE.FRIDGE, size: { x: 0.8, y: 0.3, z: 0.3 } },
      { position: { x: xMax - 2, y: ft + 0.5, z: 7.1 }, color: PALETTE.FRIDGE, size: { x: 0.8, y: 0.3, z: 0.3 } },
    )
  }

  addVoxels(group, specs)
}

function buildBathroomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addVoxels(group, [
    // Floor tiles
    { position: { x: cx, y: ft - 0.4, z: 4 }, color: PALETTE.TILE, size: { x: w, y: 0.1, z: 6 } },
    // Bathtub — centered, back area
    { position: { x: cx, y: ft + 0.5, z: 6.5 }, color: PALETTE.PORCELAIN, size: { x: 4, y: 1, z: 2 } },
    { position: { x: cx, y: ft + 0.9, z: 6.5 }, color: PALETTE.TILE, size: { x: 3, y: 0.5, z: 1.5 } },
    // Bath tap — left end of tub
    { position: { x: xMin + 1.3, y: ft + 1.5, z: 7 }, color: PALETTE.CHROME, size: { x: 0.3, y: 0.7, z: 0.3 } },
    // Sink — left, front
    { position: { x: xMin + 1.5, y: ft + 1, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 0.5, z: 1 } },
    // Sink pedestal
    { position: { x: xMin + 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 0.8, y: 1, z: 0.8 } },
    // Toilet — right, front
    { position: { x: xMax - 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: xMax - 1.5, y: ft + 1, z: 3.2 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 0.5, z: 0.8 } },
    // Mirror above sink — back wall
    { position: { x: xMin + 1.5, y: ft + 3, z: 7.6 }, color: 0xc0d8e8, size: { x: 2, y: 2, z: 0.3 } },
    // Towel rail — right side, back wall
    { position: { x: xMax - 2, y: ft + 2.5, z: 7.6 }, color: PALETTE.CHROME, size: { x: 2, y: 0.3, z: 0.3 } },
    // Towel
    { position: { x: xMax - 2, y: ft + 1.5, z: 7.3 }, color: 0x4a9b9b, size: { x: 1.5, y: 2, z: 0.3 } },
  ])
}

/**
 * Returns VoxelSpec[] for a fully stocked bookshelf unit.
 * Produces side panels, evenly-spaced shelf boards, and densely packed
 * colorful books on every row.
 *   x       — center x
 *   yBase   — bottom y (floor level)
 *   width   — total x width of the unit
 *   height  — total height of the unit
 *   zShelf  — z center of the shelf body (depth 0.8)
 *   zBooks  — z center of the book spines (depth 0.28)
 */
function makeBookshelfVoxels(
  x: number,
  yBase: number,
  width: number,
  height: number,
  zShelf: number,
  zBooks: number,
): VoxelSpec[] {
  const specs: VoxelSpec[] = []
  const wood = PALETTE.BOOKSHELF
  const sideW = 0.2
  const boardH = 0.15
  const shelfDepth = 0.8
  const bookDepth = 0.28
  const innerW = width - sideW * 2
  const numRows = 4
  const rowH = (height - (numRows + 1) * boardH) / numRows

  // Side panels (full height)
  specs.push(
    { position: { x: x - width / 2 + sideW / 2, y: yBase + height / 2, z: zShelf }, color: wood, size: { x: sideW, y: height, z: shelfDepth } },
    { position: { x: x + width / 2 - sideW / 2, y: yBase + height / 2, z: zShelf }, color: wood, size: { x: sideW, y: height, z: shelfDepth } },
  )

  // Shelf boards: bottom + (numRows-1) internal + top
  for (let i = 0; i <= numRows; i++) {
    const boardY = yBase + boardH / 2 + i * (rowH + boardH)
    specs.push({ position: { x, y: boardY, z: zShelf }, color: wood, size: { x: width, y: boardH, z: shelfDepth } })
  }

  // Books — deterministic, offset per row for variety
  const BOOK_COLORS = [
    0x8b1a1a, 0x1a3a7a, 0x1a5a20, 0x7a5010, 0x5a1a7a,
    0x8b3a10, 0x1a5a5a, 0x7a6010, 0x8b1a50, 0x2a4a20,
    0xa02020, 0x203070, 0x305030, 0x906020, 0x602090,
    0x4a1a0a, 0x0a2a5a, 0x2a6a10, 0x5a3a0a, 0x3a0a5a,
  ]
  const BOOK_WIDTHS = [0.36, 0.30, 0.42, 0.28, 0.38, 0.44, 0.30, 0.34, 0.40, 0.28, 0.38, 0.32]
  const BOOK_H_FACTORS = [0.92, 0.82, 0.95, 0.76, 0.88, 0.93, 0.75, 0.90, 0.85, 0.79, 0.94, 0.77]

  for (let row = 0; row < numRows; row++) {
    const rowBottom = yBase + boardH + row * (rowH + boardH)
    const bookMaxH = rowH * 0.90
    let xCursor = x - innerW / 2
    let idx = row * 5
    while (xCursor < x + innerW / 2 - 0.1) {
      const bw = Math.min(BOOK_WIDTHS[idx % BOOK_WIDTHS.length], x + innerW / 2 - xCursor)
      if (bw < 0.18) break
      const bh = bookMaxH * BOOK_H_FACTORS[idx % BOOK_H_FACTORS.length]
      specs.push({
        position: { x: xCursor + bw / 2, y: rowBottom + bh / 2, z: zBooks },
        color: BOOK_COLORS[idx % BOOK_COLORS.length],
        size: { x: bw - 0.02, y: bh, z: bookDepth },
      })
      xCursor += bw
      idx++
    }
  }

  return specs
}

function buildStudyFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  const specs: VoxelSpec[] = [
    // Desk — centered, back wall
    { position: { x: cx, y: ft + 0.5, z: 7 }, color: PALETTE.DESK, size: { x: 5, y: 1, z: 2 } },
    // Desk side return — left
    { position: { x: xMin + 1, y: ft + 0.5, z: 5.5 }, color: PALETTE.DESK, size: { x: 1.5, y: 1, z: 1 } },
    // Computer monitor
    { position: { x: cx - 1, y: ft + 1.75, z: 7.3 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 1.5, z: 0.3 } },
    // Keyboard
    { position: { x: cx - 1, y: ft + 1, z: 6.4 }, color: PALETTE.STOVE, size: { x: 2, y: 0.2, z: 0.8 } },
    // Desk chair
    { position: { x: cx, y: ft + 0.5, z: 5 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 5.7 }, color: PALETTE.SOFA, size: { x: 1.5, y: 2, z: 0.5 } },
    // Left bookshelf
    ...makeBookshelfVoxels(xMin + 1, ft, 2, 5, 7.5, 7.0),
    // Desk lamp (shade at ft+2.3 clears pole top face at ft+2)
    { position: { x: cx + 1.5, y: ft + 1, z: 6.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 2, z: 0.2 } },
    { position: { x: cx + 1.5, y: ft + 2.3, z: 6.3 }, color: 0xfff4c0, size: { x: 0.7, y: 0.3, z: 0.7 } },
  ]

  // Right bookshelf (only if wide enough)
  if (w >= 7) {
    specs.push(...makeBookshelfVoxels(xMax - 1.5, ft, 2, 5, 7.5, 7.0))
  }

  addVoxels(group, specs)
}

function buildHobbyRoomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  const specs: VoxelSpec[] = [
    // Upright piano — left side, back wall
    { position: { x: xMin + 3, y: ft + 2, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 4, y: 4, z: 1 } },
    // Piano keys
    { position: { x: xMin + 3, y: ft + 0.5, z: 7.1 }, color: PALETTE.CEILING, size: { x: 3.5, y: 0.5, z: 0.5 } },
    // Piano black keys
    { position: { x: xMin + 2.5, y: ft + 0.8, z: 6.9 }, color: PALETTE.TV_SCREEN, size: { x: 0.4, y: 0.4, z: 0.3 } },
    { position: { x: xMin + 3.5, y: ft + 0.8, z: 6.9 }, color: PALETTE.TV_SCREEN, size: { x: 0.4, y: 0.4, z: 0.3 } },
    // Piano bench
    { position: { x: xMin + 3, y: ft + 0.5, z: 5.5 }, color: PALETTE.WARDROBE, size: { x: 2.5, y: 1, z: 1 } },
    // Record player / stereo on cabinet — centered
    { position: { x: cx, y: ft + 0.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 3, y: 1, z: 1 } },
    { position: { x: cx, y: ft + 1.5, z: 7.3 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 0.5, z: 0.5 } },
    // Couch — centered
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.SOFA, size: { x: 4, y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 5.2 }, color: PALETTE.SOFA, size: { x: 4, y: 1.5, z: 0.5 } },
    // Rug
    { position: { x: cx, y: ft + 0.1, z: 4.5 }, color: 0x8b3a5a, size: { x: Math.min(6, w - 2), y: 0.1, z: 4 } },
  ]

  // Speakers (only if wide enough)
  if (w >= 10) {
    specs.push(
      { position: { x: cx - 2.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 1.5, y: 3, z: 1 } },
      { position: { x: cx + 2.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 1.5, y: 3, z: 1 } },
    )
  }

  // Easel — right side, back wall (only if wide enough)
  if (w >= 8) {
    specs.push(
      { position: { x: xMax - 2, y: ft + 2, z: 7 }, color: PALETTE.STAIRCASE, size: { x: 0.5, y: 4, z: 0.5 } },
      { position: { x: xMax - 2, y: ft + 3, z: 6.5 }, color: PALETTE.CEILING, size: { x: 2, y: 2, z: 0.3 } },
    )
  }

  addVoxels(group, specs)
}

function buildStorageFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  const specs: VoxelSpec[] = [
    // Center bookshelf — back wall
    ...makeBookshelfVoxels(cx, ft, 3, 5, 7.5, 7.0),
    // Reading armchair — left-center
    { position: { x: xMin + 3, y: ft + 0.5, z: 4.5 }, color: PALETTE.WARDROBE, size: { x: 2, y: 1, z: 2 } },
    { position: { x: xMin + 3, y: ft + 1.5, z: 5.4 }, color: PALETTE.WARDROBE, size: { x: 2, y: 2, z: 0.5 } },
    // Side table with lamp
    { position: { x: cx - 0.5, y: ft + 0.5, z: 4 }, color: PALETTE.DESK, size: { x: 1, y: 1, z: 1 } },
    { position: { x: cx - 0.5, y: ft + 1, z: 4 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 2, z: 0.2 } },
    { position: { x: cx - 0.5, y: ft + 2.1, z: 4 }, color: 0xfff4c0, size: { x: 0.8, y: 0.3, z: 0.8 } },
    // Rug
    { position: { x: cx, y: ft + 0.1, z: 4.5 }, color: 0x3a5a3a, size: { x: Math.min(8, w - 2), y: 0.1, z: 5 } },
  ]

  // Left bookshelf (if wide enough for 2+)
  if (w >= 8) {
    specs.push(...makeBookshelfVoxels(xMin + 2, ft, 3, 5, 7.5, 7.0))
  }

  // Right bookshelf (if wide enough for 3)
  if (w >= 10) {
    specs.push(...makeBookshelfVoxels(xMax - 2, ft, 3, 5, 7.5, 7.0))
  }

  // Writing desk (right side, if wide enough)
  if (w >= 8) {
    specs.push(
      { position: { x: xMax - 2.5, y: ft + 0.5, z: 4 }, color: PALETTE.DESK, size: { x: 3, y: 1, z: 1.5 } },
      { position: { x: xMax - 2, y: ft + 1.2, z: 3.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.4, y: 1, z: 0.4 } },
    )
  }

  addVoxels(group, specs)
}

function buildLandingFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  const specs: VoxelSpec[] = [
    // Tall bookshelf against back wall
    ...makeBookshelfVoxels(cx, ft, Math.min(w - 1, 3), 5, 7.5, 7.0),
    // Small armchair
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.SOFA, size: { x: Math.min(w - 1, 2.5), y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 5.2 }, color: PALETTE.SOFA, size: { x: Math.min(w - 1, 2.5), y: 1.5, z: 0.5 } },
    // Floor lamp
    { position: { x: xMin + 1, y: ft + 1.5, z: 5.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 3, z: 0.2 } },
    { position: { x: xMin + 1, y: ft + 3.2, z: 5.3 }, color: 0xfff4c0, size: { x: 0.7, y: 0.3, z: 0.7 } },
  ]

  addVoxels(group, specs)
}

// ---------------------------------------------------------------------------
// Staircase builder — per-floor independent positioning
// ---------------------------------------------------------------------------

function buildStaircase(group: THREE.Group, staircaseX: Record<1 | 2, number>): void {
  // Each floor's staircase corridor starts at staircaseX[floor].
  // The corridor is 5 wide; steps are 3 wide, centered in the corridor.
  // 8 steps per floor (one step per voxel of FLOOR_HEIGHT).
  // Steps rise in Y and advance in Z (front→back).

  const stairSteps = FLOOR_HEIGHT
  const stepWidth = 3
  const startZ = 0.5

  for (let f = 1; f <= FLOOR_COUNT - 1; f++) {
    const floor = f as 1 | 2
    const stairXStart = staircaseX[floor]
    const stepCenterX = stairXStart + 2.5
    const baseY = floorY(floor)

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

export function getRooms(layout?: HouseLayout): Room[] {
  if (layout) {
    const rooms: Room[] = layout.slots.map((slot) => ({
      id: (slot.roomId === 'entrance' ? 'entrance_hall' : slot.roomId) as Room['id'],
      floor: slot.floor,
      bounds: {
        min: { x: slot.xMin, y: floorY(slot.floor), z: 1 },
        max: { x: slot.xMax, y: floorY(slot.floor) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    }))
    // Staircase bounds: union of floor 1 & 2 staircase columns (floor 3 has no staircase)
    const minStairX = Math.min(
      layout.stairBounds[1].xMin,
      layout.stairBounds[2].xMin,
    )
    const maxStairX = Math.max(
      layout.stairBounds[1].xMax,
      layout.stairBounds[2].xMax,
    )
    rooms.push({
      id: 'staircase',
      floor: 1,
      bounds: {
        min: { x: minStairX, y: 0, z: 1 },
        max: { x: maxStairX, y: FLOOR_HEIGHT * FLOOR_COUNT, z: HOUSE_DEPTH - 1 },
      },
    })
    return rooms
  }

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
        max: { x: 27, y: floorY(1) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
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
        max: { x: 27, y: floorY(2) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
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
        max: { x: 27, y: floorY(3) + FLOOR_HEIGHT, z: HOUSE_DEPTH - 1 },
      },
    },
    {
      id: 'staircase',
      floor: 1,
      bounds: {
        min: { x: 27, y: 0, z: 1 },
        max: { x: HOUSE_WIDTH - 1, y: FLOOR_HEIGHT * FLOOR_COUNT, z: HOUSE_DEPTH - 1 },
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Bathroom door — swings closed when character is inside
// ---------------------------------------------------------------------------

/**
 * Builds a bathroom door panel on a pivot group so it can swing open/closed.
 * The hinge is at the left edge of the bathroom slot. When closed (rotation.y = 0)
 * the panel covers the bathroom's front opening. When open (rotation.y = -PI/2)
 * the panel tucks alongside the adjacent wall, out of view.
 */
function buildBathroomDoorForSlot(bathroomSlot: RoomSlot): THREE.Group {
  const baseY = floorY(bathroomSlot.floor)
  const wallH = FLOOR_HEIGHT - 1
  const doorWidth = bathroomSlot.xMax - bathroomSlot.xMin - 0.5
  const doorThickness = 0.3

  // Pivot group — positioned at the hinge point (left edge of bathroom + 1)
  const pivot = new THREE.Group()
  pivot.position.set(bathroomSlot.xMin + 1, baseY + wallH / 2 + 1, 0.15)

  // Door panel — offset so its left edge sits at the pivot (hinge)
  const geo = new THREE.BoxGeometry(doorWidth, wallH, doorThickness)
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.DOOR })
  const panel = new THREE.Mesh(geo, mat)
  panel.position.set(doorWidth / 2, 0, 0)
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

// ---------------------------------------------------------------------------
// Room builder dispatch table
// ---------------------------------------------------------------------------

const ROOM_BUILDERS: Readonly<
  Record<LayoutRoomId, (g: THREE.Group, xMin: number, xMax: number, floor: 1 | 2 | 3) => void>
> = {
  entrance: buildEntranceRoom,
  living_room: buildLivingRoomFurniture,
  kitchen: buildKitchenFurniture,
  bedroom: buildBedroomFurniture,
  bathroom: buildBathroomFurniture,
  study: buildStudyFurniture,
  hobby_room: buildHobbyRoomFurniture,
  storage: buildStorageFurniture,
  landing: buildLandingFurniture,
}

// ---------------------------------------------------------------------------
// Room furniture preview — used by layout editor for drag ghosts
// ---------------------------------------------------------------------------

/**
 * Builds furniture for a single room slot into a new THREE.Group.
 * Furniture is positioned at absolute world coordinates matching the given slot.
 * Used by the layout editor to render draggable ghost previews.
 */
/**
 * Builds a group containing the staircase steps for a single floor transition
 * (floor → floor+1), positioned at the given stairXStart world X coordinate.
 * Used for the layout editor drag ghost.
 */
export function buildStaircaseGhostGroup(floor: 1 | 2, stairXStart: number): THREE.Group {
  const group = new THREE.Group()
  const stairSteps = FLOOR_HEIGHT
  const stepWidth = 3
  const startZ = 0.5
  const stepCenterX = stairXStart + 2.5
  const baseY = floorY(floor)
  for (let step = 0; step < stairSteps; step++) {
    const stepTopY = baseY + 1 + (step + 1)
    group.add(
      makeVoxel(
        { x: stepCenterX, y: stepTopY - 0.5, z: startZ + step + 0.5 },
        PALETTE.STAIRCASE,
        { x: stepWidth, y: 1, z: 1 },
      ),
    )
  }
  // Landing platform
  group.add(
    makeVoxel(
      { x: stepCenterX, y: baseY + FLOOR_HEIGHT + 0.5, z: startZ + stairSteps + 0.5 },
      PALETTE.STAIRCASE,
      { x: stepWidth, y: 1, z: 1 },
    ),
  )
  return group
}

export function buildRoomFurnitureGroup(
  roomId: LayoutRoomId,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
): THREE.Group {
  const group = new THREE.Group()
  ROOM_BUILDERS[roomId](group, xMin, xMax, floor)
  return group
}

// ---------------------------------------------------------------------------
// Main house builder
// ---------------------------------------------------------------------------

/**
 * Builds the complete house geometry as a THREE.Group.
 * The house origin is at (0,0,0) — bottom-left-front corner.
 *
 * Rooms are placed according to the provided HouseLayout.
 */
export function buildHouse(layout: HouseLayout): HouseResult {
  const house = new THREE.Group()

  // Structural shells for all three floors
  for (const floor of [1, 2, 3] as const) {
    buildFloorShell(house, floor)
  }

  // Interior walls from layout (staircase dividers + room-to-room walls)
  for (const floor of [1, 2, 3] as const) {
    const floorWalls = layout.walls
      .filter((w) => w.floor === floor)
      .map((w) => w.x)
    const stairBoundsForFloor = floor !== 3 ? layout.stairBounds[floor as 1 | 2] : undefined
    buildInteriorWalls(house, floor, floorWalls, stairBoundsForFloor)
  }

  // Build furniture for each room slot
  for (const slot of layout.slots) {
    const builder = ROOM_BUILDERS[slot.roomId]
    builder(house, slot.xMin, slot.xMax, slot.floor)
  }

  // Staircase (per-floor independent positioning)
  buildStaircase(house, layout.staircaseX)

  // Bathroom door — positioned from layout
  const bathroomSlot = layout.slotMap.bathroom
  const bathroomDoor = buildBathroomDoorForSlot(bathroomSlot)
  house.add(bathroomDoor)

  return { group: house, bathroomDoor }
}
