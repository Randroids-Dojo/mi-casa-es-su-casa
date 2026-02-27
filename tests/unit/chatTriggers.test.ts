// ---------------------------------------------------------------------------
// Unit tests for chat trigger keyword matching
// ---------------------------------------------------------------------------
//
// These tests verify that visitor messages are correctly matched to room
// triggers based on keyword presence and position within the message.
//
// Run:  npm run test:unit

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  matchChatTrigger,
  pickResponsePhrase,
  CHAT_TRIGGERS,
} from '../../src/game/character/chatTriggers'

// ---------------------------------------------------------------------------
// matchChatTrigger
// ---------------------------------------------------------------------------

describe('matchChatTrigger', () => {
  test('returns null for empty string', () => {
    assert.equal(matchChatTrigger(''), null)
  })

  test('returns null for unrecognized message', () => {
    assert.equal(matchChatTrigger('just vibing'), null)
    assert.equal(matchChatTrigger('nothing relevant here'), null)
  })

  test('matches kitchen keywords', () => {
    const result = matchChatTrigger("I'm so hungry")
    assert.ok(result)
    assert.equal(result.trigger.room, 'kitchen')
    assert.equal(result.matchedKeyword, 'hungry')
  })

  test('matches bathroom keywords', () => {
    const result = matchChatTrigger('gotta poop')
    assert.ok(result)
    assert.equal(result.trigger.room, 'bathroom')
    assert.equal(result.matchedKeyword, 'poop')
  })

  test('matches bedroom keywords', () => {
    const result = matchChatTrigger("i'm so tired")
    assert.ok(result)
    assert.equal(result.trigger.room, 'bedroom')
    assert.equal(result.matchedKeyword, 'tired')
  })

  test('matches living room keywords', () => {
    const result = matchChatTrigger('wanna watch a movie')
    assert.ok(result)
    assert.equal(result.trigger.room, 'living_room')
    assert.equal(result.matchedKeyword, 'watch')
  })

  test('matches study keywords', () => {
    const result = matchChatTrigger('time to study')
    assert.ok(result)
    assert.equal(result.trigger.room, 'study')
    assert.equal(result.matchedKeyword, 'study')
  })

  test('matches hobby room keywords', () => {
    const result = matchChatTrigger('play some music')
    assert.ok(result)
    assert.equal(result.trigger.room, 'hobby_room')
    assert.equal(result.matchedKeyword, 'music')
  })

  test('matches storage keywords', () => {
    const result = matchChatTrigger('go rummage around')
    assert.ok(result)
    assert.equal(result.trigger.room, 'storage')
    assert.equal(result.matchedKeyword, 'rummage')
  })

  test('matches entrance keywords', () => {
    const result = matchChatTrigger('hello there')
    assert.ok(result)
    assert.equal(result.trigger.room, 'entrance')
    assert.equal(result.matchedKeyword, 'hello')
  })

  test('is case insensitive', () => {
    const result = matchChatTrigger('HUNGRY for pizza')
    assert.ok(result)
    assert.equal(result.trigger.room, 'kitchen')
  })

  test('strips punctuation — matches "hungry!" as "hungry"', () => {
    const result = matchChatTrigger('hungry!')
    assert.ok(result)
    assert.equal(result.trigger.room, 'kitchen')
    assert.equal(result.matchedKeyword, 'hungry')
  })

  test('first keyword position wins — "eat then sleep" matches kitchen', () => {
    const result = matchChatTrigger('eat then sleep')
    assert.ok(result)
    assert.equal(result.trigger.room, 'kitchen')
    assert.equal(result.matchedKeyword, 'eat')
  })

  test('first keyword position wins — "sleep then eat" matches bedroom', () => {
    const result = matchChatTrigger('sleep then eat')
    assert.ok(result)
    assert.equal(result.trigger.room, 'bedroom')
    assert.equal(result.matchedKeyword, 'sleep')
  })

  test('multi-word keyword "fresh air" matches entrance', () => {
    const result = matchChatTrigger('let me get some fresh air')
    assert.ok(result)
    assert.equal(result.trigger.room, 'entrance')
    assert.equal(result.matchedKeyword, 'fresh air')
  })

  test('multi-word keyword "brush teeth" matches bathroom', () => {
    const result = matchChatTrigger('go brush teeth')
    assert.ok(result)
    assert.equal(result.trigger.room, 'bathroom')
    assert.equal(result.matchedKeyword, 'brush teeth')
  })

  test('multi-word keyword wins when it appears earlier', () => {
    // "come in" at position 0, "food" at position 12
    const result = matchChatTrigger('come in and grab some food')
    assert.ok(result)
    assert.equal(result.trigger.room, 'entrance')
    assert.equal(result.matchedKeyword, 'come in')
  })

  test('single-word keyword wins when it appears earlier than multi-word', () => {
    // "eat" at position 0, "fresh air" at position 13
    const result = matchChatTrigger('eat before the fresh air')
    assert.ok(result)
    assert.equal(result.trigger.room, 'kitchen')
    assert.equal(result.matchedKeyword, 'eat')
  })

  test('inflected forms match — "eating" triggers kitchen', () => {
    const result = matchChatTrigger('keep eating')
    assert.ok(result)
    assert.equal(result.trigger.room, 'kitchen')
    assert.equal(result.matchedKeyword, 'eating')
  })

  test('inflected forms match — "sleeping" triggers bedroom', () => {
    const result = matchChatTrigger('stop sleeping')
    assert.ok(result)
    assert.equal(result.trigger.room, 'bedroom')
    assert.equal(result.matchedKeyword, 'sleeping')
  })

  test('word embedded in larger word does not match — "beaten" is not "eat"', () => {
    const result = matchChatTrigger('beaten by the system')
    assert.equal(result, null)
  })

  test('multi-word keyword respects word boundaries — "become intelligent" does not match "come in"', () => {
    const result = matchChatTrigger('become intelligent')
    assert.equal(result, null)
  })

  test('multi-word keyword still matches at word boundaries', () => {
    const result = matchChatTrigger('please come in')
    assert.ok(result)
    assert.equal(result.trigger.room, 'entrance')
    assert.equal(result.matchedKeyword, 'come in')
  })
})

// ---------------------------------------------------------------------------
// pickResponsePhrase
// ---------------------------------------------------------------------------

describe('pickResponsePhrase', () => {
  test('returns a string from the trigger response phrases', () => {
    const trigger = CHAT_TRIGGERS.find((t) => t.room === 'kitchen')!
    const phrase = pickResponsePhrase(trigger, 0)
    assert.ok(trigger.responsePhrases.includes(phrase))
  })

  test('different seeds produce varied phrases', () => {
    const trigger = CHAT_TRIGGERS.find((t) => t.room === 'kitchen')!
    const phrases = new Set<string>()
    for (let i = 0; i < 20; i++) {
      phrases.add(pickResponsePhrase(trigger, i))
    }
    // With 8 phrases and 20 seeds, we should hit at least 3 unique
    assert.ok(phrases.size >= 3, `Expected >=3 unique phrases, got ${phrases.size}`)
  })

  test('same seed always returns the same phrase', () => {
    const trigger = CHAT_TRIGGERS.find((t) => t.room === 'bathroom')!
    const a = pickResponsePhrase(trigger, 42)
    const b = pickResponsePhrase(trigger, 42)
    assert.equal(a, b)
  })
})
