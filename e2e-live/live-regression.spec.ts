import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');
const PROCESSING_TIMEOUT_MS = 180_000;

async function uploadFixture(page: Page, fileName: string) {
  await page.goto('/app');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(FIXTURE_DIR, fileName));
}

test.describe('landing page', () => {
  test('loads with corrected copy and quick-start link', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PDF Remediator/i);
    await expect(page.getByRole('heading', { name: /make your pdf more accessible/i })).toBeVisible();

    // New: quick-start link added by the UX PR.
    await expect(page.getByRole('link', { name: /2-minute quick start/i })).toBeVisible();

    // New: privacy claim corrected; old absolute claim must be gone.
    await expect(page.getByText(/files are only sent to configured ocr or/i)).toBeVisible();
    await expect(page.getByText(/nothing is uploaded to a server/i)).toHaveCount(0);

    // CTA navigates to the upload page.
    await page.getByRole('link', { name: /start accessibility check/i }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(/drop pdfs here or browse/i)).toBeVisible();
  });
});

test.describe('upload validation', () => {
  test('rejects a non-PDF file with a clear message', async ({ page }) => {
    await uploadFixture(page, '..' + path.sep + 'README.md');
    // Next.js adds its own role="alert" route announcer, so filter to the validation alert.
    await expect(page.getByRole('alert').filter({ hasText: 'README.md' })).toContainText(
      /file extension must be \.pdf/i,
      { timeout: 10_000 }
    );
  });
});

test.describe('upload and remediation workflow', () => {
  test('processes a PDF end-to-end and shows the publish-readiness banner', async ({ page }) => {
    await uploadFixture(page, 'untagged.pdf');

    // File card appears in the queue.
    await expect(page.getByText('untagged.pdf')).toBeVisible({ timeout: 10_000 });

    // New: keep-tab-open notice and duration hint while processing.
    await expect.soft(page.getByText(/files are processed in this browser tab/i)).toBeVisible({ timeout: 15_000 });
    await expect
      .soft(page.getByText(/usually takes a few seconds|still working/i).first())
      .toBeVisible({ timeout: 30_000 });

    // Processing completes.
    await expect(page.getByText('Ready: review results')).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });

    // Results page shows the new publish-readiness banner.
    await page.getByRole('link', { name: /view results/i }).click();
    await expect(page.getByRole('heading', { name: /finish your pdf/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/is this pdf ready to publish\?/i)).toBeVisible();
    await expect(
      page.getByText(/^(Accessible|Not yet accessible|Verification unavailable|Processing)$/).first()
    ).toBeVisible();

    // Download action is available, with the worksheet disclaimer.
    await expect(page.getByRole('button', { name: /download updated pdf/i })).toBeEnabled();
    await expect(page.getByText(/not.*added to the downloaded pdf/i).first()).toBeVisible();
  });

  test('already-accessible PDF still completes and offers download', async ({ page }) => {
    await uploadFixture(page, 'accessible.pdf');
    await expect(page.getByText('accessible.pdf')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ready: review results')).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });

    await page.getByRole('link', { name: /view results/i }).click();
    await expect(page.getByText(/is this pdf ready to publish\?/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /download updated pdf/i })).toBeEnabled();
  });
});

test.describe('about page', () => {
  test('quick start and privacy sections are present', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: /2-minute quick start/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /privacy/i })).toBeVisible();
  });
});
