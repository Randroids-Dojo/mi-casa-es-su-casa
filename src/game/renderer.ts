import * as THREE from 'three'
import { buildHouse, HOUSE_WIDTH, FLOOR_HEIGHT, FLOOR_COUNT, HOUSE_DEPTH } from './house'
import type { GameInstance } from './types'
import { Character } from './character'

// ---------------------------------------------------------------------------
// Camera / pan / zoom helpers
// ---------------------------------------------------------------------------

/** Orthographic frustum bounds for the given canvas size and world width. */
function computeFrustum(
  width: number,
  height: number,
  worldWidth: number,
): { left: number; right: number; top: number; bottom: number } {
  const aspect = width / height
  const halfW = worldWidth / 2
  const halfH = halfW / aspect
  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
  }
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
export function initGame(canvas: HTMLCanvasElement, characterName = 'resident'): GameInstance {
  // ------------------------------------------------------------------
  // Renderer
  // ------------------------------------------------------------------
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  } catch (err) {
    console.warn('WebGL unavailable, returning no-op game instance', err)
    return {
      dispose() {},
      getCurrentThought() { return null },
      getCharacterHeadScreenPos() { return null },
      applyPanDeltaPixels() {},
      applyZoomScale() {},
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
  // Camera (orthographic, dollhouse view)
  // ------------------------------------------------------------------
  //
  // The house spans: X: 0..16, Y: 0..24 (3 floors × 8), Z: 0..8
  // Fit by width so the house spans the full screen with a small margin.
  // On landscape screens the full 3 floors won't all be visible at once;
  // players can pan vertically to see all floors.
  const WORLD_WIDTH = HOUSE_WIDTH + 4 // 20 units — house fills full screen width

  // Frustum will be set by the first applyPanZoom() call below.
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 200)

  // House center in world space — the pan baseline.
  const houseCenterX = HOUSE_WIDTH / 2    // 8
  const houseCenterY = (FLOOR_HEIGHT * FLOOR_COUNT) / 2  // 12
  const houseCenterZ = HOUSE_DEPTH / 2   // 4

  // ------------------------------------------------------------------
  // Pan / zoom state
  // ------------------------------------------------------------------
  let panWorldX = 0
  let panWorldY = 0
  let zoomScale = 1
  const MIN_ZOOM = 0.3
  const MAX_ZOOM = 3
  // Maximum pan so the house stays roughly in view
  const MAX_PAN_X = HOUSE_WIDTH
  const MAX_PAN_Y = FLOOR_HEIGHT * FLOOR_COUNT * 0.6

  function applyPanZoom(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const worldWidth = WORLD_WIDTH * zoomScale
    const f = computeFrustum(w, h, worldWidth)
    camera.left = f.left
    camera.right = f.right
    camera.top = f.top
    camera.bottom = f.bottom
    camera.position.set(
      houseCenterX + panWorldX,
      houseCenterY + 2 + panWorldY,
      houseCenterZ - 30,
    )
    camera.lookAt(
      houseCenterX + panWorldX,
      houseCenterY + panWorldY,
      houseCenterZ,
    )
    camera.updateProjectionMatrix()
  }

  // Establish initial camera position and frustum.
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
  dirLight.shadow.camera.left = -30
  dirLight.shadow.camera.right = 30
  dirLight.shadow.camera.top = 30
  dirLight.shadow.camera.bottom = -30
  scene.add(dirLight)
  scene.add(dirLight.target)

  // Hemisphere light for soft ambient bounce: warm sky, cool purple-navy ground
  const hemiLight = new THREE.HemisphereLight(0xfff4e0, 0x2d1b4e, 0.3)
  scene.add(hemiLight)

  // ------------------------------------------------------------------
  // House geometry
  // ------------------------------------------------------------------
  const house = buildHouse()
  scene.add(house)

  // ------------------------------------------------------------------
  // Character
  // ------------------------------------------------------------------
  const character = new Character(characterName, scene)

  // ------------------------------------------------------------------
  // Animation loop
  // ------------------------------------------------------------------
  let animFrameId = 0
  let lastTime = performance.now()

  function animate(): void {
    animFrameId = requestAnimationFrame(animate)

    const now = performance.now()
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1) // cap at 100ms
    lastTime = now

    character.update(deltaTime)
    renderer.render(scene, camera)
  }

  animate()

  // ------------------------------------------------------------------
  // Resize handler
  // ------------------------------------------------------------------
  function onResize(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setSize(w, h)
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
      renderer.dispose()
    },
    getCurrentThought() {
      return character.getCurrentThought()
    },
    getCharacterHeadScreenPos() {
      // Project the top of the character's head from world space to canvas percentages.
      // Character local space: feet=0, head center≈3.2, head top≈3.7
      const worldPos = character.getMeshGroup().position.clone()
      worldPos.y += 3.7
      const ndc = worldPos.project(camera)
      // NDC x,y are in [-1,1]; convert to [0,100]% with y-axis flipped
      const x = Math.max(5, Math.min(95, (ndc.x + 1) / 2 * 100))
      const y = Math.max(2, Math.min(95, (1 - (ndc.y + 1) / 2) * 100))
      return { x, y }
    },
    applyPanDeltaPixels(dx: number, dy: number) {
      // "Content follows finger": the world point under the touch stays fixed.
      // X: screen-X and world-X both increase rightward → camera moves opposite to finger: -= dx
      // Y: screen-Y increases downward, world-Y increases upward → camera moves same as finger: += dy
      const unitsPerPixel = (WORLD_WIDTH * zoomScale) / canvas.clientWidth
      panWorldX -= dx * unitsPerPixel
      panWorldY += dy * unitsPerPixel
      panWorldX = clamp(panWorldX, -MAX_PAN_X, MAX_PAN_X)
      panWorldY = clamp(panWorldY, -MAX_PAN_Y, MAX_PAN_Y)
      applyPanZoom()
    },
    applyZoomScale(factor: number) {
      zoomScale = clamp(zoomScale * factor, MIN_ZOOM, MAX_ZOOM)
      applyPanZoom()
    },
  }
}
