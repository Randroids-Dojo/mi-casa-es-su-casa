// ---------------------------------------------------------------------------
// Character clothing accessories
// ---------------------------------------------------------------------------
//
// Defines wearable clothing items and builds their Three.js geometry.
// Accessories are attached as child meshes of the head mesh so they
// move with the character automatically.
//
// To add a new item: extend ClothingItem in characterSchema.ts and add a
// case here in attachClothing().

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
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mat = new THREE.MeshLambertMaterial({ color })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.y = y
  return mesh
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

  switch (item) {
    case 'COWBOY_HAT': {
      const group = new THREE.Group()
      group.userData.clothingItem = item
      // Head is 1×1×1; head top is at local y = +0.5
      // Brim: wide flat box just above head top
      group.add(makePart(1.6, 0.08, 1.4, 0x8b5e3c, 0.54))
      // Crown: narrower tall box sitting on top of brim
      group.add(makePart(0.72, 0.45, 0.72, 0x8b5e3c, 0.81))
      head.add(group)
      break
    }
  }
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
