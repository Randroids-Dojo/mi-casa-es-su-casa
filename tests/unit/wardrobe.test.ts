// ---------------------------------------------------------------------------
// Unit tests for wardrobe keyword matching
// ---------------------------------------------------------------------------
//
// These tests verify that visitor messages asking for clothing changes are
// correctly parsed into wardrobe changes (accessories, shirt/pants colors).
//
// Run:  npm run test:unit

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  matchWardrobeRequest,
  pickWardrobePhrases,
  ACCESSORY_SLOT,
  OUTFIT_COLOR_HEX,
} from '../../src/game/character/wardrobe'
import type { WardrobeChange } from '../../src/game/character/wardrobe'
import { ClothingItemSchema, OutfitColorSchema } from '../../src/lib/characterSchema'

function shirtChange(changes: WardrobeChange[]) {
  return changes.find((c) => c.kind === 'shirt')
}
function pantsChange(changes: WardrobeChange[]) {
  return changes.find((c) => c.kind === 'pants')
}
function accessoryItems(changes: WardrobeChange[]): string[] {
  return changes.filter((c) => c.kind === 'accessory').map((c) => c.item)
}

// ---------------------------------------------------------------------------
// matchWardrobeRequest
// ---------------------------------------------------------------------------

describe('matchWardrobeRequest', () => {
  test('returns null for empty and unrelated messages', () => {
    assert.equal(matchWardrobeRequest(''), null)
    assert.equal(matchWardrobeRequest('just vibing'), null)
    assert.equal(matchWardrobeRequest('what a lovely house'), null)
    // A bare color with no garment is not a request
    assert.equal(matchWardrobeRequest('green is my favorite color'), null)
  })

  test("matches Santiago's request: a green shirt", () => {
    const result = matchWardrobeRequest('How do you change clothes? I want a green shirt.')
    assert.ok(result)
    const shirt = shirtChange(result.changes)
    assert.ok(shirt)
    assert.equal(shirt.color, 'green')
  })

  test('color word applies to the following garment', () => {
    const result = matchWardrobeRequest('please wear a red shirt')
    assert.ok(result)
    assert.deepEqual(shirtChange(result.changes), { kind: 'shirt', color: 'red' })
  })

  test('multiple colored garments each get their own color', () => {
    const result = matchWardrobeRequest('green shirt and blue pants please')
    assert.ok(result)
    assert.equal(shirtChange(result.changes)?.color, 'green')
    assert.equal(pantsChange(result.changes)?.color, 'blue')
  })

  test('color synonyms map to canonical colors', () => {
    assert.equal(
      shirtChange(matchWardrobeRequest('a crimson shirt')!.changes)?.color,
      'red',
    )
    assert.equal(
      shirtChange(matchWardrobeRequest('a navy sweater')!.changes)?.color,
      'blue',
    )
    assert.equal(
      pantsChange(matchWardrobeRequest('grey trousers')!.changes)?.color,
      'gray',
    )
  })

  test('garment without a color still matches (seeded random color)', () => {
    const result = matchWardrobeRequest('put on a new shirt', 7)
    assert.ok(result)
    const shirt = shirtChange(result.changes)
    assert.ok(shirt)
    assert.ok(OutfitColorSchema.safeParse(shirt.color).success)
    // Deterministic for the same message and seed
    const again = matchWardrobeRequest('put on a new shirt', 7)
    assert.deepEqual(result, again)
  })

  test('jeans default to blue', () => {
    const result = matchWardrobeRequest('wear some jeans')
    assert.ok(result)
    assert.equal(pantsChange(result.changes)?.color, 'blue')
  })

  test('generic outfit change produces shirt and pants changes', () => {
    const result = matchWardrobeRequest('time to change your clothes')
    assert.ok(result)
    assert.ok(shirtChange(result.changes))
    assert.ok(pantsChange(result.changes))
  })

  test('colored outfit change applies the color to shirt and pants', () => {
    const result = matchWardrobeRequest('put on some purple clothes')
    assert.ok(result)
    assert.equal(shirtChange(result.changes)?.color, 'purple')
    assert.equal(pantsChange(result.changes)?.color, 'purple')
  })

  test('matches accessories', () => {
    assert.deepEqual(
      accessoryItems(matchWardrobeRequest('put on sunglasses')!.changes),
      ['SUNGLASSES'],
    )
    assert.deepEqual(
      accessoryItems(matchWardrobeRequest('you need a scarf')!.changes),
      ['SCARF'],
    )
    assert.deepEqual(
      accessoryItems(matchWardrobeRequest('grow a mustache')!.changes),
      ['MUSTACHE'],
    )
  })

  test('multi-word accessory beats the bare hat fallback', () => {
    assert.deepEqual(
      accessoryItems(matchWardrobeRequest('wear a cowboy hat')!.changes),
      ['COWBOY_HAT'],
    )
    assert.deepEqual(
      accessoryItems(matchWardrobeRequest('a top hat would be fancy')!.changes),
      ['TOP_HAT'],
    )
    // Bare "hat" falls back to the cap
    assert.deepEqual(
      accessoryItems(matchWardrobeRequest('put on a hat')!.changes),
      ['CAP'],
    )
  })

  test('t-shirt survives tokenization', () => {
    const result = matchWardrobeRequest('a yellow t-shirt')
    assert.ok(result)
    assert.equal(shirtChange(result.changes)?.color, 'yellow')
  })

  test('accessories in different slots can be combined', () => {
    const result = matchWardrobeRequest('top hat, sunglasses and a bow tie')
    assert.ok(result)
    const items = accessoryItems(result.changes)
    assert.deepEqual(items.sort(), ['BOW_TIE', 'SUNGLASSES', 'TOP_HAT'])
  })

  test('conflicting same-slot mentions collapse to the last one', () => {
    const result = matchWardrobeRequest('forget the cowboy hat, wear the crown')
    assert.ok(result)
    assert.deepEqual(accessoryItems(result.changes), ['CROWN'])
  })

  test('later garment mention overrides an earlier outfit change', () => {
    const result = matchWardrobeRequest('change clothes, and make the shirt green')
    assert.ok(result)
    assert.equal(shirtChange(result.changes)?.color, 'green')
    assert.ok(pantsChange(result.changes))
  })

  test('color after the garment works: make the pants red', () => {
    const result = matchWardrobeRequest('make the pants red')
    assert.ok(result)
    assert.equal(pantsChange(result.changes)?.color, 'red')
  })

  test('trailing color is not stolen from the next garment', () => {
    const result = matchWardrobeRequest('a shirt and blue pants')
    assert.ok(result)
    assert.equal(pantsChange(result.changes)?.color, 'blue')
    // Shirt got its own (random) color, not blue by theft — any valid color ok
    assert.ok(OutfitColorSchema.safeParse(shirtChange(result.changes)?.color).success)
  })

  test('matchedKeyword reports the first clothing keyword', () => {
    const result = matchWardrobeRequest('I want a green shirt')
    assert.ok(result)
    assert.equal(result.matchedKeyword, 'shirt')
  })
})

