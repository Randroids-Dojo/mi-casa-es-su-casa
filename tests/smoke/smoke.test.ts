import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERSISTENCE_VERSION } from '../../src/lib/persistenceVersion'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

// ─── Test 1: GET /api/health ──────────────────────────────────────────────────

test('GET /api/health returns 200 with { ok: true }', async () => {
  const res = await fetch(`${BASE_URL}/api/health`)

  assert.equal(res.status, 200, `Expected 200 but got ${res.status}`)

  const body = (await res.json()) as { ok: unknown }
  assert.ok(body.ok === true, 'Expected body.ok to be true')
})

// ─── Test 2: GET /api/character/[name] ───────────────────────────────────────

test('GET /api/character/testuser returns valid JSON (200, 201, or 503)', async () => {
  const res = await fetch(`${BASE_URL}/api/character/testuser`)

  // 200/201 = KV available; 503 = KV unavailable in CI (expected)
  const acceptedStatuses = [200, 201, 503]
  assert.ok(
    acceptedStatuses.includes(res.status),
    `Expected status 200, 201, or 503 but got ${res.status}`
  )

  const contentType = res.headers.get('content-type') ?? ''
  assert.ok(
    contentType.includes('application/json'),
    `Expected JSON content-type but got "${contentType}"`
  )

  // Ensure body parses as valid JSON (will throw if not)
  await res.json()
})

// ─── Test 3: POST /api/character/[name] ──────────────────────────────────────

test('POST /api/character/testuser returns valid JSON (200, 201, or 503)', async () => {
  // Full CharacterState payload matching CharacterStateSchema
  const payload = {
    name: 'testuser',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastSeenAt: '2024-01-01T00:00:00.000Z',
    currentRoom: 'living_room',
    currentActivity: 'idle',
    needs: { hunger: 0.8, sleep: 0.6, hygiene: 0.7, entertainment: 0.5 },
    clock: { hour: 12, day: 0 },
    position: { x: 4.0, y: 0.0, z: 4.0 },
  }

  const res = await fetch(`${BASE_URL}/api/character/testuser?v=${PERSISTENCE_VERSION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  // 200 = saved; 503 = KV unavailable in CI (expected)
  const acceptedStatuses = [200, 201, 503]
  assert.ok(
    acceptedStatuses.includes(res.status),
    `Expected status 200, 201, or 503 but got ${res.status}`
  )

  const contentType = res.headers.get('content-type') ?? ''
  assert.ok(
    contentType.includes('application/json'),
    `Expected JSON content-type but got "${contentType}"`
  )

  // Ensure body parses as valid JSON (will throw if not)
  await res.json()
})

// ─── Test 4: accessories round-trip ──────────────────────────────────────────

test('POST /api/character/testuser with accessories round-trips COWBOY_HAT', async () => {
  const payload = {
    name: 'testuser',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastSeenAt: '2024-01-01T00:00:00.000Z',
    currentRoom: 'living_room',
    currentActivity: 'idle',
    needs: { hunger: 0.8, sleep: 0.6, hygiene: 0.7, entertainment: 0.5 },
    clock: { hour: 12, day: 0 },
    position: { x: 4.0, y: 0.0, z: 4.0 },
    accessories: ['COWBOY_HAT'],
  }

  const res = await fetch(`${BASE_URL}/api/character/testuser?v=${PERSISTENCE_VERSION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  // 200 = saved; 503 = KV unavailable in CI (expected)
  const acceptedStatuses = [200, 201, 503]
  assert.ok(
    acceptedStatuses.includes(res.status),
    `Expected status 200, 201, or 503 but got ${res.status}`
  )

  const body = (await res.json()) as { accessories?: unknown }

  if (res.status !== 503) {
    assert.deepEqual(
      body.accessories,
      ['COWBOY_HAT'],
      'accessories should round-trip unchanged',
    )
  }
})
