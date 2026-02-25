import { test, expect } from '@playwright/test'
import { gotoCharacterPageDirect } from './fixtures/pages'

test.describe('Game view', () => {
  test('canvas is present with non-zero dimensions', async ({ page }) => {
    await gotoCharacterPageDirect(page, 'playwright')
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('canvas renders non-background pixels (house visible)', async ({ page }) => {
    await gotoCharacterPageDirect(page, 'playwright')
    // Allow Three.js time to render
    await page.waitForTimeout(3_000)

    const canvas = page.locator('canvas')
    const screenshotBuffer = await canvas.screenshot()

    // A solid-color canvas (nothing rendered) compresses to ~2-5 KB PNG.
    // A rendered 3D dollhouse will be significantly larger due to color variety.
    // Threshold is 15 KB to accommodate SwiftShader variance across platforms.
    const sizeKB = screenshotBuffer.length / 1024
    expect(sizeKB).toBeGreaterThan(15)
  })

  test('thought bubble appears within 40 seconds', async ({ page }) => {
    test.setTimeout(60_000)
    await gotoCharacterPageDirect(page, 'playwright')

    // ThoughtBubble renders text when visible; aria-live makes it accessible
    const bubble = page.locator('[aria-live="polite"]')
    await expect(bubble).not.toBeEmpty({ timeout: 40_000 })
  })

  test('thought bubble is within the viewport bounds', async ({ page }) => {
    test.setTimeout(60_000)
    await gotoCharacterPageDirect(page, 'playwright')

    const bubble = page.locator('[aria-live="polite"]')
    await expect(bubble).not.toBeEmpty({ timeout: 40_000 })

    const viewportSize = page.viewportSize()!
    const bubbleBox = await bubble.boundingBox()
    expect(bubbleBox).not.toBeNull()

    // Bubble must be within the page viewport
    expect(bubbleBox!.x).toBeGreaterThanOrEqual(0)
    expect(bubbleBox!.y).toBeGreaterThanOrEqual(0)
    expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(viewportSize.width + 10)
    expect(bubbleBox!.y + bubbleBox!.height).toBeLessThanOrEqual(viewportSize.height + 10)
  })

  test('game view matches visual snapshot', async ({ page }) => {
    await gotoCharacterPageDirect(page, 'playwright')
    // Wait 2 s — the initial activity lasts 3 s, so the character is still
    // performing (not yet navigating) and the WebGL scene is stable for the
    // screenshot comparison.
    await page.waitForTimeout(2_000)

    // Freeze animations and hide thought bubble for stable snapshot
    await page.addStyleTag({
      content: `
        * { animation: none !important; transition: none !important; }
        [aria-live] { opacity: 0 !important; }
      `,
    })

    const canvasBox = await page.locator('canvas').boundingBox()
    // Use page.screenshot() + toMatchSnapshot() instead of toHaveScreenshot()
    // because toHaveScreenshot() has a stability check that waits for identical
    // consecutive frames — Three.js requestAnimationFrame always produces
    // slightly different pixels, so the stability check times out on CI.
    const screenshot = await page.screenshot({ clip: canvasBox ?? undefined })
    expect(screenshot).toMatchSnapshot('game-view-house.png', {
      maxDiffPixelRatio: 0.15,
    })
  })
})
