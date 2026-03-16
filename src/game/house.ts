import * as THREE from 'three'
import { PALETTE } from './palette'
import type { Vec3, Room, VoxelSpec, DepthLayer } from './types'
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
 * Physical z-nudge per depth layer. Moves meshes toward the camera (−Z) so
 * coplanar surfaces at different logical layers are guaranteed to be separated
 * in the depth buffer, regardless of GPU polygon-offset implementation.
 */
const DEPTH_LAYER_Z_NUDGE: Record<DepthLayer, number> = {
  structural:  0,
  furniture:  -0.03,
  detail:     -0.06,
}

/**
 * Polygon-offset per depth layer (secondary defence for residual coplanar
 * faces). Factor is 0 because the orthographic camera views axis-aligned
 * faces head-on (depth slope ≈ 0), making factor contribute nothing.
 *
 *   detail     (0, 0) — handles, screens, buttons, trim — closest to camera
 *   furniture  (0, 4) — main furniture bodies
 *   structural (0, 8) — walls, floors — furthest from camera
 */
const DEPTH_LAYER_OFFSET: Record<DepthLayer, { factor: number; units: number }> = {
  detail:     { factor: 0, units: 0 },
  furniture:  { factor: 0, units: 4 },
  structural: { factor: 0, units: 8 },
}

/**
 * Creates a box mesh (voxel) at the given position with the given color.
 * Position is the *center* of the voxel in world space.
 */
