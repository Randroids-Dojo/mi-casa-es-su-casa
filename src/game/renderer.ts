import * as THREE from 'three'
import { buildHouse, HOUSE_WIDTH, FLOOR_HEIGHT, FLOOR_COUNT, HOUSE_DEPTH } from './house'
import type { GameInstance } from './types'
import { Character } from './character'
import { SfxEngine } from './sfx/engine'
import type { CharacterState as SchemaCharacterState } from '@/lib/characterSchema'
import type { ClothingItem } from '@/lib/characterSchema'
import type { RoomId, ActivityType } from './rooms'
import { buildRooms } from './rooms'
import { generateLayout, layoutFromOrder, roomOrderFromLayout, stairXPerFloorFromLayout, DEFAULT_STAIRCASE_INDEX } from '@/lib/layout'
import type { LayoutRoomId, HouseLayout } from '@/lib/layout'
import { LayoutEditor } from './layoutEditor'

// ---------------------------------------------------------------------------
// Day/night lighting
// ---------------------------------------------------------------------------

const LIGHTING_KEYFRAMES = [
  { h:  0, ai: 0.06, ac: 0x0d0d2a, di: 0.08, dc: 0x1a2050, cl: 0x05050f },
  { h:  5, ai: 0.06, ac: 0x0d0d2a, di: 0.08, dc: 0x1a2050, cl: 0x05050f },
  { h:  7, ai: 0.35, ac: 0xff7030, di: 0.60, dc: 0xff5010, cl: 0x0c0818 },
  { h:  9, ai: 0.40, ac: 0xfff4e0, di: 0.80, dc: 0xfff4e0, cl: 0x1a1a2e },
  { h: 17, ai: 0.40, ac: 0xfff4e0, di: 0.80, dc: 0xfff4e0, cl: 0x1a1a2e },
  { h: 19, ai: 0.25, ac: 0xff6030, di: 0.45, dc: 0xff3a10, cl: 0x0f0a1e },
  { h: 21, ai: 0.10, ac: 0x2a1880, di: 0.12, dc: 0x201050, cl: 0x08061a },
  { h: 24, ai: 0.06, ac: 0x0d0d2a, di: 0.08, dc: 0x1a2050, cl: 0x05050f },
]

function updateDayNightLighting(
  hour: number,
  ambientLight: THREE.AmbientLight,
  dirLight: THREE.DirectionalLight,
  renderer: THREE.WebGLRenderer,
): void {
  const kf = LIGHTING_KEYFRAMES
  let prev = kf[0]
  let next = kf[kf.length - 1]
  for (let i = 0; i < kf.length - 1; i++) {
    if (hour >= kf[i].h && hour < kf[i + 1].h) {
      prev = kf[i]
      next = kf[i + 1]
      break
    }
  }
  const t = (hour - prev.h) / (next.h - prev.h)
  const lerp = (a: number, b: number) => a + (b - a) * t

  ambientLight.intensity = lerp(prev.ai, next.ai)
  ambientLight.color.set(prev.ac).lerp(new THREE.Color(next.ac), t)

  dirLight.intensity = lerp(prev.di, next.di)
  dirLight.color.set(prev.dc).lerp(new THREE.Color(next.dc), t)

  renderer.setClearColor(new THREE.Color(prev.cl).lerp(new THREE.Color(next.cl), t))
}

// ---------------------------------------------------------------------------
// Camera / pan / zoom helpers
// ---------------------------------------------------------------------------

/**
 * Orthographic frustum that "contains" the given world rect (worldW × worldH)
 * within the canvas (canvasW × canvasH), with minimal padding.
 *
 * When the canvas is wider than the world rect the house fills the full canvas
 * height and gets small horizontal margins. When the canvas is narrower/taller
 * the house fills the full width with vertical margins. Either way the entire
 * house is always visible at zoomScale=1.
 */
