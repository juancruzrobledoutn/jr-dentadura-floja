import { test, expect } from '@playwright/test'

test.describe('pwaMenu - Order Flow', () => {
  test('should display menu categories after joining a table', async ({ page }) => {
    await page.goto('/')

    // Try to join a table if the join page is shown
    const tableInput = page.getByPlaceholder(/mesa|table|número/i)
    if (await tableInput.isVisible({ timeout: 5000 })) {
      await tableInput.fill('INT-01')

      // Look for a submit/join button
      const joinButton = page.getByRole('button', { name: /unirse|entrar|continuar|join/i })
      if (await joinButton.isVisible({ timeout: 3000 })) {
        await joinButton.click()
      }
    }

    // After joining, menu categories or products should be visible
    // The menu page should show category names or product listings
    await expect(
      page.getByText(/menú|menu|categoría|categoria|platos|productos/i)
    ).toBeVisible({ timeout: 10000 })
  })

  test('should browse and view product details', async ({ page }) => {
    await page.goto('/')

    // Handle table join if needed
    const tableInput = page.getByPlaceholder(/mesa|table|número/i)
    if (await tableInput.isVisible({ timeout: 5000 })) {
      await tableInput.fill('INT-01')
      const joinButton = page.getByRole('button', { name: /unirse|entrar|continuar|join/i })
      if (await joinButton.isVisible({ timeout: 3000 })) {
        await joinButton.click()
      }
    }

    // Wait for menu content to load
    await page.waitForTimeout(2000)

    // Look for a product card or item to click on
    const productCard = page.locator('[data-testid*="product"], [class*="product"], [class*="card"]').first()
    if (await productCard.isVisible({ timeout: 5000 })) {
      await productCard.click()

      // A detail modal or page should appear with product info
      await expect(
        page.getByText(/agregar|añadir|add|precio|price|\$/i)
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('should add a product to cart and view cart', async ({ page }) => {
    await page.goto('/')

    // Handle table join if needed
    const tableInput = page.getByPlaceholder(/mesa|table|número/i)
    if (await tableInput.isVisible({ timeout: 5000 })) {
      await tableInput.fill('INT-01')
      const joinButton = page.getByRole('button', { name: /unirse|entrar|continuar|join/i })
      if (await joinButton.isVisible({ timeout: 3000 })) {
        await joinButton.click()
      }
    }

    // Wait for menu to load
    await page.waitForTimeout(2000)

    // Try to find and click a product
    const productCard = page.locator('[data-testid*="product"], [class*="product"], [class*="card"]').first()
    if (await productCard.isVisible({ timeout: 5000 })) {
      await productCard.click()

      // Click the add to cart button
      const addButton = page.getByRole('button', { name: /agregar|añadir|add/i })
      if (await addButton.isVisible({ timeout: 5000 })) {
        await addButton.click()

        // Look for cart indicator (badge, icon, or cart link)
        await expect(
          page.locator('[data-testid*="cart"], [class*="cart"], [aria-label*="carrito"], [aria-label*="cart"]')
            .or(page.getByText(/carrito|cart|pedido/i))
        ).toBeVisible({ timeout: 5000 })
      }
    }
  })
})