function makeVoxel(
  position: Vec3,
  color: number,
  size: Vec3 = { x: 1, y: 1, z: 1 },
  depthLayer: DepthLayer = 'furniture',
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  const material = new THREE.MeshLambertMaterial({ color })
  const offset = DEPTH_LAYER_OFFSET[depthLayer]
  if (offset.factor !== 0 || offset.units !== 0) {
    material.polygonOffset = true
    material.polygonOffsetFactor = offset.factor
    material.polygonOffsetUnits = offset.units
  }
  const mesh = new THREE.Mesh(geometry, material)
  const zNudge = DEPTH_LAYER_Z_NUDGE[depthLayer]
  mesh.position.set(position.x, position.y, position.z + zNudge)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Add multiple voxel specs to a group */
function addVoxels(group: THREE.Group, specs: VoxelSpec[]): void {
  for (const spec of specs) {
    group.add(makeVoxel(spec.position, spec.color, spec.size, spec.depthLayer))
  }
}

/** Shorthand for a VoxelSpec on the 'detail' depth layer */
function detail(position: Vec3, color: number, size: Vec3): VoxelSpec {
  return { position, color, size, depthLayer: 'detail' }
}

/**
 * Apply depth-layer settings to an existing material and optionally nudge a
 * mesh's z-position.  Used for meshes built outside of makeVoxel (e.g. the
 * bathroom door).
 */
function applyDepthLayer(
  mat: THREE.MeshLambertMaterial,
  layer: DepthLayer,
  mesh?: THREE.Mesh,
): void {
  const offset = DEPTH_LAYER_OFFSET[layer]
  if (offset.factor !== 0 || offset.units !== 0) {
    mat.polygonOffset = true
    mat.polygonOffsetFactor = offset.factor
    mat.polygonOffsetUnits = offset.units
  }
  if (mesh) {
    mesh.position.z += DEPTH_LAYER_Z_NUDGE[layer]
  }
}

// ---------------------------------------------------------------------------
// Item tracking — tagged furniture pieces for double-tap swap
// ---------------------------------------------------------------------------

export interface ItemRecord {
  itemId: number
  itemType: string
  meshes: THREE.Mesh[]
}

let _nextItemId = 0

/**
 * Adds voxel specs to a group and tags every mesh with an item type and
 * unique item ID. Collected in the items array for raycasting/swap logic.
 */
function addItem(
  group: THREE.Group,
  itemType: string,
  specs: VoxelSpec[],
  items?: ItemRecord[],
): void {
  const id = _nextItemId++
  const meshes: THREE.Mesh[] = []
  for (const spec of specs) {
    const mesh = makeVoxel(spec.position, spec.color, spec.size, spec.depthLayer)
    mesh.userData.itemType = itemType
    mesh.userData.itemId = id
    group.add(mesh)
    meshes.push(mesh)
  }
  if (items) items.push({ itemId: id, itemType, meshes })
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
      'structural',
    ),
  )

  // Left exterior wall
  group.add(
    makeVoxel(
      { x: 0.5, y: baseY + FLOOR_HEIGHT / 2, z: hd / 2 },
      PALETTE.WALL_EXTERIOR,
      { x: wt, y: FLOOR_HEIGHT, z: hd },
      'structural',
    ),
  )

  // Right exterior wall
  group.add(
    makeVoxel(
      { x: hw - 0.5, y: baseY + FLOOR_HEIGHT / 2, z: hd / 2 },
      PALETTE.WALL_EXTERIOR,
      { x: wt, y: FLOOR_HEIGHT, z: hd },
      'structural',
    ),
  )

  // Back exterior wall
  group.add(
    makeVoxel(
      { x: hw / 2, y: baseY + FLOOR_HEIGHT / 2, z: hd - 0.5 },
      PALETTE.WALL_EXTERIOR,
      { x: hw, y: FLOOR_HEIGHT, z: wt },
      'structural',
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
        'structural',
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
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2

  addItem(group, 'door', [
    // Front door frame on back wall — centered (z=7.2 so front face at 6.95, clear of wall at 7.0)
    { position: { x: cx, y: ft + 2, z: 7.2 }, color: PALETTE.DOOR, size: { x: 2, y: 4, z: 0.5 } },
  ], items)
  addItem(group, 'coat_rack', [
    // Coat rack — left side
    { position: { x: xMin + 0.5, y: ft + 2, z: 5 }, color: PALETTE.BOOKSHELF, size: { x: 0.5, y: 4, z: 0.5 } },
    // Coat rack hooks
    detail({ x: xMin + 0.75, y: ft + 3, z: 4.8 }, PALETTE.DESK, { x: 0.5, y: 0.5, z: 0.4 }),
    detail({ x: xMin + 0.75, y: ft + 2, z: 4.8 }, PALETTE.DESK, { x: 0.5, y: 0.5, z: 0.4 }),
  ], items)
  addItem(group, 'rug', [
    // Entry rug — centered
    detail({ x: cx, y: ft + 0.1, z: 4 }, PALETTE.SOFA, { x: 2, y: 0.1, z: 3 }),
  ], items)
  addVoxels(group, [
    // Wall sconce pole — right side of door (z=6.9 so front face at 6.8, visible in front of wall)
    detail({ x: cx + 1.8, y: ft + 3, z: 6.9 }, PALETTE.CHROME, { x: 0.2, y: 1.5, z: 0.2 }),
  ])
  // Sconce shade
  addLamp(group, 'entrance', { x: cx + 1.8, y: ft + 3.8, z: 6.8 }, { x: 0.6, y: 0.3, z: 0.6 }, lamps)
}

function buildLivingRoomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  // Sofa width shrinks in narrow rooms so it doesn't overlap the bookshelf
  const sofaW = Math.min(5, w - 3)
  addItem(group, 'sofa', [
    { position: { x: cx, y: ft + 0.5, z: 6.5 }, color: PALETTE.SOFA, size: { x: sofaW, y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 7.15 }, color: PALETTE.SOFA, size: { x: sofaW, y: 2, z: 0.5 } },
    detail({ x: cx - 1, y: ft + 1.25, z: 6 }, PALETTE.BED, { x: 1, y: 0.5, z: 1 }),
    detail({ x: cx + 1, y: ft + 1.25, z: 6 }, PALETTE.BED, { x: 1, y: 0.5, z: 1 }),
  ], items)
  addItem(group, 'tv', [
    { position: { x: cx, y: ft + 0.5, z: 1.5 }, color: PALETTE.DESK, size: { x: 4, y: 1, z: 1 } },
    detail({ x: cx, y: ft + 1.75, z: 1.6 }, PALETTE.TV_SCREEN, { x: 3.5, y: 2, z: 0.3 }),
  ], items)
  addItem(group, 'table', [
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.TABLE, size: { x: 3, y: 0.5, z: 1.5 } },
  ], items)
  addItem(group, 'bookshelf', [
    { position: { x: xMin + 1.5, y: ft + 2, z: 7.2 }, color: PALETTE.BOOKSHELF, size: { x: 2, y: 4, z: 0.5 } },
    detail({ x: xMin + 1, y: ft + 1, z: 6.9 }, 0x8b3a3a, { x: 0.5, y: 1, z: 0.3 }),
    detail({ x: xMin + 1.5, y: ft + 2, z: 6.9 }, 0x3a6b3a, { x: 0.5, y: 1, z: 0.3 }),
    detail({ x: xMin + 2, y: ft + 3, z: 6.9 }, 0x3a3a8b, { x: 0.5, y: 1, z: 0.3 }),
  ], items)
  addVoxels(group, [
    // Floor lamp pole + base (part of lamp system)
    detail({ x: xMin + 2, y: ft + 2, z: 4.5 }, PALETTE.FRIDGE, { x: 0.3, y: 4, z: 0.3 }),
    detail({ x: xMin + 2, y: ft + 0.1, z: 4.5 }, PALETTE.FRIDGE, { x: 1, y: 0.2, z: 1 }),
  ])

  if (w >= 10) {
    addItem(group, 'fireplace', [
      { position: { x: xMax - 1.5, y: ft + 1.5, z: 7.45 }, color: PALETTE.STOVE, size: { x: 2, y: 3, z: 1 } },
      { position: { x: xMax - 1.5, y: ft + 3, z: 7.2 }, color: PALETTE.STAIRCASE, size: { x: 3, y: 0.5, z: 1.5 } },
      detail({ x: xMax - 1.5, y: ft + 0.5, z: 6.8 }, 0xe05c1a, { x: 1.2, y: 1, z: 0.5 }),
    ], items)
    addItem(group, 'armchair', [
      { position: { x: cx + 2, y: ft + 0.5, z: 5 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1, z: 1.5 } },
      { position: { x: cx + 2, y: ft + 1.5, z: 5.7 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1.5, z: 0.5 } },
    ], items)
  }
  // Floor lamp shade — large shade at top of pole, tracked for toggling
  addLamp(group, 'living_room', { x: xMin + 2, y: ft + 4.3, z: 4.5 }, { x: 1.2, y: 0.5, z: 1.2 }, lamps)
  // Big fern plant — right side, front area
  buildFernPlant(group, xMax - 2, ft, 2.5, plant)
}

function buildKitchenFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin
  const counterW = Math.min(w - 2, 9)

  addItem(group, 'counter', [
    // Counter along back wall — centered
    { position: { x: cx, y: ft + 0.5, z: 7.45 }, color: PALETTE.COUNTER, size: { x: counterW, y: 1, z: 1 } },
    // Counter backsplash (z=7.1 so front face at 6.95, visible above counter)
    detail({ x: cx, y: ft + 2, z: 7.1 }, 0xd0e8e8, { x: counterW, y: 2, z: 0.3 }),
  ], items)
  addItem(group, 'stove', [
    { position: { x: xMin + 2.5, y: ft + 1.5, z: 7.3 }, color: PALETTE.STOVE, size: { x: 2, y: 1, z: 0.7 } },
    // Stove top burners
    detail({ x: xMin + 2, y: ft + 2, z: 7.2 }, 0x444444, { x: 0.7, y: 0.3, z: 0.7 }),
    detail({ x: xMin + 3, y: ft + 2, z: 7.2 }, 0x444444, { x: 0.7, y: 0.3, z: 0.7 }),
  ], items)
  addItem(group, 'sink', [
    detail({ x: cx, y: ft + 1.5, z: 7.3 }, PALETTE.FRIDGE, { x: 1.5, y: 0.7, z: 0.7 }),
  ], items)
  addItem(group, 'fridge', [
    { position: { x: xMax - 1.5, y: ft + 2, z: 7 }, color: PALETTE.FRIDGE, size: { x: 1.5, y: 4, z: 1.5 } },
    // Fridge handle — z=6.1 so it sits visibly on the front face of the fridge (front face at z=6.25)
    detail({ x: xMax - 2.1, y: ft + 2, z: 6.1 }, PALETTE.STOVE, { x: 0.2, y: 2, z: 0.3 }),
  ], items)
  addItem(group, 'table', [
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.TABLE, size: { x: 4, y: 1, z: 2.5 } },
    // Table legs
    detail({ x: cx - 1.5, y: ft + 0.5, z: 3.5 }, PALETTE.DESK, { x: 0.3, y: 1, z: 0.3 }),
    detail({ x: cx + 1.5, y: ft + 0.5, z: 3.5 }, PALETTE.DESK, { x: 0.3, y: 1, z: 0.3 }),
  ], items)
  addItem(group, 'chair', [
    { position: { x: cx - 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.WARDROBE, size: { x: 1, y: 1, z: 1 } },
    { position: { x: cx + 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.WARDROBE, size: { x: 1, y: 1, z: 1 } },
  ], items)

  if (w >= 8) {
    addItem(group, 'cabinet', [
      // Upper cabinet (z=7.3 so front face at 6.95, visible in front of wall)
      { position: { x: xMin + 4, y: ft + 4.5, z: 7.3 }, color: PALETTE.COUNTER, size: { x: 4, y: 2, z: 0.7 } },
    ], items)
  }

  // Pendant light cord above dining table
  addVoxels(group, [
    detail({ x: cx, y: ft + 5.5, z: 4.5 }, PALETTE.CHROME, { x: 0.1, y: 2, z: 0.1 }),
  ])
  // Pendant shade
  addLamp(group, 'kitchen', { x: cx, y: ft + 4.5, z: 4.5 }, { x: 1.0, y: 0.4, z: 1.0 }, lamps)
}

function buildBedroomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addItem(group, 'bed', [
    { position: { x: cx, y: ft + 0.5, z: 6.5 }, color: PALETTE.BED, size: { x: 5, y: 1, z: 2 } },
    // Duvet — depth 1.8 (not 2) so its front/back faces don't coincide with the bed's (z=5.5 and z=7.5)
    detail({ x: cx, y: ft + 1, z: 6.5 }, 0xb8a0cc, { x: 4.5, y: 0.3, z: 1.8 }),
    // Pillows — raised to sit on top of bed (y=ft+1) to avoid embedded geometry z-fighting
    detail({ x: cx - 1.5, y: ft + 1.25, z: 5.7 }, PALETTE.CEILING, { x: 1.5, y: 0.5, z: 0.8 }),
    detail({ x: cx + 1, y: ft + 1.25, z: 5.7 }, PALETTE.CEILING, { x: 1.5, y: 0.5, z: 0.8 }),
    // Headboard — centered, back wall (z=7.2 so front face at 6.95, clear of wall)
    { position: { x: cx, y: ft + 2, z: 7.2 }, color: PALETTE.WARDROBE, size: { x: 5.5, y: 3, z: 0.5 } },
  ], items)
  addItem(group, 'rug', [
    detail({ x: cx, y: ft + 0.1, z: 4.5 }, 0x7a5cb8, { x: Math.min(7, w - 2), y: 0.1, z: 3 }),
  ], items)

  if (w >= 8) {
    addItem(group, 'nightstand', [
      { position: { x: xMin + 0.75, y: ft + 0.5, z: 6.5 }, color: PALETTE.DESK, size: { x: 1.0, y: 1, z: 1.5 } },
      detail({ x: xMin + 0.75, y: ft + 1.5, z: 6.5 }, PALETTE.FRIDGE, { x: 0.3, y: 1, z: 0.3 }),
    ], items)
  }

  if (w >= 8) {
    addItem(group, 'wardrobe', [
      { position: { x: xMin + 1.5, y: ft + 2.5, z: 7.35 }, color: PALETTE.WARDROBE, size: { x: 3, y: 5, z: 0.8 } },
      // Door panels at z=6.8 for clear separation from wardrobe front at 6.95
      detail({ x: xMin + 1, y: ft + 2.5, z: 6.8 }, PALETTE.DESK, { x: 1, y: 4, z: 0.3 }),
      detail({ x: xMin + 2, y: ft + 2.5, z: 6.8 }, PALETTE.DESK, { x: 1, y: 4, z: 0.3 }),
    ], items)
  }

  if (w >= 10) {
    addItem(group, 'dresser', [
      // Dresser rows sized to 0.9 to leave 0.1 gap and avoid shared coplanar y-face
      { position: { x: xMax - 3, y: ft + 0.5, z: 7.45 }, color: PALETTE.WARDROBE, size: { x: 4, y: 0.9, z: 1 } },
      { position: { x: xMax - 3, y: ft + 1.5, z: 7.45 }, color: PALETTE.WARDROBE, size: { x: 4, y: 0.9, z: 1 } },
      detail({ x: xMax - 4, y: ft + 0.5, z: 7.1 }, PALETTE.FRIDGE, { x: 0.8, y: 0.3, z: 0.3 }),
      detail({ x: xMax - 2, y: ft + 0.5, z: 7.1 }, PALETTE.FRIDGE, { x: 0.8, y: 0.3, z: 0.3 }),
    ], items)
  }
  // Nightstand lamp shade — tracked for toggling (always present; pole/nightstand conditional above)
  if (w >= 8) {
    addLamp(group, 'bedroom', { x: xMin + 0.75, y: ft + 2.1, z: 6.5 }, { x: 0.7, y: 0.3, z: 0.7 }, lamps)
  } else {
    // Narrow bedroom: ceiling pendant instead
    addVoxels(group, [
      { position: { x: cx, y: ft + 5.5, z: 4 }, color: PALETTE.CHROME, size: { x: 0.1, y: 2, z: 0.1 } },
    ])
    addLamp(group, 'bedroom', { x: cx, y: ft + 4.5, z: 4 }, { x: 0.8, y: 0.3, z: 0.8 }, lamps)
  }
}

function buildBathroomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addVoxels(group, [
    // Floor tiles (structural, not a swappable item)
    { position: { x: cx, y: ft - 0.4, z: 4 }, color: PALETTE.TILE, size: { x: w, y: 0.1, z: 6 } },
  ])
  addItem(group, 'bathtub', [
    { position: { x: cx, y: ft + 0.5, z: 6.5 }, color: PALETTE.PORCELAIN, size: { x: 4, y: 1, z: 2 } },
    { position: { x: cx, y: ft + 0.9, z: 6.5 }, color: PALETTE.TILE, size: { x: 3, y: 0.5, z: 1.5 } },
    { position: { x: xMin + 1.3, y: ft + 1.5, z: 7 }, color: PALETTE.CHROME, size: { x: 0.3, y: 0.7, z: 0.3 } },
  ], items)
  addItem(group, 'sink', [
    { position: { x: xMin + 1.5, y: ft + 1, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 0.5, z: 1 } },
    { position: { x: xMin + 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 0.8, y: 1, z: 0.8 } },
  ], items)
  addItem(group, 'toilet', [
    { position: { x: xMax - 1.5, y: ft + 0.5, z: 2.5 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: xMax - 1.5, y: ft + 1, z: 3.2 }, color: PALETTE.PORCELAIN, size: { x: 1.5, y: 0.5, z: 0.8 } },
  ], items)
  addItem(group, 'mirror', [
    { position: { x: xMin + 1.5, y: ft + 3, z: 6.95 }, color: 0xc0d8e8, size: { x: 2, y: 2, z: 0.3 } },
  ], items)
  addItem(group, 'towel_rack', [
    { position: { x: xMax - 2, y: ft + 2.5, z: 6.95 }, color: PALETTE.CHROME, size: { x: 2, y: 0.3, z: 0.3 } },
    { position: { x: xMax - 2, y: ft + 1.5, z: 6.85 }, color: 0x4a9b9b, size: { x: 1.5, y: 2, z: 0.3 } },
  ], items)
  addVoxels(group, [
    // Ceiling light fixture cord
    { position: { x: cx, y: ft + 5.5, z: 4 }, color: PALETTE.CHROME, size: { x: 0.1, y: 2, z: 0.1 } },
  ])
  // Ceiling light shade
  addLamp(group, 'bathroom', { x: cx, y: ft + 4.5, z: 4 }, { x: 0.8, y: 0.3, z: 0.8 }, lamps)
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

  // Back panel — innerW so it sits between side panels with no x-overlap.
  // Front face at z=7.70, behind books (back face z=7.14). Visible above shorter books.
  specs.push({ position: { x, y: yBase + height / 2, z: zShelf + shelfDepth / 2 - 0.1 }, color: wood, size: { x: innerW, y: height, z: 0.2 } })

  // Side panels — full height, at x edges. z=7.10–7.90.
  specs.push(
    { position: { x: x - width / 2 + sideW / 2, y: yBase + height / 2, z: zShelf }, color: wood, size: { x: sideW, y: height, z: shelfDepth } },
    { position: { x: x + width / 2 - sideW / 2, y: yBase + height / 2, z: zShelf }, color: wood, size: { x: sideW, y: height, z: shelfDepth } },
  )

  // Shelf boards — innerW so they sit between side panels with no x-overlap. z=7.10–7.90.
  for (let i = 0; i <= numRows; i++) {
    const boardY = yBase + boardH / 2 + i * (rowH + boardH)
    specs.push({ position: { x, y: boardY, z: zShelf }, color: wood, size: { x: innerW, y: boardH, z: shelfDepth } })
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
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addItem(group, 'desk', [
    { position: { x: cx, y: ft + 0.5, z: 7 }, color: PALETTE.DESK, size: { x: 5, y: 1, z: 2 } },
    { position: { x: xMin + 1, y: ft + 0.5, z: 5.5 }, color: PALETTE.DESK, size: { x: 1.5, y: 1, z: 1 } },
    { position: { x: cx - 1, y: ft + 1.75, z: 6.8 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 1.5, z: 0.3 } },
    { position: { x: cx - 1, y: ft + 1, z: 6.4 }, color: PALETTE.STOVE, size: { x: 2, y: 0.2, z: 0.8 } },
  ], items)
  addItem(group, 'chair', [
    { position: { x: cx, y: ft + 0.5, z: 5 }, color: PALETTE.SOFA, size: { x: 1.5, y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 5.7 }, color: PALETTE.SOFA, size: { x: 1.5, y: 2, z: 0.5 } },
  ], items)
  addItem(group, 'bookshelf', makeBookshelfVoxels(xMin + 1, ft, 2, 5, 7.35, 6.9), items)
  addVoxels(group, [
    // Desk lamp pole
    { position: { x: cx + 1.5, y: ft + 1, z: 6.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 2, z: 0.2 } },
  ])

  if (w >= 7) {
    addItem(group, 'bookshelf', makeBookshelfVoxels(xMax - 1.5, ft, 2, 5, 7.35, 6.9), items)
  }
  // Desk lamp shade
  addLamp(group, 'study', { x: cx + 1.5, y: ft + 2.3, z: 6.3 }, { x: 0.7, y: 0.3, z: 0.7 }, lamps)
}

function buildHobbyRoomFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addItem(group, 'piano', [
    { position: { x: xMin + 3, y: ft + 2, z: 7.5 }, color: PALETTE.BOOKSHELF, size: { x: 4, y: 4, z: 1 } },
    { position: { x: xMin + 3, y: ft + 0.5, z: 7.1 }, color: PALETTE.CEILING, size: { x: 3.5, y: 0.5, z: 0.5 } },
    { position: { x: xMin + 2.5, y: ft + 0.8, z: 6.9 }, color: PALETTE.TV_SCREEN, size: { x: 0.4, y: 0.4, z: 0.3 } },
    { position: { x: xMin + 3.5, y: ft + 0.8, z: 6.9 }, color: PALETTE.TV_SCREEN, size: { x: 0.4, y: 0.4, z: 0.3 } },
    { position: { x: xMin + 3, y: ft + 0.5, z: 6.2 }, color: PALETTE.WARDROBE, size: { x: 2.5, y: 1, z: 1 } },
  ], items)
  addItem(group, 'sofa', [
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.SOFA, size: { x: 4, y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 5.2 }, color: PALETTE.SOFA, size: { x: 4, y: 1.5, z: 0.5 } },
  ], items)
  addItem(group, 'rug', [
    { position: { x: cx, y: ft + 0.1, z: 4.5 }, color: 0x8b3a5a, size: { x: Math.min(6, w - 2), y: 0.1, z: 4 } },
  ], items)

  const pianoRightEdge = xMin + 5
  const cabinetX = Math.max(cx, pianoRightEdge + 1.6)
  if (cabinetX + 1.5 <= xMax - 0.5) {
    addItem(group, 'cabinet', [
      { position: { x: cabinetX, y: ft + 0.5, z: 7.5 }, color: PALETTE.WARDROBE, size: { x: 3, y: 1, z: 1 } },
      { position: { x: cabinetX, y: ft + 1.5, z: 6.8 }, color: PALETTE.TV_SCREEN, size: { x: 2, y: 0.5, z: 0.5 } },
    ], items)
  }

  if (w >= 10) {
    addItem(group, 'speaker', [
      { position: { x: cx - 2.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 1.5, y: 3, z: 1 } },
      { position: { x: cx + 2.5, y: ft + 1.5, z: 7.5 }, color: PALETTE.STOVE, size: { x: 1.5, y: 3, z: 1 } },
    ], items)
  }

  if (w >= 8) {
    addItem(group, 'easel', [
      { position: { x: xMax - 2, y: ft + 2, z: 7 }, color: PALETTE.STAIRCASE, size: { x: 0.5, y: 4, z: 0.5 } },
      { position: { x: xMax - 2, y: ft + 3, z: 6.5 }, color: PALETTE.CEILING, size: { x: 2, y: 2, z: 0.3 } },
    ], items)
  }

  // Ceiling pendant light
  addVoxels(group, [
    { position: { x: cx, y: ft + 5.5, z: 4.5 }, color: PALETTE.CHROME, size: { x: 0.1, y: 2, z: 0.1 } },
  ])
  addLamp(group, 'hobby_room', { x: cx, y: ft + 4.5, z: 4.5 }, { x: 0.9, y: 0.3, z: 0.9 }, lamps)
}

function buildStorageFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addItem(group, 'bookshelf', makeBookshelfVoxels(cx, ft, 3, 5, 7.35, 6.9), items)
  addItem(group, 'armchair', [
    { position: { x: xMin + 3, y: ft + 0.5, z: 4.5 }, color: PALETTE.WARDROBE, size: { x: 2, y: 1, z: 2 } },
    { position: { x: xMin + 3, y: ft + 1.5, z: 5.4 }, color: PALETTE.WARDROBE, size: { x: 2, y: 2, z: 0.5 } },
  ], items)
  addVoxels(group, [
    // Side table with lamp pole (part of lamp system)
    { position: { x: cx - 0.5, y: ft + 0.5, z: 4 }, color: PALETTE.DESK, size: { x: 1, y: 1, z: 1 } },
    { position: { x: cx - 0.5, y: ft + 1, z: 4 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 2, z: 0.2 } },
  ])
  addItem(group, 'rug', [
    { position: { x: cx, y: ft + 0.1, z: 4.5 }, color: 0x3a5a3a, size: { x: Math.min(8, w - 2), y: 0.1, z: 5 } },
  ], items)

  if (w >= 8) {
    addItem(group, 'bookshelf', makeBookshelfVoxels(xMin + 2, ft, 3, 5, 7.35, 6.9), items)
  }
  if (w >= 10) {
    addItem(group, 'bookshelf', makeBookshelfVoxels(xMax - 2, ft, 3, 5, 7.35, 6.9), items)
  }

  if (w >= 8) {
    addItem(group, 'desk', [
      { position: { x: xMax - 2.5, y: ft + 0.5, z: 4 }, color: PALETTE.DESK, size: { x: 3, y: 1, z: 1.5 } },
      { position: { x: xMax - 2, y: ft + 1.2, z: 3.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.4, y: 1, z: 0.4 } },
    ], items)
  }
  // Side table lamp shade
  addLamp(group, 'storage', { x: cx - 0.5, y: ft + 2.1, z: 4 }, { x: 0.8, y: 0.3, z: 0.8 }, lamps)
}

