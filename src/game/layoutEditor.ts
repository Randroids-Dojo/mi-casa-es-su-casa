// ---------------------------------------------------------------------------
// Layout Editor — drag-to-swap room rearrangement interaction
// ---------------------------------------------------------------------------
//
// Lifecycle:
//   IDLE → (long press 500ms) → DRAGGING → (release over target) → SWAP → FLASH → IDLE
//                                               ↓ (release over empty/source)
//                                             IDLE
//
// Visual overlays:
//   - Selected room: blue tint on source slot (shows it's "picked up" / empty)
//   - Drag ghost: source room furniture following the cursor (semi-transparent)
//   - Hover ghost: source room furniture previewed at target slot
//   - Swap flash: white flash on both rooms (150ms)

import * as THREE from 'three'
import type { HouseLayout, LayoutRoomId, RoomSlot } from '@/lib/layout'
import { roomOrderFromLayout, getStaircaseXBounds, getWallBounds } from '@/lib/layout'
import { FLOOR_HEIGHT, HOUSE_WIDTH, buildRoomFurnitureGroup } from './house'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds the white flash stays after a swap */
const FLASH_DURATION = 0.15
/** Z position for flat overlay meshes (slightly in front of house) */
const OVERLAY_Z = -0.05
/** Z offset for ghost furniture groups (clearly in front of house geometry) */
const GHOST_Z = -0.3

// Colors
const COLOR_SELECTED = 0x4488ff
const COLOR_FLASH = 0xffffff
const COLOR_INVALID_BG = 0xff2222
const COLOR_INVALID_X = 0xff0000
const COLOR_WALL_DRAG = 0x44ffcc

/** World-unit tolerance for clicking near an interior wall */
const WALL_HIT_TOLERANCE = 1.5

// Ghost opacities
const DRAG_GHOST_OPACITY = 0.65
const HOVER_GHOST_OPACITY = 0.4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function floorY(floor: 1 | 2 | 3): number {
  return (floor - 1) * FLOOR_HEIGHT
}

/** Build a flat transparent box overlay for a room slot */
function makeOverlay(slot: RoomSlot, color: number, opacity: number): THREE.Mesh {
  const width = slot.xMax - slot.xMin
  const height = FLOOR_HEIGHT - 1
  const geo = new THREE.BoxGeometry(width, height, 0.1)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(
    slot.centerX,
    floorY(slot.floor) + FLOOR_HEIGHT / 2 + 0.5,
    OVERLAY_Z,
  )
  mesh.renderOrder = 999
  return mesh
}

/** Traverse a group and set transparent + depthWrite=false on all mesh materials */
function applyGroupOpacity(group: THREE.Group, opacity: number): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshLambertMaterial
      mat.transparent = true
      mat.opacity = opacity
      mat.depthWrite = false
    }
  })
}

/** Traverse a group, collect all mesh materials, and configure them for ghost rendering */
function initGhostMaterials(group: THREE.Group, opacity: number, renderOrder: number): THREE.MeshLambertMaterial[] {
  const mats: THREE.MeshLambertMaterial[] = []
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshLambertMaterial
      mat.transparent = true
      mat.opacity = opacity
      mat.depthWrite = false
      obj.renderOrder = renderOrder
      mats.push(mat)
    }
  })
  return mats
}

/** Dispose geometry and materials for all meshes in a group */
function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose())
      } else {
        obj.material.dispose()
      }
    }
  })
}

/**
 * Returns true if swapping source and target rooms preserves the invariant
 * that entrance is always the rightmost room on its floor.
 */
function isSwapValid(source: RoomSlot, target: RoomSlot, _layout: HouseLayout): boolean {
  if (source.roomId === 'entrance') {
    // Entrance can only move to the leftmost slot on the target's floor (xMin=1 = rightmost on screen)
    return target.xMin === 1
  }
  if (target.roomId === 'entrance') {
    // Entrance will end up at source's slot — source must be leftmost on its floor
    return source.xMin === 1
  }
  return true
}

