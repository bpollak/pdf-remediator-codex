import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Visual walkthrough of the deployed site. Saves full-page screenshots of each
// page and state (desktop, phone and 320 px) to test-results/walkthrough/ for
// a person to review, and fails on Content-Security-Policy violations or
// uncaught page errors.

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');
const SHOT_DIR = path.resolve(__dirname, '..', 'test-results', 'walkthrough');
const PROCESSING_TIMEOUT_MS = 240_000;
const DONE_BADGE = /^Done( – needs your review)?$/;

mkdirSync(SHOT_DIR, { recursive: true });

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to (load|execute|connect)/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function upload(page: Page, files: string[]) {
  await page.goto('/app');
  const input = page.locator('input[type="file"]:enabled');
  await input.waitFor({ state: 'attached' });
  await input.setInputFiles(files.map((file) => path.join(FIXTURE_DIR, file)));
}

test('health endpoint reports the deployed version', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  writeFileSync(path.join(SHOT_DIR, 'health.json'), JSON.stringify(body, null, 2));
  expect(body.ok).toBe(true);
});

for (const viewport of [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'phone', width: 390, height: 844 },
  { label: '320', width: 320, height: 700 }
]) {
  test(`static pages at ${viewport.label} width`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, name] of [
      ['/', 'home'],
      ['/about', 'about'],
      ['/app', 'upload']
    ] as const) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      // No sideways scrolling (WCAG 1.4.10 reflow).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} scrolls sideways at ${viewport.width}px`).toBeLessThanOrEqual(1);
      await shot(page, `${name}-${viewport.label}`);
    }
    expect(problems).toEqual([]);
  });
}

test('keyboard: the skip link is the first tab stop', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText(/skip to main content/i);
  await shot(page, 'skip-link-focused');
});

test('tagged PDF with an image: results and technical report', async ({ page }) => {
  const problems = watchConsole(page);
  await upload(page, ['with-image.pdf']);
  await expect(page.getByText(DONE_BADGE).first()).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  await shot(page, 'with-image-upload-done');
  await page.getByRole('link', { name: /view results/i }).click();
  await expect(page.getByRole('heading', { name: 'Is this PDF ready to publish?' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveTitle(/Finish your PDF: with-image\.pdf/);
  await shot(page, 'with-image-results');
  await page.getByRole('link', { name: /technical report/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/technical report/i, { timeout: 30_000 });
  await shot(page, 'with-image-technical-report');
  expect(problems).toEqual([]);
});

test('untagged PDF: honest verdict and checklist', async ({ page }) => {
  const problems = watchConsole(page);
  await upload(page, ['untagged.pdf']);
  await expect(page.getByText(DONE_BADGE).first()).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  await page.getByRole('link', { name: /view results/i }).click();
  await expect(page.getByRole('heading', { name: 'Is this PDF ready to publish?' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Not yet', { exact: true })).toBeVisible();
  await expect(page.getByText(/passed automated checks/i)).toHaveCount(0);
  await shot(page, 'untagged-results');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'untagged-results-phone');
  expect(problems).toEqual([]);
});

test('scanned PDF: OCR runs and the checklist reflects the result', async ({ page }) => {
  const problems = watchConsole(page);
  await upload(page, ['regression/scansmpl.pdf']);
  await expect(page.getByText(DONE_BADGE).first()).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  await shot(page, 'scanned-upload-done');
  await page.getByRole('link', { name: /view results/i }).click();
  await expect(page.getByRole('heading', { name: 'Is this PDF ready to publish?' })).toBeVisible({ timeout: 30_000 });
  await shot(page, 'scanned-results');
  writeFileSync(path.join(SHOT_DIR, 'scanned-results.txt'), await page.locator('main').innerText());
  expect(problems).toEqual([]);
});

test('batch of three files', async ({ page }) => {
  const problems = watchConsole(page);
  await upload(page, ['accessible.pdf', 'partial.pdf', 'untagged.pdf']);
  await expect(page.getByText(DONE_BADGE)).toHaveCount(3, { timeout: PROCESSING_TIMEOUT_MS * 2 });
  await shot(page, 'batch-done');
  expect(problems).toEqual([]);
});
