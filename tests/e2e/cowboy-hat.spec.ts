import { test, expect } from '@playwright/test'
import { gotoCharacterPageDirect } from './fixtures/pages'

// Minimal VisitorLog response returned by the mocked messages endpoint.
// Shape must satisfy VisitorLog so the panel renders correctly after send.
const MOCK_LOG = {
  name: 'playwright',
  messages: [{ text: 'giddy up', postedAt: new Date().toISOString() }],
  totalCount: 1,
}

test.describe('Cowboy hat', () => {
  test('"giddy up" message is accepted by the visitor panel', async ({ page }) => {
    // Mock the messages POST so the send succeeds without a real KV store.
    await page.route(/\/api\/character\/playwright\/messages$/, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_LOG),
        })
      } else {
        await route.continue()
      }
    })

    await gotoCharacterPageDirect(page, 'playwright')

    // The visitor panel starts collapsed — expand it first.
    await page.click('[aria-label="Expand visitor messages"]')

    await page.fill('#visitor-msg-input', 'giddy up')
    await page.click('[aria-label="Send message"]')

    // Input should clear after a successful send.
    await expect(page.locator('#visitor-msg-input')).toHaveValue('', { timeout: 5_000 })
  })

  test('sending "giddy up" eventually saves COWBOY_HAT in character state', async ({ page }) => {
    // Walk + dress takes ~1-3 real seconds (REAL_SECONDS_PER_GAME_MINUTE = 0.1).
    // Autosave fires every 30 s. Allow up to 45 s total.
    test.setTimeout(55_000)

    // Mock the messages POST so the "giddy up" trigger fires reliably.
    await page.route(/\/api\/character\/playwright\/messages$/, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_LOG),
        })
      } else {
        await route.continue()
      }
    })

    // Intercept autosave POSTs and flag when accessories include the hat.
    // Use $ anchor so this does NOT match the /messages sub-route.
    let savedWithHat = false
    await page.route(/\/api\/character\/playwright$/, async (route) => {
      if (route.request().method() === 'POST') {
        try {
          const body = JSON.parse(route.request().postData() ?? '{}') as {
            accessories?: string[]
          }
          if (body.accessories?.includes('COWBOY_HAT')) {
            savedWithHat = true
          }
        } catch {
          // ignore parse errors
        }
      }
      await route.continue()
    })

    await gotoCharacterPageDirect(page, 'playwright')

    // Expand panel, send the magic phrase.
    await page.click('[aria-label="Expand visitor messages"]')
    await page.fill('#visitor-msg-input', 'giddy up')
    await page.click('[aria-label="Send message"]')

    // Wait for an autosave that includes the hat (polls every second).
    await expect.poll(() => savedWithHat, { timeout: 45_000, intervals: [1_000] }).toBe(true)
  })
})
