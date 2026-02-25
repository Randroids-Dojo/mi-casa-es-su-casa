// ---------------------------------------------------------------------------
// Character appearance seeder — deterministic name-to-appearance hash
// ---------------------------------------------------------------------------
//
// Uses the FNV-1a 32-bit hash algorithm to derive a stable seed from a
// character name. All appearance attributes are derived from this seed, so
// the same name always produces the same appearance.

export interface CharacterAppearance {
  skinTone: number // hex color
  hairColor: number // hex color
  hairStyle: 'short' | 'long' | 'curly' | 'bald'
  outfitPrimary: number // hex color
  outfitSecondary: number // hex color
  outfitStyle: 'casual' | 'formal' | 'sporty' | 'quirky'
  hobbyType: 'music' | 'painting' | 'tinkering' | 'reading'
  personalityBias: 'introverted' | 'extroverted' | 'lazy' | 'energetic'
}

export type HairStyle = CharacterAppearance['hairStyle']
export type OutfitStyle = CharacterAppearance['outfitStyle']
export type HobbyType = CharacterAppearance['hobbyType']
export type PersonalityBias = CharacterAppearance['personalityBias']

// ---------------------------------------------------------------------------
// FNV-1a 32-bit hash
// ---------------------------------------------------------------------------

/**
 * Computes the FNV-1a 32-bit hash of a string.
 * Returns a non-negative integer in the range [0, 2^32).
 */
function fnv1a32(input: string): number {
  const FNV_PRIME = 0x01000193 // 16777619
  const FNV_OFFSET = 0x811c9dc5 // 2166136261

  let hash = FNV_OFFSET >>> 0

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // Multiply by FNV prime with 32-bit overflow (imul keeps 32-bit result)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }

  return hash >>> 0
}

// ---------------------------------------------------------------------------
// Seeded PRNG — a simple LCG so we can draw multiple values from one seed
// ---------------------------------------------------------------------------

class SeededRng {
  private state: number

  constructor(seed: number) {
    // Ensure nonzero, positive 32-bit state
    this.state = (seed >>> 0) | 1
  }

  /** Returns the next float in [0, 1) */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0
    return this.state / 0x100000000
  }

  /** Returns a random integer in [0, n) */
  nextInt(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** Picks a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)]
  }
}

// ---------------------------------------------------------------------------
// Appearance palettes
// ---------------------------------------------------------------------------

/** 5 realistic skin tone hex values (from light to dark) */
const SKIN_TONES: readonly number[] = [
  0xfde0c8, // very light
  0xf0c8a0, // light
  0xd4956a, // medium
  0xa0603a, // tan/brown
  0x5c3018, // deep brown
]

/** 6 realistic hair colors */
const HAIR_COLORS: readonly number[] = [
  0x1a0a00, // black
  0x4a2c0a, // dark brown
  0x7a4a1e, // medium brown
  0xc8841e, // auburn/red
  0xd4a840, // blonde
  0xa8a8a8, // grey
]

const HAIR_STYLES: readonly HairStyle[] = ['short', 'long', 'curly', 'bald']

/** 8 varied outfit primary colors */
const OUTFIT_PRIMARY_COLORS: readonly number[] = [
  0x2e5fa3, // blue
  0x8b3a3a, // burgundy
  0x3a8b4a, // forest green
  0x7a4a8b, // purple
  0x8b6a3a, // tan/khaki
  0x3a6b8b, // teal
  0xc85a28, // burnt orange
  0x2e2e2e, // charcoal
]

/** 8 varied outfit secondary colors */
const OUTFIT_SECONDARY_COLORS: readonly number[] = [
  0x1a3a6b, // dark navy
  0x5a1a1a, // dark red
  0x1a5a2a, // dark green
  0x4a1a5a, // dark purple
  0x5a3a1a, // dark tan
  0x1a4a5a, // dark teal
  0x8b3a1a, // dark orange
  0x4a4a4a, // medium grey
]

const OUTFIT_STYLES: readonly OutfitStyle[] = ['casual', 'formal', 'sporty', 'quirky']

const HOBBY_TYPES: readonly HobbyType[] = ['music', 'painting', 'tinkering', 'reading']

const PERSONALITY_BIASES: readonly PersonalityBias[] = [
  'introverted',
  'extroverted',
  'lazy',
  'energetic',
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a deterministic `CharacterAppearance` from a character name.
 * The name is lowercased before hashing so "Alice" and "alice" produce
 * the same appearance.
 */
export function seedFromName(name: string): CharacterAppearance {
  const normalized = name.toLowerCase()
  const seed = fnv1a32(normalized)
  const rng = new SeededRng(seed)

  return {
    skinTone: rng.pick(SKIN_TONES),
    hairColor: rng.pick(HAIR_COLORS),
    hairStyle: rng.pick(HAIR_STYLES),
    outfitPrimary: rng.pick(OUTFIT_PRIMARY_COLORS),
    outfitSecondary: rng.pick(OUTFIT_SECONDARY_COLORS),
    outfitStyle: rng.pick(OUTFIT_STYLES),
    hobbyType: rng.pick(HOBBY_TYPES),
    personalityBias: rng.pick(PERSONALITY_BIASES),
  }
}

/**
 * Derives a deterministic seeded random number in [0, 1) from a composite
 * key (e.g. name + day + hour). Useful for semi-deterministic schedule
 * variance.
 */
export function seededRandom(key: string): number {
  const seed = fnv1a32(key)
  const rng = new SeededRng(seed)
  return rng.next()
}

/**
 * Returns a SeededRng instance from a composite key.
 * Callers can draw multiple values from the same key.
 */
export function seededRngFromKey(key: string): SeededRng {
  return new SeededRng(fnv1a32(key))
}