function computeFrustum(
  canvasW: number,
  canvasH: number,
  worldW: number,
  worldH: number,
): { left: number; right: number; top: number; bottom: number } {
  const screenAspect = canvasW / canvasH
  const worldAspect = worldW / worldH
  let halfW: number, halfH: number
  if (screenAspect >= worldAspect) {
    // Canvas is wider than the house: fit by height, small side margins
    halfH = worldH / 2
    halfW = halfH * screenAspect
  } else {
    // Canvas is taller/narrower: fit by width, small top/bottom margins
    halfW = worldW / 2
    halfH = halfW / screenAspect
  }
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Initialises the Three.js scene, camera, renderer, and animation loop.
 *
 * @param canvas - The target HTMLCanvasElement
 * @param characterName - Name used to seed the character (default: 'resident')
 */
export function initGame(
  canvas: HTMLCanvasElement,
  characterName = 'resident',
  initialState?: SchemaCharacterState,
  initialRoomOrder?: LayoutRoomId[],
  initialStaircaseIndex?: Record<1 | 2, number>,
  initialWallPositions?: [number[], number[], number[]],
): GameInstance {
  // ------------------------------------------------------------------
  // Renderer
  // ------------------------------------------------------------------
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  } catch (err) {
    console.warn('WebGL unavailable, returning no-op game instance', err)
    return {
      dispose() {},
      getCurrentThought() { return null },
      getCharacterHeadScreenPos() { return null },
      applyPanDeltaPixels() {},
      applyZoomScale() {},
      injectThought() {},
      ringDoorbell() {},
      putOnClothes() {},
      goToRoom() {},
      wakeUp() {},
      getCharacterState() { return null },
      unlockAudio() {},
      onLayoutPointerDown() {},
      onLayoutPointerMove() {},
      onLayoutPointerUp() {},
      isLayoutEditActive() { return false },
      onLayoutSwap: null,
      onWallSave: null,
      applyExternalLayout() {},
    }
  }
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(canvas.clientWidth, canvas.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x1a1a2e)

  // ------------------------------------------------------------------
  // Scene
  // ------------------------------------------------------------------
  const scene = new THREE.Scene()

  // ------------------------------------------------------------------
  // Camera (orthographic, dollhouse front view)
  // ------------------------------------------------------------------
  //
  // House spans: X: 0..32, Y: 0..24 (3 floors × 8), Z: 0..8
  // BASE_WORLD_W/H are the world-space extents that fill the screen at
  // zoomScale=1, with a small margin so the house isn't flush against edges.
  const MARGIN = 2
  const BASE_WORLD_W = HOUSE_WIDTH + MARGIN // 34 units
  const BASE_WORLD_H = FLOOR_HEIGHT * FLOOR_COUNT + MARGIN // 26 units

  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 1, 60)

  // House center in world space — the default camera target.
  const houseCenterX = HOUSE_WIDTH / 2    // 16
  const houseCenterY = (FLOOR_HEIGHT * FLOOR_COUNT) / 2  // 12
  const houseCenterZ = HOUSE_DEPTH / 2    // 4

  // ------------------------------------------------------------------
  // Pan / zoom state
  //
  // zoomScale=1 → full house visible (contain fit)
  // zoomScale>1 → zoomed in (see less of the house)
  // zoomScale<1 → zoomed out past the full house (not normally reachable)
  // ------------------------------------------------------------------
  let panWorldX = 0
  let panWorldY = 0
  let zoomScale = 1
  const MIN_ZOOM = 0.5 // can zoom out to show twice the house area
  const MAX_ZOOM = 5

  // Cached frustum size — updated each applyPanZoom call, used for pan delta
  let frustumVisibleW = BASE_WORLD_W
  let frustumVisibleH = BASE_WORLD_H

  // Maximum pan so the house stays roughly in view
  const MAX_PAN_X = HOUSE_WIDTH * 0.5
  const MAX_PAN_Y = FLOOR_HEIGHT * FLOOR_COUNT * 0.5

  // On mobile, start zoomed in enough to fill the screen nicely
  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 768
  if (isMobile) {
    zoomScale = 1.5
    panWorldX = 0    // center horizontally to show the full cross-section
    panWorldY = -2   // slight shift down to emphasise ground floor
  }

  function applyPanZoom(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const worldW = BASE_WORLD_W / zoomScale
    const worldH = BASE_WORLD_H / zoomScale
    const f = computeFrustum(w, h, worldW, worldH)
    frustumVisibleW = f.right - f.left
    frustumVisibleH = f.top - f.bottom
    camera.left = f.left
    camera.right = f.right
    camera.top = f.top
    camera.bottom = f.bottom
    camera.position.set(
      houseCenterX + panWorldX,
      houseCenterY + 1 + panWorldY,
      houseCenterZ - 30,
    )
    camera.lookAt(
      houseCenterX + panWorldX,
      houseCenterY + panWorldY,
      houseCenterZ,
    )
    camera.updateProjectionMatrix()
  }

  applyPanZoom()

  // ------------------------------------------------------------------
  // Lighting
  // ------------------------------------------------------------------
  const ambientLight = new THREE.AmbientLight(0xfff4e0, 0.4)
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xfff4e0, 0.8)
  dirLight.position.set(houseCenterX - 10, houseCenterY + 20, houseCenterZ - 15)
  dirLight.target.position.set(houseCenterX, houseCenterY, houseCenterZ)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.camera.near = 1
  dirLight.shadow.camera.far = 100
  dirLight.shadow.camera.left = -40
  dirLight.shadow.camera.right = 40
  dirLight.shadow.camera.top = 30
  dirLight.shadow.camera.bottom = -30
  scene.add(dirLight)
  scene.add(dirLight.target)

  const hemiLight = new THREE.HemisphereLight(0xfff4e0, 0x2d1b4e, 0.3)
  scene.add(hemiLight)

  // ------------------------------------------------------------------
  // Layout — custom from room order, or deterministic from character name
  // ------------------------------------------------------------------
  const initialCustomWalls: Partial<Record<1 | 2 | 3, number[]>> | undefined = initialWallPositions
    ? { 1: initialWallPositions[0], 2: initialWallPositions[1], 3: initialWallPositions[2] }
    : undefined
  let currentLayout: HouseLayout = initialRoomOrder
    ? layoutFromOrder(initialRoomOrder, initialStaircaseIndex ?? DEFAULT_STAIRCASE_INDEX, initialCustomWalls)
    : generateLayout(characterName)
  // Cached room order — kept in sync with currentLayout by onSwap/applyExternalLayout.
  // Avoids re-extracting on every staircase drag pixel.
  let cachedRoomOrder = roomOrderFromLayout(currentLayout)
  let currentRoomMap = buildRooms(currentLayout).roomMap

  // ------------------------------------------------------------------
  // House geometry
  // ------------------------------------------------------------------
  let houseResult = buildHouse(currentLayout)
  scene.add(houseResult.group)
  let bathroomDoor = houseResult.bathroomDoor

  // ------------------------------------------------------------------
  // Character
  // ------------------------------------------------------------------
  const gameCharacterState = initialState
    ? {
        name: initialState.name,
        currentRoom: initialState.currentRoom,
        currentActivity: initialState.currentActivity,
        needs: initialState.needs,
        clock: initialState.clock,
        position: initialState.position,
        accessories: (initialState.accessories ?? []) as ClothingItem[],
      }
    : undefined

  // ------------------------------------------------------------------
  // SFX
  // ------------------------------------------------------------------
  const sfxEngine = new SfxEngine()

  const character = new Character(characterName, scene, gameCharacterState, sfxEngine, currentRoomMap, stairXPerFloorFromLayout(currentLayout))

  // ------------------------------------------------------------------
  // Layout editor
  // ------------------------------------------------------------------

  /** External callback set by GameCanvas for persisting layout swaps */
  let externalSwapCallback: ((roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>) => void) | null = null
  /** External callback set by GameCanvas for persisting wall positions */
  let externalWallSaveCallback: ((wallPositions: [number[], number[], number[]]) => void) | null = null

  /** Extract per-floor wall x-positions from a layout as a [floor1, floor2, floor3] tuple */
  function wallPositionsFromLayout(layout: HouseLayout): [number[], number[], number[]] {
    const result: [number[], number[], number[]] = [[], [], []]
    for (const wall of layout.walls) {
      result[wall.floor - 1].push(wall.x)
    }
    return result
  }

  /** Per-floor wall x positions, kept in sync with currentLayout */
  let cachedWallPositions: [number[], number[], number[]] = wallPositionsFromLayout(currentLayout)

  function rebuildHouse(newLayout: HouseLayout): void {
    // Remove old house
    scene.remove(houseResult.group)
    houseResult.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })

    // Build new house
    currentLayout = newLayout
    cachedWallPositions = wallPositionsFromLayout(newLayout)
    currentRoomMap = buildRooms(newLayout).roomMap
    houseResult = buildHouse(newLayout)
    scene.add(houseResult.group)
    bathroomDoor = houseResult.bathroomDoor

    // Update character to use new room positions and staircase X
    character.updateRoomMap(currentRoomMap, stairXPerFloorFromLayout(newLayout))
  }

  const layoutEditor = new LayoutEditor({
    scene,
    camera,
    canvas,
    layout: currentLayout,
    onSwap(newRoomOrder: LayoutRoomId[], newStaircaseIndex: Record<1 | 2, number>) {
      // Swap resets wall positions to proportional
      const newLayout = layoutFromOrder(newRoomOrder, newStaircaseIndex)
      cachedRoomOrder = newRoomOrder
      rebuildHouse(newLayout)
      layoutEditor.setLayout(newLayout)

      // Notify external persistence
      if (externalSwapCallback) {
        externalSwapCallback(newRoomOrder, newStaircaseIndex)
      }
    },
    onWallMove(floor: 1 | 2 | 3, wallIndex: number, newX: number) {
      const newWallPositions: [number[], number[], number[]] = [
        [...cachedWallPositions[0]],
        [...cachedWallPositions[1]],
        [...cachedWallPositions[2]],
      ]
      newWallPositions[floor - 1][wallIndex] = newX
      const customWalls: Partial<Record<1 | 2 | 3, number[]>> = {
        1: newWallPositions[0],
        2: newWallPositions[1],
        3: newWallPositions[2],
      }
      const newLayout = layoutFromOrder(cachedRoomOrder, currentLayout.staircaseIndex, customWalls)
      rebuildHouse(newLayout)
      layoutEditor.setLayout(newLayout)
    },
    onWallDragEnd() {
      if (externalWallSaveCallback) {
        externalWallSaveCallback(cachedWallPositions)
      }
    },
  })

  // ------------------------------------------------------------------
  // Animation loop
  // ------------------------------------------------------------------
  let animFrameId = 0
  let lastTime = performance.now()

  // Bathroom door animation state
  const DOOR_OPEN_Y = -Math.PI / 2  // open: tucked along bedroom wall
  const DOOR_CLOSED_Y = 0           // closed: covering bathroom front
  const DOOR_SPEED = 4              // radians per second (smooth swing)

  function animate(): void {
    animFrameId = requestAnimationFrame(animate)

    const now = performance.now()
    const deltaTime = Math.min((now - lastTime) / 1000, 0.5)
    lastTime = now

    character.update(deltaTime)
    updateDayNightLighting(character.hour, ambientLight, dirLight, renderer)
    layoutEditor.update(deltaTime)

    // Animate bathroom door: close when character is using the bathroom
    const charState = character.getState()
    const doorShouldClose = charState.currentRoom === 'bathroom'
      && charState.currentActivity === 'use_bathroom'
    const targetY = doorShouldClose ? DOOR_CLOSED_Y : DOOR_OPEN_Y
    const currentY = bathroomDoor.rotation.y
    const diff = targetY - currentY
    if (Math.abs(diff) > 0.01) {
      bathroomDoor.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), DOOR_SPEED * deltaTime)
    } else {
      bathroomDoor.rotation.y = targetY
    }

    renderer.render(scene, camera)
  }

  animate()

  // ------------------------------------------------------------------
  // Resize handler
  // ------------------------------------------------------------------
  function onResize(): void {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    applyPanZoom()
  }

  const resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(canvas)

  // ------------------------------------------------------------------
  // GameInstance
  // ------------------------------------------------------------------
  const gameInstance: GameInstance = {
    dispose() {
      cancelAnimationFrame(animFrameId)
      resizeObserver.disconnect()
      layoutEditor.dispose()
      character.dispose()
      sfxEngine.dispose()
      renderer.dispose()
    },
    getCurrentThought() {
      return character.getCurrentThought()
    },
    getCharacterHeadScreenPos() {
      const worldPos = character.getMeshGroup().position.clone()
      worldPos.y += 3.7
      // Ensure camera matrices are up-to-date (pan/zoom may have changed
      // the camera position since the last renderer.render() call).
      camera.updateMatrixWorld()
      const ndc = worldPos.project(camera)
      // Return pixel coordinates within the canvas so the bubble can be
      // positioned entirely via CSS transform (which doesn't affect layout).
      const x = (ndc.x + 1) / 2 * canvas.clientWidth
      const y = (1 - (ndc.y + 1) / 2) * canvas.clientHeight
      return { x, y }
    },
    applyPanDeltaPixels(dx: number, dy: number) {
      // "Content follows finger": the world point under the touch stays fixed.
      // X: screen-X and world-X both increase rightward → pan is inverse of drag: -= dx
      // Y: screen-Y increases downward, world-Y increases upward → pan matches drag: += dy
      const unitsPerPixelX = frustumVisibleW / canvas.clientWidth
      const unitsPerPixelY = frustumVisibleH / canvas.clientHeight
      panWorldX -= dx * unitsPerPixelX
      panWorldY -= dy * unitsPerPixelY
      panWorldX = clamp(panWorldX, -MAX_PAN_X, MAX_PAN_X)
      panWorldY = clamp(panWorldY, -MAX_PAN_Y, MAX_PAN_Y)
      applyPanZoom()
    },
    applyZoomScale(factor: number) {
      // factor > 1 = zoom in (fingers spread); factor < 1 = zoom out (fingers pinch)
      zoomScale = clamp(zoomScale * factor, MIN_ZOOM, MAX_ZOOM)
      applyPanZoom()
    },
    injectThought(text: string) {
      character.injectThought(text)
    },
    ringDoorbell() {
      sfxEngine.unlock() // idempotent — ensures AudioContext is ready on first click
      sfxEngine.playDoorbell()
      character.ringDoorbell()
    },
    putOnClothes(item: string) {
      character.putOnClothes(item as ClothingItem)
    },
    goToRoom(room: string, activity: string, durationHours: number, responsePhrases: string[]) {
      character.goToRoom(
        room as RoomId,
        activity as ActivityType,
        durationHours,
        responsePhrases,
      )
    },
    wakeUp(responsePhrases: string[]) {
      character.wakeUp(responsePhrases)
    },
    getCharacterState(): SchemaCharacterState | null {
      const s = character.getState()
      // 'staircase' is a transit-only room not persisted in the schema;
      // fall back to the last real room stored in initialState if mid-transit.
      const persistableRoom = (
        s.currentRoom === 'staircase'
          ? (initialState?.currentRoom ?? 'living_room')
          : s.currentRoom
      ) as SchemaCharacterState['currentRoom']
      return {
        name: s.name,
        createdAt: initialState?.createdAt ?? new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        currentRoom: persistableRoom,
        currentActivity: s.currentActivity as SchemaCharacterState['currentActivity'],
        needs: s.needs,
        clock: s.clock,
        position: s.position,
        accessories: s.accessories,
      }
    },
    unlockAudio() {
      sfxEngine.unlock()
    },

    // --- Layout editor ---
    onLayoutPointerDown(screenX: number, screenY: number) {
      layoutEditor.onPointerDown(screenX, screenY)
    },
    onLayoutPointerMove(screenX: number, screenY: number) {
      layoutEditor.onPointerMove(screenX, screenY)
    },
    onLayoutPointerUp() {
      layoutEditor.onPointerUp()
    },
    isLayoutEditActive() {
      return layoutEditor.isActive
    },
    onLayoutSwap: null,
    onWallSave: null,
    applyExternalLayout(roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>) {
      const newLayout = layoutFromOrder(roomOrder, staircaseIndex)
      cachedRoomOrder = roomOrder
      rebuildHouse(newLayout)
      layoutEditor.setLayout(newLayout)
    },
  }

  // Wire up the external swap callback through the GameInstance property
  Object.defineProperty(gameInstance, 'onLayoutSwap', {
    get: () => externalSwapCallback,
    set: (cb: ((roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>) => void) | null) => {
      externalSwapCallback = cb
    },
    enumerable: true,
  })

  // Wire up the external wall save callback
  Object.defineProperty(gameInstance, 'onWallSave', {
    get: () => externalWallSaveCallback,
    set: (cb: ((wallPositions: [number[], number[], number[]]) => void) | null) => {
      externalWallSaveCallback = cb
    },
    enumerable: true,
  })

  return gameInstance
}