/** Build a red semi-transparent "invalid" overlay (background + X bars) for a slot */
function makeInvalidOverlay(slot: RoomSlot): THREE.Group {
  const group = new THREE.Group()
  const width = slot.xMax - slot.xMin
  const height = FLOOR_HEIGHT - 1
  const cx = slot.centerX
  const cy = floorY(slot.floor) + FLOOR_HEIGHT / 2 + 0.5

  // Red semi-transparent background
  const bgGeo = new THREE.BoxGeometry(width, height, 0.1)
  const bgMat = new THREE.MeshBasicMaterial({
    color: COLOR_INVALID_BG,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const bg = new THREE.Mesh(bgGeo, bgMat)
  bg.position.set(cx, cy, OVERLAY_Z)
  bg.renderOrder = 999
  group.add(bg)

  // X bars — two diagonal bars crossing the slot
  const barLen = Math.sqrt(width * width + height * height) * 0.9
  const barH = 0.4
  const angle = Math.atan2(height, width)
  const barMat = new THREE.MeshBasicMaterial({
    color: COLOR_INVALID_X,
    depthWrite: false,
  })

  const barGeo = new THREE.BoxGeometry(barLen, barH, 0.1)

  const bar1 = new THREE.Mesh(barGeo, barMat)
  bar1.position.set(cx, cy, OVERLAY_Z - 0.01)
  bar1.rotation.z = angle
  bar1.renderOrder = 1000
  group.add(bar1)

  const bar2 = new THREE.Mesh(barGeo, barMat)
  bar2.position.set(cx, cy, OVERLAY_Z - 0.01)
  bar2.rotation.z = -angle
  bar2.renderOrder = 1000
  group.add(bar2)

  return group
}

/**
 * Given a world-space point, returns the floor whose staircase column contains it,
 * or null if outside all staircase columns.
 */
function staircaseFloorAtWorld(
  worldX: number,
  worldY: number,
  layout: HouseLayout,
): 1 | 2 | 3 | null {
  for (const floor of [1, 2, 3] as const) {
    const yMin = floorY(floor)
    const yMax = yMin + FLOOR_HEIGHT
    const xMin = layout.staircaseX[floor]
    if (worldX >= xMin && worldX <= HOUSE_WIDTH && worldY >= yMin && worldY <= yMax) {
      return floor
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/**
 * Given a world-space point, find which room slot it falls inside.
 * Returns null if outside all rooms.
 */
function slotAtWorld(
  worldX: number,
  worldY: number,
  layout: HouseLayout,
): RoomSlot | null {
  for (const slot of layout.slots) {
    const yMin = floorY(slot.floor)
    const yMax = yMin + FLOOR_HEIGHT
    if (worldX >= slot.xMin && worldX <= slot.xMax && worldY >= yMin && worldY <= yMax) {
      return slot
    }
  }
  return null
}

/**
 * Given a world-space point, find if it's near an interior wall.
 * Returns floor, wallIndex within that floor, and the wall's current x, or null.
 */
function wallAtWorld(
  worldX: number,
  worldY: number,
  layout: HouseLayout,
): { floor: 1 | 2 | 3; wallIndex: number; wallX: number } | null {
  for (const floor of [1, 2, 3] as const) {
    const yMin = floorY(floor)
    const yMax = yMin + FLOOR_HEIGHT
    if (worldY < yMin || worldY > yMax) continue

    const floorWalls = layout.walls.filter((w) => w.floor === floor)
    for (let i = 0; i < floorWalls.length; i++) {
      if (Math.abs(worldX - floorWalls[i].x) <= WALL_HIT_TOLERANCE) {
        return { floor, wallIndex: i, wallX: floorWalls[i].x }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// LayoutEditor
// ---------------------------------------------------------------------------

type EditorState =
  | { kind: 'idle' }
  | {
      kind: 'dragging'
      sourceSlot: RoomSlot
      hoverSlot: RoomSlot | null
      cursorWorldX: number
      cursorWorldY: number
    }
  | {
      kind: 'dragging_staircase'
      floor: 1 | 2 | 3
      startWorldX: number
      startStairX: number
    }
  | {
      kind: 'dragging_wall'
      floor: 1 | 2 | 3
      wallIndex: number
      startWorldX: number
      startWallX: number
    }
  | { kind: 'flash'; elapsed: number }

export class LayoutEditor {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private canvas: HTMLCanvasElement
  private layout: HouseLayout
  private onSwap: (newRoomOrder: LayoutRoomId[]) => void
  private onStaircaseMove: ((floor: 1 | 2 | 3, newX: number) => void) | null
  private onStaircaseDragEnd: ((staircaseX: Record<1 | 2 | 3, number>) => void) | null
  private onWallMove: ((floor: 1 | 2 | 3, wallIndex: number, newX: number) => void) | null
  private onWallDragEnd: (() => void) | null

  private overlayGroup: THREE.Group
  private selectedOverlay: THREE.Mesh | null = null
  private dragGhost: THREE.Group | null = null
  private hoverGhost: THREE.Group | null = null
  /** Cached hover ghost materials for efficient per-frame opacity updates */
  private hoverGhostMaterials: THREE.MeshLambertMaterial[] = []
  private flashOverlayA: THREE.Mesh | null = null
  private flashOverlayB: THREE.Mesh | null = null
  private invalidOverlay: THREE.Group | null = null
  /** Tracks the last hovered target to avoid redundant ghost rebuilds */
  private lastHoverTargetId: LayoutRoomId | null = null
  private wallDragOverlayLeft: THREE.Mesh | null = null
  private wallDragOverlayRight: THREE.Mesh | null = null

  private state: EditorState = { kind: 'idle' }

  /** Reusable vector for screenToWorld to avoid per-call allocation */
  private readonly _tmpVec = new THREE.Vector3()

  constructor(params: {
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    canvas: HTMLCanvasElement
    layout: HouseLayout
    onSwap: (newRoomOrder: LayoutRoomId[]) => void
    onStaircaseMove?: (floor: 1 | 2 | 3, newX: number) => void
    onStaircaseDragEnd?: (staircaseX: Record<1 | 2 | 3, number>) => void
    onWallMove?: (floor: 1 | 2 | 3, wallIndex: number, newX: number) => void
    onWallDragEnd?: () => void
  }) {
    this.scene = params.scene
    this.camera = params.camera
    this.canvas = params.canvas
    this.layout = params.layout
    this.onSwap = params.onSwap
    this.onStaircaseMove = params.onStaircaseMove ?? null
    this.onStaircaseDragEnd = params.onStaircaseDragEnd ?? null
    this.onWallMove = params.onWallMove ?? null
    this.onWallDragEnd = params.onWallDragEnd ?? null

    this.overlayGroup = new THREE.Group()
    this.overlayGroup.renderOrder = 999
    this.scene.add(this.overlayGroup)
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  get isActive(): boolean {
    return (
      this.state.kind === 'dragging' ||
      this.state.kind === 'dragging_staircase' ||
      this.state.kind === 'dragging_wall'
    )
  }

  onPointerDown(screenX: number, screenY: number): void {
    const world = this.screenToWorld(screenX, screenY)

    // Check interior walls first (narrow target — higher priority over room slots)
    const wallHit = wallAtWorld(world.x, world.y, this.layout)
    if (wallHit !== null && this.onWallMove) {
      this.state = {
        kind: 'dragging_wall',
        floor: wallHit.floor,
        wallIndex: wallHit.wallIndex,
        startWorldX: world.x,
        startWallX: wallHit.wallX,
      }
      this.showWallDragOverlay(wallHit.floor, wallHit.wallIndex)
      return
    }

    // Check staircase column — initiates staircase drag
    const stairFloor = staircaseFloorAtWorld(world.x, world.y, this.layout)
    if (stairFloor !== null && this.onStaircaseMove) {
      this.state = {
        kind: 'dragging_staircase',
        floor: stairFloor,
        startWorldX: world.x,
        startStairX: this.layout.staircaseX[stairFloor],
      }
      return
    }

    // Check room slot
    const slot = slotAtWorld(world.x, world.y, this.layout)
    if (!slot) return

    this.state = {
      kind: 'dragging',
      sourceSlot: slot,
      hoverSlot: null,
      cursorWorldX: world.x,
      cursorWorldY: world.y,
    }
    this.showSelectedOverlay(slot)
    this.showDragGhost(slot, world.x, world.y)
  }

  onPointerMove(screenX: number, screenY: number): void {
    if (this.state.kind === 'dragging_wall') {
      const wallState = this.state
      const world = this.screenToWorld(screenX, screenY)
      const delta = world.x - wallState.startWorldX
      const rawX = Math.round(wallState.startWallX + delta)
      const { min, max } = getWallBounds(wallState.floor, wallState.wallIndex, this.layout)
      const clampedX = THREE.MathUtils.clamp(rawX, min, max)
      const floorWalls = this.layout.walls.filter((w) => w.floor === wallState.floor)
      if (clampedX !== floorWalls[wallState.wallIndex]?.x) {
        this.onWallMove!(wallState.floor, wallState.wallIndex, clampedX)
      }
      return
    }

    if (this.state.kind === 'dragging_staircase') {
      const world = this.screenToWorld(screenX, screenY)
      const delta = world.x - this.state.startWorldX
      const rawX = Math.round(this.state.startStairX + delta)
      const { min, max } = getStaircaseXBounds(this.state.floor, this.layout)
      const clampedX = THREE.MathUtils.clamp(rawX, min, max)
      if (clampedX !== this.layout.staircaseX[this.state.floor]) {
        this.onStaircaseMove!(this.state.floor, clampedX)
      }
      return
    }

    if (this.state.kind !== 'dragging') return

    const world = this.screenToWorld(screenX, screenY)
    this.state.cursorWorldX = world.x
    this.state.cursorWorldY = world.y

    // Move drag ghost to follow cursor
    this.updateDragGhostPosition(this.state.sourceSlot, world.x, world.y)

    const hovered = slotAtWorld(world.x, world.y, this.layout)

    if (hovered && hovered.roomId !== this.state.sourceSlot.roomId) {
      if (hovered.roomId !== this.lastHoverTargetId) {
        this.lastHoverTargetId = hovered.roomId
        this.clearHoverGhost()
        this.clearInvalidOverlay()

        if (isSwapValid(this.state.sourceSlot, hovered, this.layout)) {
          // Valid swap — show hover ghost preview
          this.state.hoverSlot = hovered
          this.showHoverGhost(this.state.sourceSlot, hovered)
        } else {
          // Invalid swap — show red X overlay, block the swap
          this.state.hoverSlot = null
          this.showInvalidOverlay(hovered)
        }
      }
    } else {
      if (this.lastHoverTargetId !== null) {
        this.lastHoverTargetId = null
        this.state.hoverSlot = null
        this.clearHoverGhost()
        this.clearInvalidOverlay()
      }
    }
  }

  onPointerUp(): void {
    if (this.state.kind === 'dragging_wall') {
      this.onWallDragEnd?.()
      this.clearWallDragOverlay()
      this.state = { kind: 'idle' }
      return
    }

    if (this.state.kind === 'dragging_staircase') {
      this.onStaircaseDragEnd?.(this.layout.staircaseX)
      this.state = { kind: 'idle' }
      return
    }

    if (this.state.kind === 'dragging') {
      if (this.state.hoverSlot) {
        this.executeSwap(this.state.sourceSlot, this.state.hoverSlot)
      } else {
        this.state = { kind: 'idle' }
        this.clearAllOverlays()
      }
    }
  }

  /** Called each frame from the animation loop */
  update(deltaTime: number): void {
    if (this.state.kind === 'flash') {
      this.state.elapsed += deltaTime
      if (this.state.elapsed >= FLASH_DURATION) {
        this.clearAllOverlays()
        this.state = { kind: 'idle' }
      }
    }
  }

  /** Replace layout after external update (e.g. conflict resolution or staircase/wall move) */
  setLayout(layout: HouseLayout): void {
    this.layout = layout
    // If mid-interaction (other than staircase/wall drag), cancel since the layout changed under us
    if (
      this.state.kind !== 'idle' &&
      this.state.kind !== 'dragging_staircase' &&
      this.state.kind !== 'dragging_wall'
    ) {
      this.state = { kind: 'idle' }
      this.clearAllOverlays()
    }
    // Update wall drag overlays to reflect the new room dimensions
    if (this.state.kind === 'dragging_wall') {
      this.showWallDragOverlay(this.state.floor, this.state.wallIndex)
    }
  }

  dispose(): void {
    this.clearAllOverlays()
    this.scene.remove(this.overlayGroup)
  }

  // -----------------------------------------------------------------------
  // Private: swap execution
  // -----------------------------------------------------------------------

  private executeSwap(source: RoomSlot, target: RoomSlot): void {
    // Compute new room order with swapped positions
    const currentOrder = roomOrderFromLayout(this.layout)
    const srcIdx = currentOrder.indexOf(source.roomId)
    const tgtIdx = currentOrder.indexOf(target.roomId)
    if (srcIdx === -1 || tgtIdx === -1) return

    const newOrder = [...currentOrder]
    newOrder[srcIdx] = target.roomId
    newOrder[tgtIdx] = source.roomId

    // Flash effect
    this.clearAllOverlays()
    this.flashOverlayA = makeOverlay(source, COLOR_FLASH, 0.5)
    this.flashOverlayB = makeOverlay(target, COLOR_FLASH, 0.5)
    this.overlayGroup.add(this.flashOverlayA)
    this.overlayGroup.add(this.flashOverlayB)
    this.state = { kind: 'flash', elapsed: 0 }

    // Notify renderer to rebuild
    this.onSwap(newOrder)
  }

  // -----------------------------------------------------------------------
  // Private: ghost management
  // -----------------------------------------------------------------------

  private showDragGhost(slot: RoomSlot, worldX: number, worldY: number): void {
    this.clearDragGhost()
    this.dragGhost = buildRoomFurnitureGroup(slot.roomId, slot.xMin, slot.xMax, slot.floor)
    this.dragGhost.position.z = GHOST_Z
    applyGroupOpacity(this.dragGhost, DRAG_GHOST_OPACITY)
    // Set renderOrder on all meshes so they render in front
    this.dragGhost.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.renderOrder = 998
    })
    this.updateDragGhostPosition(slot, worldX, worldY)
    this.overlayGroup.add(this.dragGhost)
  }

  private updateDragGhostPosition(slot: RoomSlot, worldX: number, worldY: number): void {
    if (!this.dragGhost) return
    // Offset the group so the room's center tracks the cursor
    const slotCenterY = floorY(slot.floor) + FLOOR_HEIGHT / 2
    this.dragGhost.position.x = worldX - slot.centerX
    this.dragGhost.position.y = worldY - slotCenterY
  }

  private showHoverGhost(sourceSlot: RoomSlot, targetSlot: RoomSlot): void {
    this.clearHoverGhost()
    // Build source room furniture at target slot dimensions — previews the swap result
    this.hoverGhost = buildRoomFurnitureGroup(
      sourceSlot.roomId,
      targetSlot.xMin,
      targetSlot.xMax,
      targetSlot.floor,
    )
    this.hoverGhost.position.z = GHOST_Z
    this.hoverGhostMaterials = initGhostMaterials(this.hoverGhost, HOVER_GHOST_OPACITY, 997)
    this.overlayGroup.add(this.hoverGhost)
  }

  private clearDragGhost(): void {
    if (this.dragGhost) {
      this.overlayGroup.remove(this.dragGhost)
      disposeGroup(this.dragGhost)
      this.dragGhost = null
    }
  }

  private clearHoverGhost(): void {
    if (this.hoverGhost) {
      this.overlayGroup.remove(this.hoverGhost)
      disposeGroup(this.hoverGhost)
      this.hoverGhost = null
      this.hoverGhostMaterials = []
    }
  }

  // -----------------------------------------------------------------------
  // Private: screen-to-world coordinate mapping
  // -----------------------------------------------------------------------

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    // Convert screen pixel to NDC (-1 to 1)
    const rect = this.canvas.getBoundingClientRect()
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1

    // Unproject from NDC to world using the orthographic camera
    this._tmpVec.set(ndcX, ndcY, 0).unproject(this.camera)

    return { x: this._tmpVec.x, y: this._tmpVec.y }
  }

  // -----------------------------------------------------------------------
  // Private: overlay management
  // -----------------------------------------------------------------------

  private showWallDragOverlay(floor: 1 | 2 | 3, wallIndex: number): void {
    this.clearWallDragOverlay()
    const floorSlots = this.layout.slots
      .filter((s) => s.floor === floor)
      .sort((a, b) => a.xMin - b.xMin)
    const leftSlot = floorSlots[wallIndex]
    const rightSlot = floorSlots[wallIndex + 1]
    if (!leftSlot || !rightSlot) return
    this.wallDragOverlayLeft = makeOverlay(leftSlot, COLOR_WALL_DRAG, 0.18)
    this.wallDragOverlayRight = makeOverlay(rightSlot, COLOR_WALL_DRAG, 0.18)
    this.overlayGroup.add(this.wallDragOverlayLeft)
    this.overlayGroup.add(this.wallDragOverlayRight)
  }

  private clearWallDragOverlay(): void {
    for (const mesh of [this.wallDragOverlayLeft, this.wallDragOverlayRight]) {
      if (mesh) {
        this.overlayGroup.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
    }
    this.wallDragOverlayLeft = null
    this.wallDragOverlayRight = null
  }

  private showSelectedOverlay(slot: RoomSlot): void {
    this.clearSelectedOverlay()
    this.selectedOverlay = makeOverlay(slot, COLOR_SELECTED, 0.25)
    this.overlayGroup.add(this.selectedOverlay)
  }

  private clearSelectedOverlay(): void {
    if (this.selectedOverlay) {
      this.overlayGroup.remove(this.selectedOverlay)
      this.selectedOverlay.geometry.dispose()
      ;(this.selectedOverlay.material as THREE.Material).dispose()
      this.selectedOverlay = null
    }
  }

  private showInvalidOverlay(slot: RoomSlot): void {
    this.clearInvalidOverlay()
    this.invalidOverlay = makeInvalidOverlay(slot)
    this.overlayGroup.add(this.invalidOverlay)
  }

  private clearInvalidOverlay(): void {
    if (this.invalidOverlay) {
      this.overlayGroup.remove(this.invalidOverlay)
      disposeGroup(this.invalidOverlay)
      this.invalidOverlay = null
    }
  }

  private clearAllOverlays(): void {
    this.clearSelectedOverlay()
    this.clearDragGhost()
    this.clearHoverGhost()
    this.clearInvalidOverlay()
    this.clearWallDragOverlay()
    this.lastHoverTargetId = null

    if (this.flashOverlayA) {
      this.overlayGroup.remove(this.flashOverlayA)
      this.flashOverlayA.geometry.dispose()
      ;(this.flashOverlayA.material as THREE.Material).dispose()
      this.flashOverlayA = null
    }
    if (this.flashOverlayB) {
      this.overlayGroup.remove(this.flashOverlayB)
      this.flashOverlayB.geometry.dispose()
      ;(this.flashOverlayB.material as THREE.Material).dispose()
      this.flashOverlayB = null
    }
  }
}
