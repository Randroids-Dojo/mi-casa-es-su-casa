// ---------------------------------------------------------------------------
// Character clothing accessories
// ---------------------------------------------------------------------------
//
// Defines wearable clothing items and builds their Three.js geometry.
// Accessories are attached as child meshes of the head mesh so they
// move with the character automatically.
//
// Head is 1×1×1 with its front face on the -Z side (face features sit at
// local z ≈ -0.51). Head top is at local y = +0.5; the torso top is at
// local y = -0.5, so neck items sit around y ≈ -0.6.
//
// To add a new item: extend ClothingItem in characterSchema.ts, assign it
// a slot in wardrobe.ts (ACCESSORY_SLOT), and add a case here.

import * as THREE from 'three'
import type { ClothingItem } from '@/lib/characterSchema'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makePart(
  w: number,
  h: number,
  d: number,
  color: number,
  y: number,
  x = 0,
  z = 0,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mat = new THREE.MeshLambertMaterial({ color })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.set(x, y, z)
  return mesh
}

// ---------------------------------------------------------------------------
// Per-item geometry builders
// ---------------------------------------------------------------------------

function buildParts(item: ClothingItem, group: THREE.Group): void {
  switch (item) {
    case 'COWBOY_HAT':
      // Brim: wide flat box just above head top; crown on top
      group.add(makePart(1.6, 0.08, 1.4, 0x8b5e3c, 0.54))
      group.add(makePart(0.72, 0.45, 0.72, 0x8b5e3c, 0.81))
      break

    case 'TOP_HAT':
      group.add(makePart(1.4, 0.08, 1.3, 0x2a2a35, 0.54)) // brim
      group.add(makePart(0.8, 0.95, 0.8, 0x2a2a35, 1.05)) // tall crown
      group.add(makePart(0.84, 0.18, 0.84, 0xd0453e, 0.68)) // red band
      break

    case 'CAP':
      group.add(makePart(1.08, 0.4, 1.08, 0xd0453e, 0.62)) // dome
      group.add(makePart(0.9, 0.07, 0.5, 0xd0453e, 0.45, 0, -0.75)) // front brim
      break

    case 'BEANIE':
      group.add(makePart(1.12, 0.22, 1.12, 0x3aa8a0, 0.44)) // fold-up band
      group.add(makePart(1.0, 0.35, 1.0, 0x3aa8a0, 0.7)) // dome
      group.add(makePart(0.28, 0.28, 0.28, 0xf0f0f0, 0.98)) // pompom
      break

    case 'CROWN':
      group.add(makePart(1.12, 0.28, 1.12, 0xe8c84a, 0.62)) // gold band
      group.add(makePart(0.16, 0.28, 0.1, 0xe8c84a, 0.9, -0.35, -0.51)) // spikes
      group.add(makePart(0.16, 0.28, 0.1, 0xe8c84a, 0.9, 0, -0.51))
      group.add(makePart(0.16, 0.28, 0.1, 0xe8c84a, 0.9, 0.35, -0.51))
      break

    case 'PARTY_HAT':
      // Stacked boxes approximate a cone, topped with a pompom
      group.add(makePart(0.75, 0.3, 0.75, 0xe07aa8, 0.65))
      group.add(makePart(0.5, 0.3, 0.5, 0x3aa8a0, 0.95))
      group.add(makePart(0.28, 0.3, 0.28, 0xe8c84a, 1.25))
      group.add(makePart(0.15, 0.15, 0.15, 0xf0f0f0, 1.45))
      break

    case 'SUNGLASSES':
      group.add(makePart(0.3, 0.24, 0.06, 0x1a1a2e, 0.12, -0.19, -0.52)) // lenses
      group.add(makePart(0.3, 0.24, 0.06, 0x1a1a2e, 0.12, 0.19, -0.52))
      group.add(makePart(0.12, 0.06, 0.06, 0x1a1a2e, 0.14, 0, -0.52)) // bridge
      break

    case 'GLASSES':
      group.add(makePart(0.28, 0.22, 0.05, 0xc0d8e8, 0.1, -0.18, -0.53)) // lenses
      group.add(makePart(0.28, 0.22, 0.05, 0xc0d8e8, 0.1, 0.18, -0.53))
      group.add(makePart(0.1, 0.05, 0.05, 0x1a1a2e, 0.12, 0, -0.53)) // bridge
      break

    case 'BOW_TIE':
      // Sits at the torso top, in front of the body's front face (z = -0.3)
      group.add(makePart(0.1, 0.1, 0.08, 0xd0453e, -0.6, 0, -0.34)) // knot
      group.add(makePart(0.16, 0.16, 0.07, 0xd0453e, -0.6, -0.16, -0.33)) // wings
      group.add(makePart(0.16, 0.16, 0.07, 0xd0453e, -0.6, 0.16, -0.33))
      break

    case 'SCARF':
      group.add(makePart(1.08, 0.24, 0.68, 0x3aa8a0, -0.6)) // wrap around neck
      group.add(makePart(0.26, 0.55, 0.08, 0x3aa8a0, -0.95, 0.22, -0.34)) // tail
      break

    case 'NECKLACE':
      group.add(makePart(0.8, 0.07, 0.66, 0xe8c84a, -0.58)) // chain
      group.add(makePart(0.14, 0.14, 0.08, 0xe8c84a, -0.7, 0, -0.35)) // pendant
      break

    case 'HEADPHONES':
      group.add(makePart(1.14, 0.1, 0.35, 0x2a2a35, 0.56)) // headband
      group.add(makePart(0.18, 0.4, 0.4, 0x8455c9, 0.05, -0.6, 0)) // ear cups
      group.add(makePart(0.18, 0.4, 0.4, 0x8455c9, 0.05, 0.6, 0))
      break

    case 'MUSTACHE':
      // Between the eyes (y 0.1) and mouth (y -0.18) on the face
      group.add(makePart(0.44, 0.12, 0.06, 0x4a3524, -0.06, 0, -0.52))
      break
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attaches an accessory group as a child of the given head mesh.
 * Idempotent — calling with the same item twice has no effect.
 */
export function attachClothing(item: ClothingItem, head: THREE.Mesh): void {
  // Guard against duplicates
  if (head.children.some((c) => c.userData.clothingItem === item)) return

  const group = new THREE.Group()
  group.userData.clothingItem = item
  buildParts(item, group)
  if (group.children.length === 0) return
  head.add(group)
}

/**
 * Removes an accessory from the head mesh and disposes its GPU resources.
 */
export function detachClothing(item: ClothingItem, head: THREE.Mesh): void {
  const child = head.children.find((c) => c.userData.clothingItem === item)
  if (!child) return
  head.remove(child)
  child.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      if (Array.isArray(o.material)) {
        o.material.forEach((m) => m.dispose())
      } else {
        o.material.dispose()
      }
    }
  })
}
