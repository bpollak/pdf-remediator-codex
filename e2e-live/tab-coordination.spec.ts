import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = (name: string) => path.resolve(__dirname, '..', 'fixtures', name);
const done = /^Done( – needs your review)?$/;
async function ready(page: Page) {
  await page.goto('/app');
  await expect(page.locator('input[type=file]')).toBeEnabled();
}

for (const destination of ['/', '/about']) {
  test(`an idle leader on ${destination} processes uploads from another tab`, async ({ context, page }) => {
    let requests = 0;
    await context.route('**/api/verapdf', (route) => {
      if (route.request().method() === 'POST') requests++;
      return route.fulfill({ json: { attempted: false, reason: 'No external verifier in this queue test.' } });
    });
    await ready(page);
    await page.waitForFunction(async () => (await navigator.locks.query()).held?.some((lock) => lock.name === 'accessible-pdf-queue'));
    // Client navigation keeps the JS context and its Web Lock alive.
    await page.locator(`a[href="${destination}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(destination === '/' ? '/$' : '/about$'));
    const uploadTab = await context.newPage();
    await ready(uploadTab);
    await uploadTab.locator('input[type=file]').setInputFiles(fixture('untagged.pdf'));
    await expect(uploadTab.getByText(done)).toBeVisible({ timeout: 30_000 });
    expect(page.isClosed()).toBe(false);
    expect(requests).toBe(1);
  });
}

test('tab closure transfers ownership and simultaneous uploads are processed once', async ({ context, page }) => {
  let requests = 0;
  await context.route('**/api/verapdf', (route) => {
    if (route.request().method() === 'POST') requests++;
    return route.fulfill({ json: { attempted: false, reason: 'No external verifier in this queue test.' } });
  });
  await ready(page);
  await page.waitForFunction(async () => (await navigator.locks.query()).held?.some((lock) => lock.name === 'accessible-pdf-queue'));
  const next = await context.newPage();
  await ready(next);
  await Promise.all([
    page.locator('input[type=file]').setInputFiles(fixture('untagged.pdf')),
    next.locator('input[type=file]').setInputFiles(fixture('partial.pdf'))
  ]);
  await expect(next.getByText(done)).toHaveCount(2, { timeout: 30_000 });
  expect(requests).toBe(2);
  await page.close();
  await next.locator('input[type=file]').setInputFiles(fixture('accessible.pdf'));
  await expect(next.getByText(done)).toHaveCount(3, { timeout: 30_000 });
  expect(requests).toBe(3);
});
