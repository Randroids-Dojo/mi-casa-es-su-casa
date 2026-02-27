import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  createFootstepDetectorState,
  detectFootsteps,
} from '../../src/game/sfx/footstepDetector'
import type { AnimationState } from '../../src/game/character/animations'

describe('footstepDetector', () => {
  test('no events during idle animation', () => {
    const state = createFootstepDetectorState()
    const anim: AnimationState = { name: 'idle', progress: 0.25 }
    const events = detectFootsteps(state, anim)
    assert.equal(events.length, 0)
  })

  test('no events during non-locomotion animations', () => {
    const state = createFootstepDetectorState()
    for (const name of ['sit', 'sleep', 'eat', 'type', 'paint'] as const) {
      const events = detectFootsteps(state, { name, progress: 0.25 })
      assert.equal(events.length, 0, `should not fire for ${name}`)
    }
  })

  test('detects right foot down at progress 0.25 during walk', () => {
    const state = createFootstepDetectorState()
    state.prevProgress = 0.2
    state.prevAnimName = 'walk'
    const events = detectFootsteps(state, { name: 'walk', progress: 0.26 })
    assert.equal(events.length, 1)
    assert.equal(events[0].surface, 'wood')
  })

  test('detects left foot down at progress 0.75 during walk', () => {
    const state = createFootstepDetectorState()
    state.prevProgress = 0.7
    state.prevAnimName = 'walk'
    const events = detectFootsteps(state, { name: 'walk', progress: 0.76 })
    assert.equal(events.length, 1)
    assert.equal(events[0].surface, 'wood')
  })

  test('emits stairs surface during climb_stairs', () => {
    const state = createFootstepDetectorState()
    state.prevProgress = 0.2
    state.prevAnimName = 'climb_stairs'
    const events = detectFootsteps(state, { name: 'climb_stairs', progress: 0.26 })
    assert.equal(events.length, 1)
    assert.equal(events[0].surface, 'stairs')
  })

  test('does not double-fire for same threshold', () => {
    const state = createFootstepDetectorState()
    state.prevProgress = 0.24
    state.prevAnimName = 'walk'
    // First crossing fires
    const first = detectFootsteps(state, { name: 'walk', progress: 0.25 })
    assert.equal(first.length, 1)
    // Next frame still near 0.25 — should not fire again
    const second = detectFootsteps(state, { name: 'walk', progress: 0.26 })
    assert.equal(second.length, 0)
  })

  test('resets fired thresholds on animation change', () => {
    const state = createFootstepDetectorState()
    state.prevProgress = 0.5
    state.prevAnimName = 'walk'
    state.firedThresholds.add(0.25)
    // Switch to idle clears state
    detectFootsteps(state, { name: 'idle', progress: 0 })
    assert.equal(state.firedThresholds.size, 0)
  })

  test('full walk cycle produces exactly 2 footsteps', () => {
    const state = createFootstepDetectorState()
    state.prevAnimName = 'walk'
    state.prevProgress = 0
    let total = 0
    // Simulate 60 frames over one full cycle (progress 0 -> 1)
    for (let i = 1; i <= 60; i++) {
      const progress = i / 60
      const events = detectFootsteps(state, { name: 'walk', progress })
      total += events.length
    }
    assert.equal(total, 2, 'Expected exactly 2 footsteps per walk cycle')
  })

  test('handles progress wrap-around (1.0 -> 0.0)', () => {
    const state = createFootstepDetectorState()
    state.prevAnimName = 'walk'
    // Simulate being just before wrap
    state.prevProgress = 0.95
    // Progress wraps around past 0.25
    const events = detectFootsteps(state, { name: 'walk', progress: 0.05 })
    // Should not fire 0.75 (already passed) but may fire 0.25 if in range
    // At 0.05 we haven't reached 0.25 yet, so 0 events expected
    assert.equal(events.length, 0)
  })

  test('multiple consecutive cycles produce consistent footsteps', () => {
    const state = createFootstepDetectorState()
    state.prevAnimName = 'walk'
    state.prevProgress = 0
    let total = 0
    // 3 full cycles at 60 frames each
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 1; i <= 60; i++) {
        const progress = i / 60
        const events = detectFootsteps(state, { name: 'walk', progress })
        total += events.length
      }
      // Reset progress for next cycle (simulating the modulo wrap in advanceAnimation)
      state.prevProgress = 0
    }
    assert.equal(total, 6, 'Expected 2 footsteps per cycle * 3 cycles = 6')
  })
})
