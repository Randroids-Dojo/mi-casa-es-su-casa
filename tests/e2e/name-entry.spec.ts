import { test, expect } from '@playwright/test'
import { waitForNamePrompt } from './fixtures/pages'

test.describe('Name entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForNamePrompt(page)
  })

  test('valid name navigates to /[name]', async ({ page }) => {
    await page.fill('#name-input', 'PLAYWRIGHT')
    await page.keyboard.press('Enter')
    await page.waitForURL('/playwright', { timeout: 10_000 })
    expect(page.url()).toContain('/playwright')
  })

  test('game canvas renders after navigation', async ({ page }) => {
    await page.fill('#name-input', 'TESTUSER')
    await page.keyboard.press('Enter')
    await page.waitForSelector('canvas', { timeout: 10_000 })
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('invalid name (too short) shows error alert', async ({ page }) => {
    await page.fill('#name-input', 'A')
    await page.keyboard.press('Enter')
    // Filter to our error div specifically (Next.js route announcer also has role="alert")
    const errorAlert = page.locator('[role="alert"]').filter({ hasText: 'ERROR:' })
    await expect(errorAlert).toBeVisible({ timeout: 2_000 })
  })

  test('after error the prompt reappears', async ({ page }) => {
    await page.fill('#name-input', 'A')
    await page.keyboard.press('Enter')
    await expect(page.locator('#name-input')).toBeVisible({ timeout: 3_000 })
  })
})
