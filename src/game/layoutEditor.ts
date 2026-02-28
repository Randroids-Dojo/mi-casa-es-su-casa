// ---------------------------------------------------------------------------
// Layout Editor — drag-to-swap room rearrangement interaction
// ---------------------------------------------------------------------------
//
// Lifecycle:
//   IDLE → (long press 500ms) → DRAGGING → (release) → IDLE
//                                  ↓
//                           (hover 2s) → SWAP → rebuild → DRAGGING
//
// Visual overlays:
//   - Selected room: blue tint
//   - Hover target: yellow tint with rising opacity during dwell
//   - Swap flash: white flash on both rooms (150ms)

import * as THREE from 'three'
import type { HouseLayout, LayoutRoomId, RoomSlot } from '@/lib/layout'
import { roomOrderFromLayout } from '@/lib/layout'
import { FLOOR_HEIGHT } from './house'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds of hover before a swap triggers */
const DWELL_DURATION = 2.0
/** Seconds the white flash stays after a swap */
const FLASH_DURATION = 0.15
/** Z position for overlay meshes (slightly in front of house) */
const OVERLAY_Z = -0.05

// Colors
const COLOR_SELECTED = 0x4488ff
const COLOR_HOVER = 0xffcc44
const COLOR_FLASH = 0xffffff

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

// ---------------------------------------------------------------------------
// Slot neighbor helpers
// ---------------------------------------------------------------------------

interface SlotsByFloor {
  1: RoomSlot[]
  2: RoomSlot[]
  3: RoomSlot[]
}

function groupSlotsByFloor(layout: HouseLayout): SlotsByFloor {
  const result: SlotsByFloor = { 1: [], 2: [], 3: [] }
  for (const slot of layout.slots) {
    result[slot.floor].push(slot)
  }
  for (const f of [1, 2, 3] as const) {
    result[f].sort((a, b) => a.xMin - b.xMin)
  }
  return result
}

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
 * Given drag direction from the source room, find the neighboring room.
 * Returns null if no neighbor exists in that direction.
 */
function findNeighborInDirection(
  source: RoomSlot,
  dx: number,
  dy: number,
  slotsByFloor: SlotsByFloor,
): RoomSlot | null {
  // Determine primary direction
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDx < 5 && absDy < 5) return null // too little movement to determine direction

  if (absDy > absDx) {
    // Vertical: up or down (between floors)
    const targetFloor = dy < 0
      ? (source.floor + 1) as 1 | 2 | 3
      : (source.floor - 1) as 1 | 2 | 3
    if (targetFloor < 1 || targetFloor > 3) return null

    // Find the closest room on the target floor by centerX overlap
    const candidates = slotsByFloor[targetFloor]
    let best: RoomSlot | null = null
    let bestDist = Infinity
    for (const c of candidates) {
      const dist = Math.abs(c.centerX - source.centerX)
      if (dist < bestDist) {
        bestDist = dist
        best = c
      }
    }
    return best
  } else {
    // Horizontal: left or right (same floor)
    const floorSlots = slotsByFloor[source.floor]
    const idx = floorSlots.findIndex((s) => s.roomId === source.roomId)
    if (idx === -1) return null
    if (dx < 0 && idx > 0) return floorSlots[idx - 1]
    if (dx > 0 && idx < floorSlots.length - 1) return floorSlots[idx + 1]
    return null
  }
}

// ---------------------------------------------------------------------------
// LayoutEditor
// ---------------------------------------------------------------------------

type EditorState =
  | { kind: 'idle' }
  | { kind: 'dragging'; sourceSlot: RoomSlot; hoverSlot: RoomSlot | null; dwellTime: number }
  | { kind: 'flash'; elapsed: number }

export class LayoutEditor {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private canvas: HTMLCanvasElement
  private layout: HouseLayout
  private onSwap: (newRoomOrder: LayoutRoomId[]) => void

  private overlayGroup: THREE.Group
  private selectedOverlay: THREE.Mesh | null = null
  private hoverOverlay: THREE.Mesh | null = null
  private flashOverlayA: THREE.Mesh | null = null
  private flashOverlayB: THREE.Mesh | null = null

  private state: EditorState = { kind: 'idle' }
  private slotsByFloor: SlotsByFloor

  // Screen coords of the pointer
  private pointerScreenX = 0
  private pointerScreenY = 0

