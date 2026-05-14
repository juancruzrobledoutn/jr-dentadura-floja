import { test, expect } from '@playwright/test'

test.describe('pwaWaiter - Table Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    // Step 1: Select a branch (pre-login flow)
    await expect(
      page.getByText(/sucursal|branch|seleccion/i)
    ).toBeVisible({ timeout: 10000 })

    // Click on the first available branch
    const branchOption = page.locator('[data-testid*="branch"], [class*="branch"], button, [role="option"]')
      .filter({ hasText: /sucursal|branch|sede|local/i })
      .first()
    if (await branchOption.isVisible({ timeout: 5000 })) {
      await branchOption.click()
    }

    // Step 2: Login as waiter
    const emailInput = page.getByLabel(/email/i)
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill('waiter@demo.com')
      await page.getByLabel(/contraseña|password/i).fill('waiter123')
      await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()
    }
  })

  test('should display table grid after login', async ({ page }) => {
    // After login, the waiter should see a table grid or list
    await expect(
      page.getByText(/mesas|tables|mesa/i)
        .or(page.locator('[data-testid*="table"], [class*="table-grid"], [class*="tableGrid"]'))
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show tables with status indicators', async ({ page }) => {
    // Wait for the table view to load
    await page.waitForTimeout(2000)

    // Tables should have status colors or labels
    const tableCards = page.locator('[data-testid*="table"], [class*="table-card"], [class*="tableCard"]')
    const statusIndicators = page.getByText(/libre|ocupada|disponible|free|occupied/i)

    // At least one of these should be visible if the app loaded successfully
    const hasTableCards = await tableCards.first().isVisible({ timeout: 5000 }).catch(() => false)
    const hasStatusText = await statusIndicators.first().isVisible({ timeout: 5000 }).catch(() => false)

    // The page should show some table-related content
    expect(hasTableCards || hasStatusText).toBeTruthy()
  })
})
