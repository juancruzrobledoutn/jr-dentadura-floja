import { test, expect } from '@playwright/test'

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@demo.com')
    await page.getByLabel(/contraseña|password/i).fill('admin123')
    await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()
    await expect(page).toHaveURL('/', { timeout: 10000 })
  })

  test('should render sidebar with navigation links after login', async ({ page }) => {
    // Sidebar should be visible with the brand name
    await expect(page.getByText('Buen Sabor')).toBeVisible()

    // Core navigation items should be present
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByText('Restaurante')).toBeVisible()

    // Collapsible groups should be present
    await expect(page.getByRole('button', { name: /expandir gestion|contraer gestion/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /expandir cocina|contraer cocina/i })).toBeVisible()

    // Bottom navigation
    await expect(page.getByRole('link', { name: /configuracion/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cerrar sesión/i })).toBeVisible()
  })

  test('should navigate to Restaurant page', async ({ page }) => {
    await page.getByRole('link', { name: /restaurante/i }).click()
    await expect(page).toHaveURL('/restaurant', { timeout: 5000 })
  })

  test('should expand Gestion group and navigate to Categories', async ({ page }) => {
    // First, expand the Gestion group
    const gestionButton = page.getByRole('button', { name: /expandir gestion|contraer gestion/i })
    await gestionButton.click()

    // Then expand Productos subgroup
    const productosButton = page.getByRole('button', { name: /expandir productos|contraer productos/i })
    await expect(productosButton).toBeVisible({ timeout: 3000 })
    await productosButton.click()

    // Navigate to Categorias
    const categoriasLink = page.getByRole('link', { name: /categorias/i })
    await expect(categoriasLink).toBeVisible({ timeout: 3000 })
    await categoriasLink.click()

    await expect(page).toHaveURL('/categories', { timeout: 5000 })
  })

  test('should toggle light/dark mode', async ({ page }) => {
    // Find the theme toggle button
    const themeButton = page.getByRole('button', { name: /modo claro|modo oscuro/i })
    await expect(themeButton).toBeVisible()

    // Get initial text
    const initialText = await themeButton.textContent()

    // Click to toggle
    await themeButton.click()

    // Text should change (Modo Claro <-> Modo Oscuro)
    const newText = await themeButton.textContent()
    expect(newText).not.toBe(initialText)
  })
})
