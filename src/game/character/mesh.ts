// ---------------------------------------------------------------------------
// Voxel character mesh builder
// ---------------------------------------------------------------------------
//
// Builds a blocky humanoid character from BoxGeometry primitives.
// The character is approximately 3 voxels tall (matching house scale).
//
// Proportions (in voxel units):
//   Head:      1 × 1 × 1
//   Body:      1 × 1.5 × 0.6  (torso)
//   Each arm:  0.4 × 1 × 0.4
//   Each leg:  0.4 × 1.2 × 0.4
//
// The mesh group origin is at the character's feet (y=0).
// Body part pivots are set so animations rotate around natural joints.

import * as THREE from 'three'
import type { CharacterAppearance } from './seeder'
import type { ClothingItem } from '@/lib/characterSchema'
import type { FaceParts } from './face'
import { attachClothing } from './accessories'

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
  /** Face feature meshes for mood-driven expressions. */
  face: FaceParts
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
 * Recolors the character's outfit in place. Shirt covers torso + arms;
 * pants cover the legs. Pass null to leave a part unchanged.
 *
 * Arm/leg entries in CharacterMeshParts are actually pivot groups wrapping
 * the real mesh, so this resolves the inner mesh before tinting.
 */
export function applyOutfitColors(
  parts: CharacterMeshParts,
  shirtHex: number | null,
  pantsHex: number | null,
): void {
  const recolor = (part: THREE.Object3D, hex: number): void => {
    const mesh =
      part instanceof THREE.Mesh ? part : (part.children[0] as THREE.Mesh | undefined)
    if (!mesh) return
    const mat = mesh.material as THREE.MeshLambertMaterial
    mat.color.setHex(hex)
  }
  if (shirtHex !== null) {
    recolor(parts.body, shirtHex)
    recolor(parts.leftArm, shirtHex)
    recolor(parts.rightArm, shirtHex)
  }
  if (pantsHex !== null) {
    recolor(parts.leftLeg, pantsHex)
    recolor(parts.rightLeg, pantsHex)
  }
}

/**
 * Builds a complete character mesh group from a seeded appearance.
 *
 * The returned `group` has its origin at the character's feet.
 * Attach body part references (via `parts`) for animation.
 */
export function buildCharacterMesh(
  appearance: CharacterAppearance,
  accessories: ClothingItem[] = [],
): CharacterMesh {
  const { skinTone, outfitPrimary, outfitSecondary } = appearance

  const group = new THREE.Group()

  // ------------------------------------------------------------------
  // Legs — two 0.4×1.2×0.4 blocks, each origin at hip joint
  // ------------------------------------------------------------------
  // Leg height = 1.2 units; pivot at top (hip), mesh center at y = -0.6
  const leftLeg = makeMesh(0.4, 1.2, 0.4, outfitSecondary)
  const rightLeg = makeMesh(0.4, 1.2, 0.4, outfitSecondary)

  const leftLegPivot = withPivot(leftLeg, 0.6)
  const rightLegPivot = withPivot(rightLeg, 0.6)

  // Hips are 1.2 units above the ground (top of legs)
  leftLegPivot.position.set(-0.22, 1.2, 0)
  rightLegPivot.position.set(0.22, 1.2, 0)

  group.add(leftLegPivot)
  group.add(rightLegPivot)

  // ------------------------------------------------------------------
  // Body (torso) — 1×1.5×0.6, pivot at waist bottom (feet at y=1.2)
  // ------------------------------------------------------------------
  const body = makeMesh(1, 1.5, 0.6, outfitPrimary)
  // Center of torso at y = 1.2 + 0.75 = 1.95; no pivot needed, set directly
  body.position.set(0, 1.95, 0)
  group.add(body)

  // ------------------------------------------------------------------
  // Arms — 0.4×1×0.4 each, pivot at shoulder (top of arm)
  // ------------------------------------------------------------------
  const leftArm = makeMesh(0.4, 1, 0.4, outfitPrimary)
  const rightArm = makeMesh(0.4, 1, 0.4, outfitPrimary)

  // Arms hang from shoulders at y = 2.7 (top of torso = 1.2 + 1.5)
  const leftArmPivot = withPivot(leftArm, 0.5)
  const rightArmPivot = withPivot(rightArm, 0.5)

  leftArmPivot.position.set(-0.7, 2.7, 0)
  rightArmPivot.position.set(0.7, 2.7, 0)

  group.add(leftArmPivot)
  group.add(rightArmPivot)

  // ------------------------------------------------------------------
  // Head — 1×1×1, sits on top of torso (torso top = y=2.7, head center = y=3.2)
  // ------------------------------------------------------------------
  const head = makeMesh(1, 1, 1, skinTone)
  head.position.set(0, 3.2, 0)
  group.add(head)

  // ------------------------------------------------------------------
  // Face features — small boxes on the front (-Z) face of the head
  // ------------------------------------------------------------------
  const FACE_COLOR = 0x1a1a2e

  // Eyes: two small dark squares
  const eyeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.04)
  const eyeMat = new THREE.MeshLambertMaterial({ color: FACE_COLOR })
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
  leftEye.position.set(-0.18, 0.1, -0.51)
  head.add(leftEye)
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
  rightEye.position.set(0.18, 0.1, -0.51)
  head.add(rightEye)

  // Mouth: small dark line below the eyes
  const mouthGeo = new THREE.BoxGeometry(0.22, 0.06, 0.04)
  const mouthMat = new THREE.MeshLambertMaterial({ color: FACE_COLOR })
  const mouth = new THREE.Mesh(mouthGeo, mouthMat)
  mouth.position.set(0, -0.18, -0.51)
  head.add(mouth)

  // ------------------------------------------------------------------
  // Accessories — attach to head so they move with the character
  // ------------------------------------------------------------------
  for (const item of accessories) {
    attachClothing(item, head)
  }

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
    face: { leftEye, rightEye, mouth },
  }
}