  constructor(params: {
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    canvas: HTMLCanvasElement
    layout: HouseLayout
    onSwap: (newRoomOrder: LayoutRoomId[]) => void
  }) {
    this.scene = params.scene
    this.camera = params.camera
    this.canvas = params.canvas
    this.layout = params.layout
    this.onSwap = params.onSwap
    this.slotsByFloor = groupSlotsByFloor(params.layout)

    this.overlayGroup = new THREE.Group()
    this.overlayGroup.renderOrder = 999
    this.scene.add(this.overlayGroup)
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  get isActive(): boolean {
    return this.state.kind === 'dragging'
  }

  onPointerDown(screenX: number, screenY: number): void {
    this.pointerScreenX = screenX
    this.pointerScreenY = screenY

    const world = this.screenToWorld(screenX, screenY)
    const slot = slotAtWorld(world.x, world.y, this.layout)
    if (!slot) return

    this.state = { kind: 'dragging', sourceSlot: slot, hoverSlot: null, dwellTime: 0 }
    this.showSelectedOverlay(slot)
  }

  onPointerMove(screenX: number, screenY: number): void {
    this.pointerScreenX = screenX
    this.pointerScreenY = screenY

    if (this.state.kind !== 'dragging') return

    const world = this.screenToWorld(screenX, screenY)
    const hovered = slotAtWorld(world.x, world.y, this.layout)

    // If hovering over a different room (not the source), track it
    if (hovered && hovered.roomId !== this.state.sourceSlot.roomId) {
      if (!this.state.hoverSlot || this.state.hoverSlot.roomId !== hovered.roomId) {
        // New hover target — reset dwell timer
        this.state.hoverSlot = hovered
        this.state.dwellTime = 0
        this.showHoverOverlay(hovered)
      }
    } else {
      // Hovering over source or empty space — clear hover
      if (this.state.hoverSlot) {
        this.state.hoverSlot = null
        this.state.dwellTime = 0
        this.clearHoverOverlay()
      }
    }
  }

  onPointerUp(): void {
    if (this.state.kind === 'dragging') {
      this.state = { kind: 'idle' }
      this.clearAllOverlays()
    }
  }

  /** Called each frame from the animation loop */
  update(deltaTime: number): void {
    if (this.state.kind === 'dragging' && this.state.hoverSlot) {
      this.state.dwellTime += deltaTime

      // Update hover overlay opacity to show progress
      if (this.hoverOverlay) {
        const progress = Math.min(this.state.dwellTime / DWELL_DURATION, 1)
        const mat = this.hoverOverlay.material as THREE.MeshBasicMaterial
        mat.opacity = 0.1 + progress * 0.4
      }

      // Dwell complete — execute swap
      if (this.state.dwellTime >= DWELL_DURATION) {
        this.executeSwap(this.state.sourceSlot, this.state.hoverSlot)
      }
    }

    if (this.state.kind === 'flash') {
      this.state.elapsed += deltaTime
      if (this.state.elapsed >= FLASH_DURATION) {
        this.clearAllOverlays()
        this.state = { kind: 'idle' }
      }
    }
  }

  /** Replace layout after external update (e.g. conflict resolution) */
  setLayout(layout: HouseLayout): void {
    this.layout = layout
    this.slotsByFloor = groupSlotsByFloor(layout)
    // If mid-drag, cancel it since the layout changed under us
    if (this.state.kind === 'dragging') {
      this.state = { kind: 'idle' }
      this.clearAllOverlays()
    }
  }

  dispose(): void {
    this.clearAllOverlays()
    this.scene.remove(this.overlayGroup)
    this.overlayGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
    })
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
  // Private: screen-to-world coordinate mapping
  // -----------------------------------------------------------------------

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    // Convert screen pixel to NDC (-1 to 1)
    const rect = this.canvas.getBoundingClientRect()
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1

    // Unproject from NDC to world using the orthographic camera
    const vec = new THREE.Vector3(ndcX, ndcY, 0)
    vec.unproject(this.camera)

    return { x: vec.x, y: vec.y }
  }

  // -----------------------------------------------------------------------
  // Private: overlay management
  // -----------------------------------------------------------------------

  private showSelectedOverlay(slot: RoomSlot): void {
    this.clearSelectedOverlay()
    this.selectedOverlay = makeOverlay(slot, COLOR_SELECTED, 0.3)
    this.overlayGroup.add(this.selectedOverlay)
  }

  private showHoverOverlay(slot: RoomSlot): void {
    this.clearHoverOverlay()
    this.hoverOverlay = makeOverlay(slot, COLOR_HOVER, 0.1)
    this.overlayGroup.add(this.hoverOverlay)
  }

  private clearSelectedOverlay(): void {
    if (this.selectedOverlay) {
      this.overlayGroup.remove(this.selectedOverlay)
      this.selectedOverlay.geometry.dispose()
      ;(this.selectedOverlay.material as THREE.Material).dispose()
      this.selectedOverlay = null
    }
  }

  private clearHoverOverlay(): void {
    if (this.hoverOverlay) {
      this.overlayGroup.remove(this.hoverOverlay)
      this.hoverOverlay.geometry.dispose()
      ;(this.hoverOverlay.material as THREE.Material).dispose()
      this.hoverOverlay = null
    }
  }

  private clearAllOverlays(): void {
    this.clearSelectedOverlay()
    this.clearHoverOverlay()

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
