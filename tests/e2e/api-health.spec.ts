import { test, expect } from '@playwright/test'

test.describe('API health', () => {
  test('GET /api/health returns 200 with ok: true', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
  })

  test('POST /api/validate-name rejects blocked name', async ({ request }) => {
    const response = await request.post('/api/validate-name', {
      data: { name: 'admin' },
    })
    const body = await response.json()
    expect(body.valid).toBe(false)
  })

  test('POST /api/validate-name accepts valid name', async ({ request }) => {
    const response = await request.post('/api/validate-name', {
      data: { name: 'PLAYWRIGHT' },
    })
    const body = await response.json()
    expect(body.valid).toBe(true)
    expect(body.normalizedName).toBeDefined()
  })
})
