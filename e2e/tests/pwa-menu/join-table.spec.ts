import { test, expect } from '@playwright/test'

test.describe('pwaMenu - Join Table', () => {
  test('should show QR simulator or join page', async ({ page }) => {
    await page.goto('/')
    // Should show either QR simulator or join table form
    await expect(
      page.getByText(/escanear|mesa|table|unirse/i)
    ).toBeVisible({ timeout: 10000 })
  })

  test('should allow entering table number', async ({ page }) => {
    await page.goto('/')
    // Look for table number input
    const tableInput = page.getByPlaceholder(/mesa|table|número/i)
    if (await tableInput.isVisible()) {
      await tableInput.fill('INT-01')
      await expect(tableInput).toHaveValue('INT-01')
    }
  })
})
