// ---------------------------------------------------------------------------
// Footstep detector — detects "foot down" events from animation progress
// ---------------------------------------------------------------------------
//
// Pure logic module with no Web Audio dependency. Compares previous vs current
// animation progress and emits footstep events when foot-down thresholds are
// crossed during walk or climb_stairs animations.

import type { AnimationState } from '../character/animations'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SurfaceType = 'wood' | 'stairs'

export interface FootstepEvent {
  surface: SurfaceType
}

export interface FootstepDetectorState {
  prevProgress: number
  prevAnimName: string
  /** Thresholds already fired this half-cycle, prevents double-firing */
  firedThresholds: Set<number>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Thresholds where feet touch down in the walk/climb cycle.
 *
 * The walk animation uses oscillate(progress, 0, amplitude) which computes
 * sin(progress * 2pi) * amplitude. Right leg rotation = swing, left = -swing.
 *
 * Right foot peaks at progress 0.25 (sin(pi/2) = 1, max forward extension).
 * Left foot peaks at progress 0.75 (sin(3pi/2) = -1, left leg at max forward).
 *
 * Foot-down occurs at these peak-extension points.
 */
const FOOT_DOWN_THRESHOLDS = [0.25, 0.75] as const

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createFootstepDetectorState(): FootstepDetectorState {
  return {
    prevProgress: 0,
    prevAnimName: 'idle',
    firedThresholds: new Set(),
  }
}

/**
 * Detects footstep events by comparing previous and current animation state.
 * Returns an array of FootstepEvents (0, 1, or rarely 2 per frame).
 *
 * Mutates detectorState in place for efficiency.
 */
export function detectFootsteps(
  state: FootstepDetectorState,
  current: AnimationState,
): FootstepEvent[] {
  const events: FootstepEvent[] = []

  // Only detect during locomotion animations
  if (current.name !== 'walk' && current.name !== 'climb_stairs') {
    state.prevProgress = current.progress
    state.prevAnimName = current.name
    state.firedThresholds.clear()
    return events
  }

  // Reset detector when animation changes
  if (current.name !== state.prevAnimName) {
    state.prevProgress = current.progress
    state.prevAnimName = current.name
    state.firedThresholds.clear()
    return events
  }

  const surface: SurfaceType = current.name === 'climb_stairs' ? 'stairs' : 'wood'
  const prev = state.prevProgress
  const curr = current.progress

  for (const threshold of FOOT_DOWN_THRESHOLDS) {
    if (state.firedThresholds.has(threshold)) {
      // Already fired — clear once we move far enough past
      if (Math.abs(curr - threshold) > 0.15) {
        state.firedThresholds.delete(threshold)
      }
      continue
    }

    // Check if progress crossed the threshold this frame.
    // Normal case: prev < threshold <= curr
    // Wrap-around case: progress looped from ~1 back to ~0
    const crossed =
      (prev < threshold && curr >= threshold) ||
      (prev > curr && (threshold <= curr || threshold > prev))

    if (crossed) {
      events.push({ surface })
      state.firedThresholds.add(threshold)
    }
  }

  state.prevProgress = curr
  state.prevAnimName = current.name
  return events
}
