// ---------------------------------------------------------------------------
// Voxel character mesh builder
// ---------------------------------------------------------------------------
//
// Builds a blocky humanoid character from BoxGeometry primitives.
// The character is approximately 3 voxels tall (matching house scale).
//
// Proportions (in voxel units):
//   Head:      2 × 2 × 2
//   Body:      2 × 3 × 1  (torso)
//   Each arm:  1 × 2 × 1
//   Each leg:  1 × 3 × 1
//
// The mesh group origin is at the character's feet (y=0).
// Body part pivots are set so animations rotate around natural joints.

import * as THREE from 'three'
import type { CharacterAppearance } from './seeder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CharacterMeshParts {
  head: THREE.Mesh
  body: THREE.Mesh
  leftArm: THREE.Mesh
  rightArm: THREE.Mesh
  leftLeg: THREE.Mesh
  rightLeg: THREE.Mesh
}

export interface CharacterMesh {
  /** The root group — add this to the scene. Position this to move the character. */
  group: THREE.Group
  /** Individual body part meshes for animation. */
  parts: CharacterMeshParts
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeMesh(
  w: number,
  h: number,
  d: number,
  color: number,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w, h, d)
  const material = new THREE.MeshLambertMaterial({ color })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Creates a pivot group so that the child mesh rotates around a
 * specific point rather than its geometric center.
 *
 * @param mesh      The mesh to wrap
 * @param offsetY   How far to shift the mesh *down* inside the pivot
 *                  (positive = mesh center is above the pivot point)
 * @returns The pivot group (add this to the parent group)
 */
function withPivot(mesh: THREE.Mesh, offsetY: number): THREE.Group {
  const pivot = new THREE.Group()
  mesh.position.y = -offsetY
  pivot.add(mesh)
  return pivot
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Builds a complete character mesh group from a seeded appearance.
 *
 * The returned `group` has its origin at the character's feet.
 * Attach body part references (via `parts`) for animation.
 */
export function buildCharacterMesh(appearance: CharacterAppearance): CharacterMesh {
  const { skinTone, outfitPrimary, outfitSecondary } = appearance

  const group = new THREE.Group()

  // ------------------------------------------------------------------
  // Legs — two 1×3×1 blocks, each origin at hip joint
  // ------------------------------------------------------------------
  // Leg height = 3 units; pivot at top (hip), mesh center at y = -1.5
  const leftLeg = makeMesh(0.9, 3, 0.9, outfitSecondary)
  const rightLeg = makeMesh(0.9, 3, 0.9, outfitSecondary)

  const leftLegPivot = withPivot(leftLeg, 1.5)
  const rightLegPivot = withPivot(rightLeg, 1.5)

  // Hips are 3 units above the ground (top of legs)
  leftLegPivot.position.set(-0.55, 3, 0)
  rightLegPivot.position.set(0.55, 3, 0)

  group.add(leftLegPivot)
  group.add(rightLegPivot)

  // ------------------------------------------------------------------
  // Body (torso) — 2×3×1, pivot at waist bottom (feet at y=3)
  // ------------------------------------------------------------------
  const body = makeMesh(2, 3, 1, outfitPrimary)
  // Center of torso at y = 3 + 1.5 = 4.5; no pivot needed, set directly
  body.position.set(0, 4.5, 0)
  group.add(body)

  // ------------------------------------------------------------------
  // Arms — 1×2×1 each, pivot at shoulder (top of arm)
  // ------------------------------------------------------------------
  const leftArm = makeMesh(0.9, 2, 0.9, outfitPrimary)
  const rightArm = makeMesh(0.9, 2, 0.9, outfitPrimary)

  // Arms hang from shoulders at y = 6 (top of torso)
  const leftArmPivot = withPivot(leftArm, 1)
  const rightArmPivot = withPivot(rightArm, 1)

  leftArmPivot.position.set(-1.45, 6, 0)
  rightArmPivot.position.set(1.45, 6, 0)

  group.add(leftArmPivot)
  group.add(rightArmPivot)

  // ------------------------------------------------------------------
  // Head — 2×2×2, sits on top of torso (torso top = y=6, head center = y=7)
  // ------------------------------------------------------------------
  const head = makeMesh(2, 2, 2, skinTone)
  head.position.set(0, 7, 0)
  group.add(head)

  // ------------------------------------------------------------------
  // Assemble result
  // ------------------------------------------------------------------
  // The pivot groups wrap the arm/leg meshes; expose the inner mesh for
  // animation (rotation applied to pivot, translation to inner mesh).
  // For simplicity, expose the pivot groups as "the part" — callers
  // rotate the pivot to swing the limb.
  return {
    group,
    parts: {
      head,
      body,
      leftArm: leftArmPivot as unknown as THREE.Mesh,
      rightArm: rightArmPivot as unknown as THREE.Mesh,
      leftLeg: leftLegPivot as unknown as THREE.Mesh,
      rightLeg: rightLegPivot as unknown as THREE.Mesh,
    },
  }
}
