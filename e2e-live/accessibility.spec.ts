import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');
const PROCESSING_TIMEOUT_MS = 180_000;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}

test.describe('the app itself meets WCAG 2.1 AA (automated checks)', () => {
  for (const route of ['/', '/about', '/app']) {
    test(`no axe violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }

  test('no axe violations on the results page and technical report', async ({ page }) => {
    await page.goto('/app');
    const fileInput = page.locator('input[type="file"]:enabled');
    await fileInput.waitFor({ state: 'attached' });
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'with-image.pdf'));
    await expect(page.getByText(/^Done( – needs your review)?$/).first()).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: /view results/i }).click();
    await expect(page.getByRole('heading', { name: 'Is this PDF ready to publish?' })).toBeVisible({ timeout: 20_000 });
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: /technical report/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/technical report/i, { timeout: 20_000 });
    await expectNoAxeViolations(page);
  });
});
