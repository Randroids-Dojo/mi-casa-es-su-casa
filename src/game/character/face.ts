// ---------------------------------------------------------------------------
// Face expressions — mood-driven face geometry updates
// ---------------------------------------------------------------------------
//
// Each mood maps to a set of scale/position tweaks applied to the eye and
// mouth meshes every frame.  Because the character is voxel-style (BoxGeometry
// primitives), we use scale transforms to reshape the features:
//   - Squinted eyes  → scaleY < 1
//   - Wide eyes      → scaleY > 1
//   - Smile          → mouth wider (scaleX > 1), slightly shorter
//   - Open mouth     → mouth taller (scaleY > 1)
//   - Closed eyes    → scaleY ≈ 0

import * as THREE from 'three'
import type { Needs } from './needs'
import type { ActivityType } from '../rooms'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Mood =
  | 'happy'
  | 'content'
  | 'tired'
  | 'very_tired'
  | 'hungry'
  | 'very_hungry'
  | 'bored'
  | 'sleeping'

/** Meshes that make up the face — stored on the character mesh. */
export interface FaceParts {
  leftEye: THREE.Mesh
  rightEye: THREE.Mesh
  mouth: THREE.Mesh
}

// ---------------------------------------------------------------------------
// Expression definitions
// ---------------------------------------------------------------------------

interface FaceExpression {
  /** Y-axis scale for both eyes (1 = default, <1 = squint, >1 = wide) */
  eyeScaleY: number
  /** Y offset added to default eye position (positive = up) */
  eyeOffsetY: number
  /** X-axis scale for mouth (>1 = wider) */
  mouthScaleX: number
  /** Y-axis scale for mouth (>1 = taller / open, <1 = thinner) */
  mouthScaleY: number
  /** Absolute Y position of mouth center relative to head center */
  mouthY: number
}

/** Default eye Y position (relative to head center) */
const DEFAULT_EYE_Y = 0.1
/** Default mouth Y position (relative to head center) */
const DEFAULT_MOUTH_Y = -0.18

const EXPRESSIONS: Readonly<Record<Mood, FaceExpression>> = {
  happy: {
    eyeScaleY: 1.0,
    eyeOffsetY: 0.02,
    mouthScaleX: 1.5,
    mouthScaleY: 0.8,
    mouthY: DEFAULT_MOUTH_Y + 0.02,
  },
  content: {
    eyeScaleY: 1.0,
    eyeOffsetY: 0,
    mouthScaleX: 1.0,
    mouthScaleY: 1.0,
    mouthY: DEFAULT_MOUTH_Y,
  },
  tired: {
    eyeScaleY: 0.45,
    eyeOffsetY: -0.03,
    mouthScaleX: 0.9,
    mouthScaleY: 1.0,
    mouthY: DEFAULT_MOUTH_Y - 0.02,
  },
  very_tired: {
    eyeScaleY: 0.25,
    eyeOffsetY: -0.04,
    mouthScaleX: 0.7,
    mouthScaleY: 2.2,
    mouthY: DEFAULT_MOUTH_Y - 0.02,
  },
  hungry: {
    eyeScaleY: 1.0,
    eyeOffsetY: 0,
    mouthScaleX: 0.8,
    mouthScaleY: 1.8,
    mouthY: DEFAULT_MOUTH_Y - 0.02,
  },
  very_hungry: {
    eyeScaleY: 1.3,
    eyeOffsetY: 0,
    mouthScaleX: 0.8,
    mouthScaleY: 2.5,
    mouthY: DEFAULT_MOUTH_Y - 0.03,
  },
  bored: {
    eyeScaleY: 0.5,
    eyeOffsetY: -0.02,
    mouthScaleX: 0.7,
    mouthScaleY: 0.7,
    mouthY: DEFAULT_MOUTH_Y,
  },
  sleeping: {
    eyeScaleY: 0.15,
    eyeOffsetY: -0.02,
    mouthScaleX: 0.6,
    mouthScaleY: 0.5,
    mouthY: DEFAULT_MOUTH_Y,
  },
}

// ---------------------------------------------------------------------------
// Mood derivation
// ---------------------------------------------------------------------------

/**
 * Derives the character's current mood from their needs and activity.
 * Similar priority logic to `selectPhraseCategory` in phrases.ts but
 * returns a smaller set of face-relevant moods.
 */
export function deriveMood(needs: Needs, activity: ActivityType): Mood {
  if (activity === 'sleep') return 'sleeping'

  const VERY_HIGH = 0.8
  const HIGH = 0.5

  if (needs.sleep >= VERY_HIGH) return 'very_tired'
  if (needs.hunger >= VERY_HIGH) return 'very_hungry'

  if (needs.sleep >= HIGH) return 'tired'
  if (needs.hunger >= HIGH) return 'hungry'
  if (needs.entertainment >= HIGH) return 'bored'

  if (needs.hunger < 0.2 && needs.sleep < 0.2) return 'happy'
  return 'content'
}

// ---------------------------------------------------------------------------
// Face update
// ---------------------------------------------------------------------------

/**
 * Applies a mood expression to the face meshes by adjusting their scale
 * and position.  Called every frame from the character update loop.
 */
export function applyFaceExpression(face: FaceParts, mood: Mood): void {
  const expr = EXPRESSIONS[mood]

  // Eyes
  face.leftEye.scale.y = expr.eyeScaleY
  face.rightEye.scale.y = expr.eyeScaleY
  face.leftEye.position.y = DEFAULT_EYE_Y + expr.eyeOffsetY
  face.rightEye.position.y = DEFAULT_EYE_Y + expr.eyeOffsetY

  // Mouth
  face.mouth.scale.x = expr.mouthScaleX
  face.mouth.scale.y = expr.mouthScaleY
  face.mouth.position.y = expr.mouthY
}
