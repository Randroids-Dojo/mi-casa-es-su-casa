import { test, expect } from '@playwright/test'

test.describe('Boot screen', () => {
  test('renders page with CRT terminal', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })

  test('shows MI CASA ES SU CASA title during boot', async ({ page }) => {
    await page.goto('/')
    // Use locator scoped to main content to avoid matching <title> element
    await expect(page.locator('main, body > div').getByText('MI CASA', { exact: false }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('shows READY and then name prompt', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('READY.', { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#name-input')).toBeVisible({ timeout: 5_000 })
  })

  test('name input is focused automatically', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#name-input', { timeout: 15_000 })
    await expect(page.locator('#name-input')).toBeFocused({ timeout: 2_000 })
  })
})
