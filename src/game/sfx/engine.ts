// ---------------------------------------------------------------------------
// SFX Engine — procedural sound synthesis via Web Audio API
// ---------------------------------------------------------------------------
//
// Manages the AudioContext lifecycle and synthesizes footstep sounds.
// AudioContext is created lazily on user gesture (browser policy requires this).
// All methods silently no-op when audio is unavailable (headless, SSR, etc.).

import type { SurfaceType } from './footstepDetector'

// ---------------------------------------------------------------------------
// SFX Engine
// ---------------------------------------------------------------------------

export class SfxEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private _unlocked = false

  /** Pre-allocated noise buffers, created once in unlock() and reused */
  private woodNoiseBuf: AudioBuffer | null = null
  private stairsNoiseBuf: AudioBuffer | null = null

  /**
   * Creates and resumes the AudioContext. Must be called from a user gesture
   * handler (touchstart, mousedown, click). Idempotent — safe to call repeatedly.
   */
  unlock(): void {
    if (this._unlocked) return
    try {
      this.ctx = new AudioContext()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = 0.15
      this.masterGain.connect(this.ctx.destination)
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume()
      }
      this._prepareNoiseBuffers()
      this._unlocked = true
    } catch {
      // Web Audio unavailable — silently degrade
      this.ctx = null
      this.masterGain = null
    }
  }

  get isUnlocked(): boolean {
    return this._unlocked
  }

  playFootstep(surface: SurfaceType): void {
    if (!this.ctx || !this.masterGain) return
    if (surface === 'stairs') {
      this._playStairsFootstep()
    } else {
      this._playWoodFootstep()
    }
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
      this.masterGain = null
      this.woodNoiseBuf = null
      this.stairsNoiseBuf = null
    }
  }

  // -------------------------------------------------------------------------
  // Noise buffer preparation
  // -------------------------------------------------------------------------

  private _prepareNoiseBuffers(): void {
    if (!this.ctx) return

    // Wood: 40ms noise burst
    const woodLen = Math.floor(this.ctx.sampleRate * 0.04)
    this.woodNoiseBuf = this.ctx.createBuffer(1, woodLen, this.ctx.sampleRate)
    const woodData = this.woodNoiseBuf.getChannelData(0)
    for (let i = 0; i < woodLen; i++) {
      woodData[i] = (Math.random() * 2 - 1) * 0.5
    }

    // Stairs: 60ms noise burst
    const stairsLen = Math.floor(this.ctx.sampleRate * 0.06)
    this.stairsNoiseBuf = this.ctx.createBuffer(1, stairsLen, this.ctx.sampleRate)
    const stairsData = this.stairsNoiseBuf.getChannelData(0)
    for (let i = 0; i < stairsLen; i++) {
      stairsData[i] = (Math.random() * 2 - 1) * 0.4
    }
  }

  // -------------------------------------------------------------------------
  // Doorbell — two-tone "ding-dong"
  // -------------------------------------------------------------------------

  playDoorbell(): void {
    if (!this.ctx || !this.masterGain) return
    const ctx = this.ctx
    const now = ctx.currentTime

    // --- Ding: C5 (523 Hz), bright sine with quick decay ---
    const ding = ctx.createOscillator()
    ding.type = 'sine'
    ding.frequency.setValueAtTime(523, now)

    const dingGain = ctx.createGain()
    dingGain.gain.setValueAtTime(0.5, now)
    dingGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)

    ding.connect(dingGain).connect(this.masterGain)
    ding.start(now)
    ding.stop(now + 0.35)

    // --- Dong: G4 (392 Hz), slightly delayed, longer sustain ---
    const dong = ctx.createOscillator()
    dong.type = 'sine'
    dong.frequency.setValueAtTime(392, now + 0.25)

    const dongGain = ctx.createGain()
    dongGain.gain.setValueAtTime(0.001, now)
    dongGain.gain.setValueAtTime(0.45, now + 0.25)
    dongGain.gain.exponentialRampToValueAtTime(0.01, now + 0.7)

    dong.connect(dongGain).connect(this.masterGain)
    dong.start(now + 0.25)
    dong.stop(now + 0.7)
  }

  // -------------------------------------------------------------------------
  // Randomization helper
  // -------------------------------------------------------------------------

  /** Returns base * (1 + random offset in [-spread, +spread]) */
  private _jitter(base: number, spread: number): number {
    return base * (1 + (Math.random() * 2 - 1) * spread)
  }

  // -------------------------------------------------------------------------
  // Wood floor footstep — short, dry tap
  // -------------------------------------------------------------------------

  private _playWoodFootstep(): void {
    const ctx = this.ctx!
    const now = ctx.currentTime

    // --- Tone: short pitched click (square wave, retro character) ---
    const osc = ctx.createOscillator()
    osc.type = 'square'
    const startFreq = this._jitter(180, 0.08)
    osc.frequency.setValueAtTime(startFreq, now)
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.06)

    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(this._jitter(0.3, 0.1), now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

    // --- Noise: high-end transient texture ---
    const noise = ctx.createBufferSource()
    noise.buffer = this.woodNoiseBuf

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'highpass'
    noiseFilter.frequency.value = 2000

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.15, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

    // --- Connect ---
    osc.connect(oscGain).connect(this.masterGain!)
    noise.connect(noiseFilter).connect(noiseGain).connect(this.masterGain!)

    // --- Schedule ---
    osc.start(now)
    osc.stop(now + 0.08)
    noise.start(now)
    noise.stop(now + 0.04)
  }

  // -------------------------------------------------------------------------
  // Stairs footstep — deeper, hollow, resonant
  // -------------------------------------------------------------------------

  private _playStairsFootstep(): void {
    const ctx = this.ctx!
    const now = ctx.currentTime

    // --- Tone: deeper triangle wave with resonance ---
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    const startFreq = this._jitter(120, 0.08)
    osc.frequency.setValueAtTime(startFreq, now)
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12)

    const resonance = ctx.createBiquadFilter()
    resonance.type = 'bandpass'
    resonance.frequency.value = 200
    resonance.Q.value = 5

    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(this._jitter(0.35, 0.1), now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

    // --- Noise: mid-range wooden creak ---
    const noise = ctx.createBufferSource()
    noise.buffer = this.stairsNoiseBuf

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 800
    noiseFilter.Q.value = 3

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.12, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

    // --- Connect ---
    osc.connect(resonance).connect(oscGain).connect(this.masterGain!)
    noise.connect(noiseFilter).connect(noiseGain).connect(this.masterGain!)

    // --- Schedule ---
    osc.start(now)
    osc.stop(now + 0.15)
    noise.start(now)
    noise.stop(now + 0.06)
  }
}
