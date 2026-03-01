// ---------------------------------------------------------------------------
// Layout Editor — drag-to-swap room/staircase rearrangement interaction
// ---------------------------------------------------------------------------
//
// Lifecycle:
//   IDLE → (long press 500ms) → DRAGGING → (release over target) → SWAP → FLASH → IDLE
//                                               ↓ (release over empty/source)
//                                             IDLE
//
// Visual overlays:
//   - Selected slot: blue tint on source slot (shows it's "picked up" / empty)
//   - Drag ghost: source slot following the cursor (semi-transparent)
//   - Hover highlight: teal tint on valid target; red X on invalid target
//   - Swap flash: white flash on both slots (150ms)
//
// Staircase drag: long-press staircase column → drag to any room on same floor → swap

import * as THREE from 'three'
import type { HouseLayout, LayoutRoomId, RoomSlot } from '@/lib/layout'
import { roomOrderFromLayout, getWallBounds } from '@/lib/layout'
import { FLOOR_HEIGHT, HOUSE_WIDTH, buildRoomFurnitureGroup, buildStaircaseGhostGroup } from './house'

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
// DraggableSlot — union of room and staircase slots
// ---------------------------------------------------------------------------

export type DraggableSlot =
  | { kind: 'room'; slot: RoomSlot }
  | { kind: 'staircase'; floor: 1 | 2; xMin: number; xMax: number; centerX: number }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function floorY(floor: 1 | 2 | 3): number {
  return (floor - 1) * FLOOR_HEIGHT
}

/** Build a flat transparent box overlay for a rect defined by xMin/xMax/floor */
function makeOverlayRect(
  xMin: number, xMax: number, floor: 1 | 2 | 3, color: number, opacity: number,
): THREE.Mesh {
  const width = xMax - xMin
  const height = FLOOR_HEIGHT - 1
  const cx = (xMin + xMax) / 2
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
    cx,
    floorY(floor) + FLOOR_HEIGHT / 2 + 0.5,
    OVERLAY_Z,
  )
  mesh.renderOrder = 999
  return mesh
}

/** Build a flat overlay for a room slot */
function makeOverlay(slot: RoomSlot, color: number, opacity: number): THREE.Mesh {
  return makeOverlayRect(slot.xMin, slot.xMax, slot.floor, color, opacity)
}

