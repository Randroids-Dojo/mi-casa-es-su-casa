import * as THREE from 'three'
import { buildHouse, HOUSE_WIDTH, FLOOR_HEIGHT, FLOOR_COUNT, HOUSE_DEPTH } from './house'
import type { GameInstance } from './types'
import { Character } from './character'
import { SfxEngine } from './sfx/engine'
import type { CharacterState as SchemaCharacterState } from '@/lib/characterSchema'
import type { ClothingItem } from '@/lib/characterSchema'
import type { RoomId, ActivityType } from './rooms'

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
      putOnClothes() {},
      goToRoom() {},
      getCharacterState() { return null },
      unlockAudio() {},
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
  // House geometry
  // ------------------------------------------------------------------
  const { group: house, bathroomDoor } = buildHouse()
  scene.add(house)

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

  const character = new Character(characterName, scene, gameCharacterState, sfxEngine)

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
  return {
    dispose() {
      cancelAnimationFrame(animFrameId)
      resizeObserver.disconnect()
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
  }
}
