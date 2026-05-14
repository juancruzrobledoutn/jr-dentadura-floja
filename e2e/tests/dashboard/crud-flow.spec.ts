import { test, expect } from '@playwright/test'

test.describe('Dashboard CRUD Flow - Categories', () => {
  const uniqueSuffix = Date.now().toString(36)
  const categoryName = `Test Cat ${uniqueSuffix}`
  const categoryNameEdited = `Edited Cat ${uniqueSuffix}`

  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@demo.com')
    await page.getByLabel(/contraseña|password/i).fill('admin123')
    await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()
    await expect(page).toHaveURL('/', { timeout: 10000 })
  })

  test('should complete full CRUD lifecycle for a category', async ({ page }) => {
    // --- Navigate to Categories page ---
    // Expand Gestion group
    const gestionButton = page.getByRole('button', { name: /expandir gestion|contraer gestion/i })
    await gestionButton.click()

    // Expand Productos subgroup
    const productosButton = page.getByRole('button', { name: /expandir productos|contraer productos/i })
    await expect(productosButton).toBeVisible({ timeout: 3000 })
    await productosButton.click()

    // Click Categorias link
    const categoriasLink = page.getByRole('link', { name: /categorias/i })
    await expect(categoriasLink).toBeVisible({ timeout: 3000 })
    await categoriasLink.click()
    await expect(page).toHaveURL('/categories', { timeout: 5000 })

    // --- CREATE: Add new category ---
    const addButton = page.getByRole('button', { name: /agregar|nueva|crear|añadir|add/i })
    await expect(addButton).toBeVisible({ timeout: 5000 })
    await addButton.click()

    // Fill in the modal form
    const nameInput = page.getByLabel(/nombre|name/i)
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill(categoryName)

    // Submit the form
    const submitButton = page.getByRole('button', { name: /guardar|crear|save|submit/i })
    await submitButton.click()

    // Verify the category appears in the list
    await expect(page.getByText(categoryName)).toBeVisible({ timeout: 10000 })

    // --- UPDATE: Edit the category ---
    // Find the row with our category and click edit
    const categoryRow = page.getByText(categoryName).locator('..')
    const editButton = categoryRow.getByRole('button', { name: /editar|edit/i })
      .or(categoryRow.locator('[aria-label*="editar"], [aria-label*="edit"], [title*="editar"], [title*="edit"]'))
    await editButton.first().click()

    // Modify the name in the edit modal
    const editNameInput = page.getByLabel(/nombre|name/i)
    await expect(editNameInput).toBeVisible({ timeout: 5000 })
    await editNameInput.clear()
    await editNameInput.fill(categoryNameEdited)

    // Save changes
    const saveButton = page.getByRole('button', { name: /guardar|actualizar|save|update/i })
    await saveButton.click()

    // Verify the edited name appears
    await expect(page.getByText(categoryNameEdited)).toBeVisible({ timeout: 10000 })
    // Original name should no longer be visible
    await expect(page.getByText(categoryName)).not.toBeVisible({ timeout: 3000 })

    // --- DELETE: Remove the category ---
    const editedRow = page.getByText(categoryNameEdited).locator('..')
    const deleteButton = editedRow.getByRole('button', { name: /eliminar|borrar|delete/i })
      .or(editedRow.locator('[aria-label*="eliminar"], [aria-label*="delete"], [title*="eliminar"], [title*="delete"]'))
    await deleteButton.first().click()

    // Confirm deletion in the dialog
    const confirmButton = page.getByRole('button', { name: /confirmar|eliminar|sí|si|yes|delete/i })
    await expect(confirmButton).toBeVisible({ timeout: 5000 })
    await confirmButton.click()

    // Verify the category is removed from the list
    await expect(page.getByText(categoryNameEdited)).not.toBeVisible({ timeout: 10000 })
  })

  test('should show validation when creating category with empty name', async ({ page }) => {
    // Navigate to Categories
    const gestionButton = page.getByRole('button', { name: /expandir gestion|contraer gestion/i })
    await gestionButton.click()
    const productosButton = page.getByRole('button', { name: /expandir productos|contraer productos/i })
    await expect(productosButton).toBeVisible({ timeout: 3000 })
    await productosButton.click()
    await page.getByRole('link', { name: /categorias/i }).click()
    await expect(page).toHaveURL('/categories', { timeout: 5000 })

    // Open create modal
    const addButton = page.getByRole('button', { name: /agregar|nueva|crear|añadir|add/i })
    await expect(addButton).toBeVisible({ timeout: 5000 })
    await addButton.click()

    // Try to submit without filling name
    const submitButton = page.getByRole('button', { name: /guardar|crear|save|submit/i })
    await expect(submitButton).toBeVisible({ timeout: 5000 })
    await submitButton.click()

    // Should show validation error or remain on the modal (form not submitted)
    // Either a validation message appears, or the modal stays open
    const modalStillOpen = page.getByLabel(/nombre|name/i)
    const validationError = page.getByText(/requerido|obligatorio|required|vacío|empty/i)
    await expect(modalStillOpen.or(validationError)).toBeVisible({ timeout: 5000 })
  })
})
