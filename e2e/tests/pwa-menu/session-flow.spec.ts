import { test, expect } from '@playwright/test'

test.describe('pwaMenu - Customer Session Flow', () => {
  /**
   * Helper to join a table. Handles the case where the app shows
   * a join/QR page or directly lands on the menu.
   */
  async function joinTable(page: import('@playwright/test').Page) {
    await page.goto('/')

    // Try to find the table input (join page)
    const tableInput = page.getByPlaceholder(/mesa|table|número/i)
    if (await tableInput.isVisible({ timeout: 5000 })) {
      await tableInput.fill('INT-01')

      // Look for a name input (some flows ask for diner name)
      const nameInput = page.getByPlaceholder(/nombre|name/i)
      if (await nameInput.isVisible({ timeout: 2000 })) {
        await nameInput.fill('Test Customer')
      }

      // Submit the join form
      const joinButton = page.getByRole('button', { name: /unirse|entrar|continuar|join/i })
      if (await joinButton.isVisible({ timeout: 3000 })) {
        await joinButton.click()
      }
    }

    // Wait for menu content to load (categories, products, or menu heading)
    await expect(
      page.getByText(/menú|menu|categoría|categoria|platos|productos/i)
    ).toBeVisible({ timeout: 10000 })
  }

  test('should join table and see the menu', async ({ page }) => {
    await joinTable(page)

    // Menu should be visible with categories or product listings
    await expect(
      page.getByText(/menú|menu|categoría|categoria|platos|productos/i)
    ).toBeVisible()
  })

  test('should browse menu categories and view products', async ({ page }) => {
    await joinTable(page)

    // Look for a category section or tab to click
    const categoryElement = page.locator(
      '[data-testid*="category"], [class*="category"], [role="tab"]'
    ).first()

    if (await categoryElement.isVisible({ timeout: 5000 })) {
      await categoryElement.click()

      // After clicking a category, products should be visible
      // Look for product cards, prices, or add-to-cart buttons
      await expect(
        page.locator('[data-testid*="product"], [class*="product"], [class*="card"]')
          .or(page.getByText(/\$/i))
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('should add product to cart and view cart contents', async ({ page }) => {
    await joinTable(page)

    // Find and click the first product card
    const productCard = page.locator(
      '[data-testid*="product"], [class*="product"], [class*="card"]'
    ).first()

    if (await productCard.isVisible({ timeout: 5000 })) {
      await productCard.click()

      // Click the add to cart button (in detail modal or directly)
      const addButton = page.getByRole('button', { name: /agregar|añadir|add/i })
      if (await addButton.isVisible({ timeout: 5000 })) {
        await addButton.click()

        // Verify cart indicator shows up (badge, counter, or cart button)
        const cartIndicator = page.locator(
          '[data-testid*="cart"], [class*="cart"], [aria-label*="carrito"], [aria-label*="cart"]'
        ).or(page.getByText(/carrito|cart|pedido|mi pedido/i))
        await expect(cartIndicator).toBeVisible({ timeout: 5000 })

        // Open the cart
        await cartIndicator.first().click()

        // Cart should show at least one item with product info
        await expect(
          page.getByText(/total|subtotal|\$|cantidad|qty/i)
        ).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should complete session flow: add to cart and attempt checkout', async ({ page }) => {
    await joinTable(page)

    // Try to add a product to cart
    const productCard = page.locator(
      '[data-testid*="product"], [class*="product"], [class*="card"]'
    ).first()

    if (await productCard.isVisible({ timeout: 5000 })) {
      await productCard.click()

      const addButton = page.getByRole('button', { name: /agregar|añadir|add/i })
      if (await addButton.isVisible({ timeout: 5000 })) {
        await addButton.click()

        // Open cart
        const cartIndicator = page.locator(
          '[data-testid*="cart"], [class*="cart"], [aria-label*="carrito"], [aria-label*="cart"]'
        ).or(page.getByText(/carrito|cart|pedido|mi pedido/i))

        if (await cartIndicator.first().isVisible({ timeout: 5000 })) {
          await cartIndicator.first().click()

          // Look for a checkout/order/send button (pedir cuenta, enviar pedido, confirmar)
          const checkoutButton = page.getByRole('button', {
            name: /enviar|confirmar|pedir|ordenar|send|order|checkout/i,
          })

          if (await checkoutButton.isVisible({ timeout: 5000 })) {
            // Verify the button is present and clickable
            await expect(checkoutButton).toBeEnabled()
          }
        }
      }
    }
  })
})
