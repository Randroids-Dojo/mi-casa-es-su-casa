import { Page } from '@playwright/test'

export async function waitForNamePrompt(page: Page): Promise<void> {
  await page.waitForSelector('#name-input', { timeout: 15_000 })
}

export async function gotoBootAndWaitForPrompt(page: Page): Promise<void> {
  await page.goto('/')
  await waitForNamePrompt(page)
}

export async function gotoCharacterPageDirect(
  page: Page,
  characterName = 'playwright',
): Promise<void> {
  await page.goto(`/${characterName}?__test_seed=42`)
  await page.waitForSelector('canvas', { timeout: 10_000 })
}
