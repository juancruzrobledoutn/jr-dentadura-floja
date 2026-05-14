import { test, expect } from '@playwright/test'

test.describe('pwaWaiter - Branch Selection', () => {
  test('should show branch selection before login', async ({ page }) => {
    await page.goto('/')
    // Pre-login: should show branch selection
    await expect(
      page.getByText(/sucursal|branch|seleccion/i)
    ).toBeVisible({ timeout: 10000 })
  })
})