function buildLandingFurniture(
  group: THREE.Group,
  xMin: number,
  xMax: number,
  floor: 1 | 2 | 3,
  lamps?: LampRecord[],
  _plant?: PlantRecord,
  items?: ItemRecord[],
): void {
  const ft = floorY(floor) + 1
  const cx = (xMin + xMax) / 2
  const w = xMax - xMin

  addItem(group, 'bookshelf', makeBookshelfVoxels(cx, ft, Math.min(w - 1, 3), 5, 7.35, 6.9), items)
  addItem(group, 'armchair', [
    { position: { x: cx, y: ft + 0.5, z: 4.5 }, color: PALETTE.SOFA, size: { x: Math.min(w - 1, 2.5), y: 1, z: 1.5 } },
    { position: { x: cx, y: ft + 1.5, z: 5.2 }, color: PALETTE.SOFA, size: { x: Math.min(w - 1, 2.5), y: 1.5, z: 0.5 } },
  ], items)
  addVoxels(group, [
    // Floor lamp pole (part of lamp system)
    { position: { x: xMin + 1, y: ft + 1.5, z: 5.5 }, color: PALETTE.BOOKSHELF, size: { x: 0.2, y: 3, z: 0.2 } },
  ])
  // Floor lamp shade
  addLamp(group, 'landing', { x: xMin + 1, y: ft + 3.2, z: 5.3 }, { x: 0.7, y: 0.3, z: 0.7 }, lamps)
}

// ---------------------------------------------------------------------------
// Staircase builder — per-floor independent positioning
// ---------------------------------------------------------------------------

/** Z depth of each stair step — compressed so all 8 steps + landing fit within the house depth. */
export const STAIR_STEP_DEPTH = 0.75
/** Z position where the first step starts */
export const STAIR_START_Z = 0.5

