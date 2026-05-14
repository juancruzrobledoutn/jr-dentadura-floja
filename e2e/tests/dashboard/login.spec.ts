import { test, expect } from '@playwright/test'

test.describe('Dashboard Login', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading')).toContainText(/iniciar sesión|login/i)
  })

  test('should login with admin credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@demo.com')
    await page.getByLabel(/contraseña|password/i).fill('admin123')
    await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()

    // Should redirect to dashboard
    await expect(page).toHaveURL('/', { timeout: 10000 })
  })

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('wrong@email.com')
    await page.getByLabel(/contraseña|password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()

    // Should show error
    await expect(page.getByText(/error|credenciales|inválid/i)).toBeVisible({ timeout: 5000 })
  })
})
