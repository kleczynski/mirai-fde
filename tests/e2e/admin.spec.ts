import { expect, test } from '@playwright/test';

test('administrator without a session is shown the protected sign in screen', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Wejście administratora.' })).toBeVisible();
  await expect(page.getByLabel('Adres e-mail')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wyślij link logowania' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Wróć do rozmowy' })).toHaveAttribute('href', '/');
});
