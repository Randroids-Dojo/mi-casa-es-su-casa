import { test } from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

// ─── Test 1: GET /api/health ──────────────────────────────────────────────────

test('GET /api/health returns 200 with { ok: true }', async () => {
  const res = await fetch(`${BASE_URL}/api/health`)

  assert.equal(res.status, 200, `Expected 200 but got ${res.status}`)

  const body = (await res.json()) as unknown
  assert.deepEqual(body, { ok: true }, 'Expected body { ok: true }')
})

// ─── Test 2: GET /api/character/[name] ───────────────────────────────────────

test('GET /api/character/testuser returns valid JSON (200 or 501)', async () => {
  const res = await fetch(`${BASE_URL}/api/character/testuser`)

  const acceptedStatuses = [200, 501]
  assert.ok(
    acceptedStatuses.includes(res.status),
    `Expected status 200 or 501 but got ${res.status}`
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

test('POST /api/character/testuser returns valid JSON (200, 201, or 501)', async () => {
  const payload = { hunger: 80, sleep: 60, hygiene: 70, entertainment: 50 }

  const res = await fetch(`${BASE_URL}/api/character/testuser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const acceptedStatuses = [200, 201, 501]
  assert.ok(
    acceptedStatuses.includes(res.status),
    `Expected status 200, 201, or 501 but got ${res.status}`
  )

  const contentType = res.headers.get('content-type') ?? ''
  assert.ok(
    contentType.includes('application/json'),
    `Expected JSON content-type but got "${contentType}"`
  )

  // Ensure body parses as valid JSON (will throw if not)
  await res.json()
})