function buildStaircase(group: THREE.Group, staircaseX: Record<1 | 2, number>): void {
  // Each floor's staircase corridor starts at staircaseX[floor].
  // The corridor is 5 wide; steps are 3 wide, centered in the corridor.
  // 8 steps per floor (one step per voxel of FLOOR_HEIGHT).
  // Steps rise in Y and advance in Z (front→back).
  // Step depth is compressed to 0.75 so all geometry stays clear of the
  // back wall (inner face at z=7.0).

  const stairSteps = FLOOR_HEIGHT
  const stepWidth = 3

  for (let f = 1; f <= FLOOR_COUNT - 1; f++) {
    const floor = f as 1 | 2
    const stairXStart = staircaseX[floor]
    const stepCenterX = stairXStart + 2.5
    const baseY = floorY(floor)

    for (let step = 0; step < stairSteps; step++) {
      const stepTopY = baseY + 1 + (step + 1)
      const stepCenterY = stepTopY - 0.5
      const stepCenterZ = STAIR_START_Z + step * STAIR_STEP_DEPTH + STAIR_STEP_DEPTH / 2

      group.add(
        makeVoxel(
          { x: stepCenterX, y: stepCenterY, z: stepCenterZ },
          PALETTE.STAIRCASE,
          { x: stepWidth, y: 1, z: STAIR_STEP_DEPTH },
          'structural',
        ),
      )
    }

    // Landing platform at the top — sits just past the last step
    const landingTopY = baseY + FLOOR_HEIGHT + 1
    const landingZ = STAIR_START_Z + stairSteps * STAIR_STEP_DEPTH + STAIR_STEP_DEPTH / 2
    group.add(
      makeVoxel(
        { x: stepCenterX, y: landingTopY - 0.5, z: landingZ },
        PALETTE.STAIRCASE,
        { x: stepWidth, y: 1, z: STAIR_STEP_DEPTH },
        'structural',
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
// Wall clock builder
// ---------------------------------------------------------------------------

export interface ClockHands {
  hourHand: THREE.Group
  minuteHand: THREE.Group
}

/**
 * Builds an analog wall clock centered at (cx, cy) on the back wall.
 * Returns pivot groups for the hour and minute hands so the renderer can
 * rotate them each frame.
 */
function buildWallClock(
  group: THREE.Group,
  cx: number,
  cy: number,
): ClockHands {
  // Frame centre z — back face rests at z≈7.0 (interior face of back wall).
  // Camera is at z≈−26 looking in +z, so smaller z = closer to camera = renders
  // on top. Offsets below use z − delta so face/ticks/hands appear in front of
  // the frame as expected.
  const z = 6.87

  // Frame (dark wood) — rearmost layer, visible only at the border
  group.add(makeVoxel({ x: cx, y: cy, z: z },            0x3d200a, { x: 3.3, y: 3.3, z: 0.13 }))
  // Face (cream) — in front of frame, fills the interior
  group.add(makeVoxel({ x: cx, y: cy, z: z - 0.07 },     0xfff8e8, { x: 2.9, y: 2.9, z: 0.10 }))

  // 12 hour tick marks positioned around the face at radius 1.18
  const TICK_RADIUS = 1.18
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const tx = cx + Math.sin(angle) * TICK_RADIUS
    const ty = cy + Math.cos(angle) * TICK_RADIUS
    const isQuarter = i % 3 === 0
    const tw = isQuarter ? 0.28 : 0.17
    group.add(makeVoxel({ x: tx, y: ty, z: z - 0.14 }, 0x2a1506, { x: tw, y: tw, z: 0.07 }))
  }

  // Hour hand — pivot at clock centre, hand extends upward
  const hourPivot = new THREE.Group()
  hourPivot.position.set(cx, cy, z - 0.18)
  const hourMesh = makeVoxel({ x: 0, y: 0.22, z: 0 }, 0x111111, { x: 0.22, y: 0.60, z: 0.09 })
  hourPivot.add(hourMesh)
  group.add(hourPivot)

  // Minute hand — slightly thinner & longer
  const minutePivot = new THREE.Group()
  minutePivot.position.set(cx, cy, z - 0.20)
  const minuteMesh = makeVoxel({ x: 0, y: 0.35, z: 0 }, 0x111111, { x: 0.15, y: 0.88, z: 0.07 })
  minutePivot.add(minuteMesh)
  group.add(minutePivot)

  // Centre pin (closest to camera — renders on top of everything)
  group.add(makeVoxel({ x: cx, y: cy, z: z - 0.23 }, 0x111111, { x: 0.20, y: 0.20, z: 0.10 }))

  return { hourHand: hourPivot, minuteHand: minutePivot }
}

// ---------------------------------------------------------------------------
// House result type
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lamp tracking — each room can have a toggleable lamp with a PointLight
// ---------------------------------------------------------------------------

export interface LampRecord {
  roomId: LayoutRoomId
  /** The shade mesh whose emissive we toggle */
  shade: THREE.Mesh
  /** The PointLight sitting at the shade position */
  light: THREE.PointLight
  /** Spill lights above and below the shade for directional glow */
  spillLights: THREE.PointLight[]
}

/** Warm lamp color */
const LAMP_COLOR = 0xffe0a0
/** PointLight intensity when on (candelas — Three.js v0.171+ physically correct) */
const LAMP_INTENSITY = 20
/** PointLight distance (cutoff radius) */
const LAMP_DISTANCE = 25
/** Spill light intensity (above/below shade, candelas) */
const LAMP_SPILL_INTENSITY = 10
/** Spill light distance */
const LAMP_SPILL_DISTANCE = 15
/** Light decay: 1 = linear falloff (spreads further than physically correct quadratic) */
const LAMP_DECAY = 1
/** Lamp shade color when OFF (static cream) */
const LAMP_SHADE_OFF = 0xfff4c0
/** Lamp shade emissive color when ON */
const LAMP_SHADE_EMISSIVE = 0xffe0a0

/**
 * Turns a lamp ON or OFF: toggles the PointLight intensity, spill lights,
 * and shade emissive.
 */
export function setLampOn(lamp: LampRecord, on: boolean): void {
  lamp.light.intensity = on ? LAMP_INTENSITY : 0
  for (const spill of lamp.spillLights) {
    spill.intensity = on ? LAMP_SPILL_INTENSITY : 0
  }
  const mat = lamp.shade.material as THREE.MeshLambertMaterial
  if (on) {
    mat.emissive.setHex(LAMP_SHADE_EMISSIVE)
    mat.emissiveIntensity = 1.0
  } else {
    mat.emissive.setHex(0x000000)
    mat.emissiveIntensity = 0
  }
}

/**
 * Creates a lamp shade mesh + PointLight at the given position and registers
 * it in the lamps array.  The lamp starts OFF.
 *
 * Two spill lights are added above and below the shade to simulate light
 * escaping from the top and bottom of the lamp shade.
 */
function addLamp(
  group: THREE.Group,
  roomId: LayoutRoomId,
  position: Vec3,
  size: Vec3,
  lamps: LampRecord[] | undefined,
): THREE.Mesh {
  const shade = makeVoxel(position, LAMP_SHADE_OFF, size)
  group.add(shade)

  const light = new THREE.PointLight(LAMP_COLOR, 0, LAMP_DISTANCE, LAMP_DECAY)
  light.position.set(position.x, position.y, position.z)
  group.add(light)

  // Spill lights above and below the shade
  const spillTop = new THREE.PointLight(LAMP_COLOR, 0, LAMP_SPILL_DISTANCE, LAMP_DECAY)
  spillTop.position.set(position.x, position.y + size.y / 2 + 0.3, position.z)
  group.add(spillTop)

  const spillBottom = new THREE.PointLight(LAMP_COLOR, 0, LAMP_SPILL_DISTANCE, LAMP_DECAY)
  spillBottom.position.set(position.x, position.y - size.y / 2 - 0.3, position.z)
  group.add(spillBottom)

  if (lamps) {
    lamps.push({ roomId, shade, light, spillLights: [spillTop, spillBottom] })
  }
  return shade
}

// ---------------------------------------------------------------------------
// Plant — big fern with health-dependent coloring
// ---------------------------------------------------------------------------

/** Healthy fern leaf color (lush green) */
export const PLANT_COLOR_HEALTHY = 0x2d8a1e
/** Dead fern leaf color (dark brown) */
export const PLANT_COLOR_DEAD = 0x4a3520
/** Terracotta pot color */
const PLANT_POT_COLOR = 0xb85c2a
/** Soil color */
const PLANT_SOIL_COLOR = 0x3a2510

/**
 * Builds a large potted fern. Returns the frond meshes so the renderer can
 * update their color each frame based on plant health.
 *
 * @param cx  world x center of the plant
 * @param ft  floor top y (bottom of pot)
 * @param z   world z center of the plant
 */
function buildFernPlant(
  group: THREE.Group,
  cx: number,
  ft: number,
  z: number,
  plant?: PlantRecord,
): void {
  // Pot body
  group.add(makeVoxel({ x: cx, y: ft + 0.6, z }, PLANT_POT_COLOR, { x: 1.5, y: 1.2, z: 1.5 }))
  // Pot rim
  group.add(makeVoxel({ x: cx, y: ft + 1.25, z }, 0xc06930, { x: 1.7, y: 0.2, z: 1.7 }))
  // Soil
  group.add(makeVoxel({ x: cx, y: ft + 1.4, z }, PLANT_SOIL_COLOR, { x: 1.2, y: 0.1, z: 1.2 }))

  // Frond leaves — radiating outward from center
  const frondColor = PLANT_COLOR_HEALTHY
  const fronds: THREE.Mesh[] = []

  function addFrond(pos: Vec3, size: Vec3): void {
    const mesh = makeVoxel(pos, frondColor, size)
    group.add(mesh)
    fronds.push(mesh)
  }

  // Center tall fronds
  addFrond({ x: cx, y: ft + 2.8, z }, { x: 0.4, y: 2.2, z: 0.3 })
  addFrond({ x: cx + 0.3, y: ft + 2.6, z: z - 0.1 }, { x: 0.3, y: 1.8, z: 0.25 })
  addFrond({ x: cx - 0.3, y: ft + 2.6, z: z + 0.1 }, { x: 0.3, y: 1.8, z: 0.25 })

  // Side-spreading fronds
  addFrond({ x: cx + 0.9, y: ft + 2.2, z }, { x: 0.4, y: 1.5, z: 0.3 })
  addFrond({ x: cx - 0.9, y: ft + 2.2, z }, { x: 0.4, y: 1.5, z: 0.3 })
  addFrond({ x: cx, y: ft + 2.1, z: z + 0.7 }, { x: 0.3, y: 1.3, z: 0.4 })
  addFrond({ x: cx, y: ft + 2.1, z: z - 0.7 }, { x: 0.3, y: 1.3, z: 0.4 })

  // Lower drooping fronds
  addFrond({ x: cx + 1.1, y: ft + 1.8, z: z + 0.4 }, { x: 0.35, y: 0.9, z: 0.3 })
  addFrond({ x: cx - 1.1, y: ft + 1.8, z: z - 0.4 }, { x: 0.35, y: 0.9, z: 0.3 })
  addFrond({ x: cx + 0.6, y: ft + 1.7, z: z - 0.8 }, { x: 0.3, y: 0.8, z: 0.3 })
  addFrond({ x: cx - 0.6, y: ft + 1.7, z: z + 0.8 }, { x: 0.3, y: 0.8, z: 0.3 })

  // Leafy tips at the edges (wider look)
  addFrond({ x: cx + 1.3, y: ft + 2.5, z: z - 0.3 }, { x: 0.25, y: 1.0, z: 0.2 })
  addFrond({ x: cx - 1.3, y: ft + 2.5, z: z + 0.3 }, { x: 0.25, y: 1.0, z: 0.2 })

  if (plant) {
    plant.fronds.push(...fronds)
    plant.position = { x: cx, y: ft + 2.5, z }
  }
}

/**
 * Updates all fern frond meshes to reflect the current plant health.
 * health 1 = lush green, health 0 = dead brown.
 */
export function updatePlantColor(plant: PlantRecord, health: number): void {
  const healthy = new THREE.Color(PLANT_COLOR_HEALTHY)
  const dead = new THREE.Color(PLANT_COLOR_DEAD)
  const color = dead.clone().lerp(healthy, Math.max(0, Math.min(1, health)))

  for (const frond of plant.fronds) {
    const mat = frond.material as THREE.MeshLambertMaterial
    mat.color.copy(color)
  }
}

// ---------------------------------------------------------------------------
// Plant tracking — fern frond meshes whose color changes with plant health
// ---------------------------------------------------------------------------

export interface PlantRecord {
  /** All frond meshes whose color changes with plant health */
  fronds: THREE.Mesh[]
  /** World-space position of the plant (center, above pot) for water particles */
  position: Vec3
}

export interface HouseResult {
  group: THREE.Group
  bathroomDoor: THREE.Group
  clockHands: ClockHands
  lamps: LampRecord[]
  plant: PlantRecord
  items: ItemRecord[]
}

// ---------------------------------------------------------------------------
// Room builder dispatch table
// ---------------------------------------------------------------------------

type RoomBuilder = (g: THREE.Group, xMin: number, xMax: number, floor: 1 | 2 | 3, lamps?: LampRecord[], plant?: PlantRecord, items?: ItemRecord[]) => void

const ROOM_BUILDERS: Readonly<Record<LayoutRoomId, RoomBuilder>> = {
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
  const stepCenterX = stairXStart + 2.5
  const baseY = floorY(floor)
  for (let step = 0; step < stairSteps; step++) {
    const stepTopY = baseY + 1 + (step + 1)
    group.add(
      makeVoxel(
        { x: stepCenterX, y: stepTopY - 0.5, z: STAIR_START_Z + step * STAIR_STEP_DEPTH + STAIR_STEP_DEPTH / 2 },
        PALETTE.STAIRCASE,
        { x: stepWidth, y: 1, z: STAIR_STEP_DEPTH },
      ),
    )
  }
  // Landing platform
  const landingZ = STAIR_START_Z + stairSteps * STAIR_STEP_DEPTH + STAIR_STEP_DEPTH / 2
  group.add(
    makeVoxel(
      { x: stepCenterX, y: baseY + FLOOR_HEIGHT + 0.5, z: landingZ },
      PALETTE.STAIRCASE,
      { x: stepWidth, y: 1, z: STAIR_STEP_DEPTH },
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

  // Build furniture for each room slot (collecting lamp records, plant fronds, and item records)
  const lamps: LampRecord[] = []
  const plant: PlantRecord = { fronds: [], position: { x: 0, y: 0, z: 0 } }
  const items: ItemRecord[] = []
  _nextItemId = 0
  for (const slot of layout.slots) {
    const builder = ROOM_BUILDERS[slot.roomId]
    builder(house, slot.xMin, slot.xMax, slot.floor, lamps, slot.roomId === 'living_room' ? plant : undefined, items)
  }

  // Staircase (per-floor independent positioning)
  buildStaircase(house, layout.staircaseX)

  // Bathroom door — positioned from layout
  const bathroomSlot = layout.slotMap.bathroom
  const bathroomDoor = buildBathroomDoorForSlot(bathroomSlot)
  house.add(bathroomDoor)

  // Wall clock — placed on the back wall of the living room
  const livingSlot = layout.slotMap.living_room
  const clockCx = (livingSlot.xMin + livingSlot.xMax) / 2
  const clockCy = floorY(livingSlot.floor) + 1 + 4.5
  const clockHands = buildWallClock(house, clockCx, clockCy)

  return { group: house, bathroomDoor, clockHands, lamps, plant, items }
}
