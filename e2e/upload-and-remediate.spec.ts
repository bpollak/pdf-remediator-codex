import { test, expect } from '@playwright/test';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');

test.describe('PDF upload and remediation workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('landing page loads with upload drop zone', async ({ page }) => {
    await expect(page).toHaveTitle(/accessible/i);
    // The drop zone should be visible.
    const dropZone = page.getByText(/drag.*drop|upload|choose/i).first();
    await expect(dropZone).toBeVisible();
  });

  test('upload a PDF and see it queued', async ({ page }) => {
    // Use the file input (hidden behind the drop zone UI).
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'accessible.pdf'));

    // The file should appear in the queue.
    await expect(page.getByText('accessible.pdf')).toBeVisible({ timeout: 10_000 });
  });

  test('upload triggers processing and reaches remediated state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'untagged.pdf'));

    // Wait for processing to complete (may take a while for PDF parsing + remediation).
    await expect(
      page.getByText(/remediated|completed|score/i).first()
    ).toBeVisible({ timeout: 120_000 });
  });

  test('download button appears after remediation', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'untagged.pdf'));

    // Wait for the download button to appear.
    const downloadBtn = page.getByRole('button', { name: /download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 120_000 });
    await expect(downloadBtn).toBeEnabled();
  });

  test('rejects non-PDF file uploads', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    // Create a temporary non-PDF file by uploading the README.
    const readmePath = path.resolve(__dirname, '..', 'README.md');
    await fileInput.setInputFiles(readmePath);

    // Should show an error or no file queued.
    await expect(page.getByText(/\.pdf/i)).toBeVisible({ timeout: 5_000 });
  });
});