/** Build a flat overlay for a draggable slot (room or staircase) */
function makeSlotOverlay(target: DraggableSlot, color: number, opacity: number): THREE.Mesh {
  if (target.kind === 'room') {
    return makeOverlay(target.slot, color, opacity)
  }
  return makeOverlayRect(target.xMin, target.xMax, target.floor, color, opacity)
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
 * Returns true if swapping source and target is a valid operation:
 * - Staircase only swaps with rooms on its own floor (not with other staircases)
 * - Entrance cannot swap with staircase
 * - Entrance can only swap with the leftmost room on its floor (xMin=1)
 */
function isSwapValid(source: DraggableSlot, target: DraggableSlot, _layout: HouseLayout): boolean {
  if (source.kind === 'staircase' && target.kind === 'staircase') return false
  if (source.kind === 'staircase' && target.kind === 'room') {
    if (target.slot.floor !== source.floor) return false
    if (target.slot.roomId === 'entrance') return false
    return true
  }
  if (source.kind === 'room' && target.kind === 'staircase') {
    if (source.slot.floor !== target.floor) return false
    if (source.slot.roomId === 'entrance') return false
    return true
  }
  // room–room
  const sourceSlot = (source as { kind: 'room'; slot: RoomSlot }).slot
  const targetSlot = (target as { kind: 'room'; slot: RoomSlot }).slot
  if (sourceSlot.roomId === 'entrance') {
    return targetSlot.xMin === 1
  }
  if (targetSlot.roomId === 'entrance') {
    return sourceSlot.xMin === 1
  }
  return true
}

/** Build a red semi-transparent "invalid" overlay (background + X bars) for a draggable slot */
function makeInvalidOverlay(target: DraggableSlot): THREE.Group {
  const group = new THREE.Group()
  const xMin = target.kind === 'room' ? target.slot.xMin : target.xMin
  const xMax = target.kind === 'room' ? target.slot.xMax : target.xMax
  const floor = target.kind === 'room' ? target.slot.floor : target.floor
  const width = xMax - xMin
  const height = FLOOR_HEIGHT - 1
  const cx = (xMin + xMax) / 2
  const cy = floorY(floor) + FLOOR_HEIGHT / 2 + 0.5

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

  const barLen = Math.sqrt(width * width + height * height) * 0.9
  const barH = 0.4
  const angle = Math.atan2(height, width)
  const barMat = new THREE.MeshBasicMaterial({ color: COLOR_INVALID_X, depthWrite: false })
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
 * Given a world-space point, returns the room slot it falls inside, or null.
 */
function roomSlotAtWorld(
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
 * Given a world-space point, returns the staircase slot it falls inside, or null.
 */
function staircaseSlotAtWorld(
  worldX: number,
  worldY: number,
  layout: HouseLayout,
): { floor: 1 | 2; xMin: number; xMax: number; centerX: number } | null {
  for (const floor of [1, 2] as const) {
    const yMin = floorY(floor)
    const yMax = yMin + FLOOR_HEIGHT
    const bounds = layout.stairBounds[floor]
    if (worldX >= bounds.xMin && worldX <= bounds.xMax && worldY >= yMin && worldY <= yMax) {
      return { floor, xMin: bounds.xMin, xMax: bounds.xMax, centerX: bounds.centerX }
    }
  }
  return null
}

/**
 * Given a world-space point, find if it's near an interior wall.
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

/**
 * Computes the result of swapping the staircase on a floor with a room on that floor.
 * Returns the new room order and new staircaseIndex.
 */
export function computeStaircaseRoomSwap(
  floor: 1 | 2,
  roomOrder: LayoutRoomId[],
  staircaseIndex: Record<1 | 2, number>,
  targetRoomId: LayoutRoomId,
): { newRoomOrder: LayoutRoomId[]; newStaircaseIndex: Record<1 | 2, number> } {
  const floorStart = floor === 1 ? 0 : 3
  const nRooms = 3
  const I = staircaseIndex[floor]  // current staircase combined index

  const floorRooms = roomOrder.slice(floorStart, floorStart + nRooms)
  const K = floorRooms.indexOf(targetRoomId)  // room-only index

  let newFloorRooms: LayoutRoomId[]
  let newStaircaseIdx: number

  if (K < I) {
    // Room is before staircase in combined sequence
    // Staircase moves to room's combined position (= K)
    // Room moves to staircase's position (combined I → room-only I-1 after removing K)
    newStaircaseIdx = K
    newFloorRooms = [
      ...floorRooms.slice(0, K),        // rooms before K
      ...floorRooms.slice(K + 1, I),    // rooms between K and staircase
      floorRooms[K],                    // K moved to staircase's old position
      ...floorRooms.slice(I),           // rooms after staircase
    ]
  } else {
    // Room is after staircase in combined sequence (K >= I)
    // Staircase moves to room's combined position (= K+1)
    // Room moves to staircase's position (combined I)
    newStaircaseIdx = K + 1
    newFloorRooms = [
      ...floorRooms.slice(0, I),        // rooms before staircase
      floorRooms[K],                    // K moved to staircase's old position
      ...floorRooms.slice(I, K),        // rooms between staircase and K
      ...floorRooms.slice(K + 1),       // rooms after K
    ]
  }

  const newRoomOrder: LayoutRoomId[] = [
    ...roomOrder.slice(0, floorStart),
    ...newFloorRooms,
    ...roomOrder.slice(floorStart + nRooms),
  ]

  return {
    newRoomOrder,
    newStaircaseIndex: { ...staircaseIndex, [floor]: newStaircaseIdx },
  }
}

// ---------------------------------------------------------------------------
// EditorState
// ---------------------------------------------------------------------------

type EditorState =
  | { kind: 'idle' }
  | {
      kind: 'dragging'
      source: DraggableSlot
      hoverTarget: DraggableSlot | null
      cursorWorldX: number
      cursorWorldY: number
    }
  | {
      kind: 'dragging_wall'
      floor: 1 | 2 | 3
      wallIndex: number
      startWorldX: number
      startWallX: number
    }
  | { kind: 'flash'; elapsed: number }

// ---------------------------------------------------------------------------
// LayoutEditor
// ---------------------------------------------------------------------------

export class LayoutEditor {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private canvas: HTMLCanvasElement
  private layout: HouseLayout
  private onSwap: (newRoomOrder: LayoutRoomId[], newStaircaseIndex: Record<1 | 2, number>) => void
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
  /** Tracks the last hovered target id to avoid redundant ghost rebuilds */
  private lastHoverTargetId: string | null = null
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
    onSwap: (newRoomOrder: LayoutRoomId[], newStaircaseIndex: Record<1 | 2, number>) => void
    onWallMove?: (floor: 1 | 2 | 3, wallIndex: number, newX: number) => void
    onWallDragEnd?: () => void
  }) {
    this.scene = params.scene
    this.camera = params.camera
    this.canvas = params.canvas
    this.layout = params.layout
    this.onSwap = params.onSwap
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
      this.state.kind === 'dragging_wall'
    )
  }

  onPointerDown(screenX: number, screenY: number): void {
    const world = this.screenToWorld(screenX, screenY)

    // Check interior walls first (narrow target — higher priority)
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

    // Check staircase column — initiates staircase drag-to-swap
    const stairHit = staircaseSlotAtWorld(world.x, world.y, this.layout)
    if (stairHit !== null) {
      const source: DraggableSlot = { kind: 'staircase', ...stairHit }
      this.state = {
        kind: 'dragging',
        source,
        hoverTarget: null,
        cursorWorldX: world.x,
        cursorWorldY: world.y,
      }
      this.showStaircaseSelectedOverlay(stairHit)
      this.showStaircaseDragGhost(stairHit, world.x, world.y)
      return
    }

    // Check room slot
    const slot = roomSlotAtWorld(world.x, world.y, this.layout)
    if (!slot) return

    const source: DraggableSlot = { kind: 'room', slot }
    this.state = {
      kind: 'dragging',
      source,
      hoverTarget: null,
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

    if (this.state.kind !== 'dragging') return

    const world = this.screenToWorld(screenX, screenY)
    this.state.cursorWorldX = world.x
    this.state.cursorWorldY = world.y

    // Move drag ghost to follow cursor
    this.updateDragGhostPosition(this.state.source, world.x, world.y)

    // Determine hover target based on source kind
    const source = this.state.source
    let newTarget: DraggableSlot | null = null
    let newTargetId: string | null = null

    const hoveredRoom = roomSlotAtWorld(world.x, world.y, this.layout)
    const hoveredStair = staircaseSlotAtWorld(world.x, world.y, this.layout)

    if (source.kind === 'room') {
      if (hoveredRoom && hoveredRoom.roomId !== source.slot.roomId) {
        newTarget = { kind: 'room', slot: hoveredRoom }
        newTargetId = hoveredRoom.roomId
      } else if (hoveredStair && hoveredStair.floor === source.slot.floor) {
        // Only allow swapping room with staircase on same floor
        newTarget = { kind: 'staircase', ...hoveredStair }
        newTargetId = 'staircase'
      }
    } else {
      // source is staircase — only hover rooms on the same floor
      if (hoveredRoom && hoveredRoom.floor === source.floor) {
        newTarget = { kind: 'room', slot: hoveredRoom }
        newTargetId = hoveredRoom.roomId
      }
    }

    if (newTargetId !== this.lastHoverTargetId) {
      this.lastHoverTargetId = newTargetId
      this.state.hoverTarget = null
      this.clearHoverGhost()
      this.clearInvalidOverlay()

      if (newTarget) {
        if (isSwapValid(source, newTarget, this.layout)) {
          this.state.hoverTarget = newTarget
          this.showHoverHighlight(source, newTarget)
        } else {
          this.showInvalidOverlay(newTarget)
        }
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

    if (this.state.kind === 'dragging') {
      if (this.state.hoverTarget) {
        this.executeSwap(this.state.source, this.state.hoverTarget)
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

  /** Replace layout after external update (e.g. conflict resolution or wall move) */
  setLayout(layout: HouseLayout): void {
    this.layout = layout
    // If mid-interaction (other than wall drag), cancel since the layout changed under us
    if (this.state.kind !== 'idle' && this.state.kind !== 'dragging_wall') {
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

  private executeSwap(source: DraggableSlot, target: DraggableSlot): void {
    let newRoomOrder: LayoutRoomId[]
    let newStaircaseIndex: Record<1 | 2, number>

    if (source.kind === 'room' && target.kind === 'room') {
      // Room–room swap: just reorder
      const currentOrder = roomOrderFromLayout(this.layout)
      const srcIdx = currentOrder.indexOf(source.slot.roomId)
      const tgtIdx = currentOrder.indexOf(target.slot.roomId)
      if (srcIdx === -1 || tgtIdx === -1) return
      newRoomOrder = [...currentOrder]
      newRoomOrder[srcIdx] = target.slot.roomId
      newRoomOrder[tgtIdx] = source.slot.roomId
      newStaircaseIndex = this.layout.staircaseIndex
    } else {
      // Staircase–room or room–staircase swap
      const floor = source.kind === 'staircase' ? source.floor : (target as { floor: 1|2 }).floor
      const targetRoomId = source.kind === 'staircase'
        ? (target as { kind: 'room'; slot: RoomSlot }).slot.roomId
        : source.slot.roomId
      const currentOrder = roomOrderFromLayout(this.layout)
      const result = computeStaircaseRoomSwap(floor, currentOrder, this.layout.staircaseIndex, targetRoomId)
      newRoomOrder = result.newRoomOrder
      newStaircaseIndex = result.newStaircaseIndex
    }

    // Flash effect on both slots
    this.clearAllOverlays()
    this.flashOverlayA = makeSlotOverlay(source, COLOR_FLASH, 0.5)
    this.flashOverlayB = makeSlotOverlay(target, COLOR_FLASH, 0.5)
    this.overlayGroup.add(this.flashOverlayA)
    this.overlayGroup.add(this.flashOverlayB)
    this.state = { kind: 'flash', elapsed: 0 }

    // Notify renderer to rebuild
    this.onSwap(newRoomOrder, newStaircaseIndex)
  }

  // -----------------------------------------------------------------------
  // Private: ghost management
  // -----------------------------------------------------------------------

  private showDragGhost(slot: RoomSlot, worldX: number, worldY: number): void {
    this.clearDragGhost()
    this.dragGhost = buildRoomFurnitureGroup(slot.roomId, slot.xMin, slot.xMax, slot.floor)
    this.dragGhost.position.z = GHOST_Z
    applyGroupOpacity(this.dragGhost, DRAG_GHOST_OPACITY)
    this.dragGhost.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.renderOrder = 998
    })
    this.updateDragGhostPosition({ kind: 'room', slot }, worldX, worldY)
    this.overlayGroup.add(this.dragGhost)
  }

  private showStaircaseDragGhost(
    stair: { floor: 1 | 2; xMin: number; xMax: number; centerX: number },
    worldX: number,
    worldY: number,
  ): void {
    this.clearDragGhost()
    const ghostGroup = buildStaircaseGhostGroup(stair.floor, stair.xMin)
    ghostGroup.position.z = GHOST_Z
    applyGroupOpacity(ghostGroup, DRAG_GHOST_OPACITY)
    ghostGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.renderOrder = 998
    })
    this.dragGhost = ghostGroup
    this.updateDragGhostPosition({ kind: 'staircase', ...stair }, worldX, worldY)
    this.overlayGroup.add(this.dragGhost)
  }

  private updateDragGhostPosition(source: DraggableSlot, worldX: number, worldY: number): void {
    if (!this.dragGhost) return
    if (source.kind === 'room') {
      const slotCenterY = floorY(source.slot.floor) + FLOOR_HEIGHT / 2
      this.dragGhost.position.x = worldX - source.slot.centerX
      this.dragGhost.position.y = worldY - slotCenterY
    } else {
      const slotCenterY = floorY(source.floor) + FLOOR_HEIGHT / 2
      this.dragGhost.position.x = worldX - source.centerX
      this.dragGhost.position.y = worldY - slotCenterY
    }
  }

  private showHoverHighlight(source: DraggableSlot, target: DraggableSlot): void {
    this.clearHoverGhost()
    // For room–room: show source furniture at target position
    if (source.kind === 'room' && target.kind === 'room') {
      this.hoverGhost = buildRoomFurnitureGroup(
        source.slot.roomId,
        target.slot.xMin,
        target.slot.xMax,
        target.slot.floor,
      )
      this.hoverGhost.position.z = GHOST_Z
      this.hoverGhostMaterials = initGhostMaterials(this.hoverGhost, HOVER_GHOST_OPACITY, 997)
      this.overlayGroup.add(this.hoverGhost)
    } else {
      // For staircase swaps: simple teal highlight on target
      const highlightGroup = new THREE.Group()
      highlightGroup.add(makeSlotOverlay(target, 0x44ffcc, 0.3))
      this.hoverGhost = highlightGroup
      this.overlayGroup.add(this.hoverGhost)
    }
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
    const rect = this.canvas.getBoundingClientRect()
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1
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

  private showStaircaseSelectedOverlay(stair: { floor: 1|2; xMin: number; xMax: number }): void {
    this.clearSelectedOverlay()
    this.selectedOverlay = makeOverlayRect(stair.xMin, stair.xMax, stair.floor, COLOR_SELECTED, 0.25)
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

  private showInvalidOverlay(target: DraggableSlot): void {
    this.clearInvalidOverlay()
    this.invalidOverlay = makeInvalidOverlay(target)
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
