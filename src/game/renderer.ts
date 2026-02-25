import * as THREE from 'three'
import { buildHouse, HOUSE_WIDTH, FLOOR_HEIGHT, FLOOR_COUNT, HOUSE_DEPTH } from './house'
import type { GameInstance } from './types'
import { Character } from './character'

// ---------------------------------------------------------------------------
// Camera helpers
// ---------------------------------------------------------------------------

/**
 * Computes orthographic camera frustum bounds for the given canvas dimensions.
 * We maintain a fixed "virtual height" in world units and let the width scale.
 */
function computeFrustum(
  width: number,
  height: number,
  worldHeight: number,
): { left: number; right: number; top: number; bottom: number } {
  const aspect = width / height
  const halfH = worldHeight / 2
  const halfW = halfH * aspect
  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
  }
}

// ---------------------------------------------------------------------------
// initGame
// ---------------------------------------------------------------------------

/**
 * Initialises the Three.js scene, camera, renderer, and animation loop.
 * Returns a GameInstance with a `dispose()` method and `getCurrentThought()`.
 *
 * @param canvas - The target HTMLCanvasElement
 * @param characterName - Name used to seed the character (default: 'resident')
 */
export function initGame(canvas: HTMLCanvasElement, characterName = 'resident'): GameInstance {
  // ------------------------------------------------------------------
  // Renderer
  // ------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
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
  // Camera (orthographic, fixed dollhouse view)
  // ------------------------------------------------------------------
  //
  // The house spans: X: 0..16, Y: 0..18 (3 floors × 6), Z: 0..8
  // We want to see all 3 floors with a comfortable margin.
  // worldHeight covers the full house height plus margin.
  const WORLD_HEIGHT = FLOOR_HEIGHT * FLOOR_COUNT + 6 // ~24 units

  const { left, right, top, bottom } = computeFrustum(
    canvas.clientWidth,
    canvas.clientHeight,
    WORLD_HEIGHT,
  )

  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 200)

  // Position: above and slightly in front-left, looking toward the house center.
  // The house center in world space:
  const houseCenterX = HOUSE_WIDTH / 2    // 8
  const houseCenterY = (FLOOR_HEIGHT * FLOOR_COUNT) / 2  // 9
  const houseCenterZ = HOUSE_DEPTH / 2   // 4

  // Isometric-ish dollhouse position: offset in -Z (in front) and +Y (above), +X (side)
  camera.position.set(
    houseCenterX + 12,
    houseCenterY + 10,
    houseCenterZ - 18,
  )
  camera.lookAt(houseCenterX, houseCenterY, houseCenterZ)
  camera.updateProjectionMatrix()

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

    const f = computeFrustum(w, h, WORLD_HEIGHT)
    camera.left = f.left
    camera.right = f.right
    camera.top = f.top
    camera.bottom = f.bottom
    camera.updateProjectionMatrix()
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
  }
}