// ---------------------------------------------------------------------------
// Vocabulary consistency
// ---------------------------------------------------------------------------

describe('wardrobe vocabulary', () => {
  test('every clothing item has an accessory slot', () => {
    for (const item of ClothingItemSchema.options) {
      assert.ok(ACCESSORY_SLOT[item], `missing slot for ${item}`)
    }
  })

  test('every outfit color has a hex value', () => {
    for (const color of OutfitColorSchema.options) {
      const hex = OUTFIT_COLOR_HEX[color]
      assert.equal(typeof hex, 'number', `missing hex for ${color}`)
      assert.ok(hex >= 0 && hex <= 0xffffff)
    }
  })
})

// ---------------------------------------------------------------------------
// pickWardrobePhrases
// ---------------------------------------------------------------------------

describe('pickWardrobePhrases', () => {
  test('returns 1-3 unique phrases', () => {
    for (let seed = 0; seed < 20; seed++) {
      const phrases = pickWardrobePhrases(seed)
      assert.ok(phrases.length >= 1 && phrases.length <= 3)
      assert.equal(new Set(phrases).size, phrases.length)
    }
  })

  test('is deterministic for the same seed', () => {
    assert.deepEqual(pickWardrobePhrases(42), pickWardrobePhrases(42))
  })
})
