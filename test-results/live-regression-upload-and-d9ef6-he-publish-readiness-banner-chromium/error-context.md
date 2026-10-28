# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: live-regression.spec.ts >> upload and remediation workflow >> processes a PDF end-to-end and shows the publish-readiness banner
- Location: e2e-live/live-regression.spec.ts:47:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/is this pdf ready to publish\?/i)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/is this pdf ready to publish\?/i)

```

```yaml
- banner:
  - region "Site name":
    - link "PDF Remediator home":
      - /url: /
      - text: PDF Remediator
    - link "Visit UC San Diego website":
      - /url: https://www.ucsd.edu
      - text: UC San Diego
  - navigation "Primary":
    - list:
      - listitem:
        - link "Home":
          - /url: /
      - listitem:
        - link "App":
          - /url: /app
      - listitem:
        - link "About":
          - /url: /about
- main:
  - heading "Finish your PDF" [level=1]
  - paragraph: untagged.pdf
  - paragraph: Readiness
  - paragraph: Not ready yet
  - paragraph: The automated pass is complete, but this PDF still needs the checklist below before it can be published.
  - list:
    - listitem: Manual structure tagging is still required
    - listitem: External PDF/UA verification unavailable
  - paragraph:
    - text: Analysis-only result
    - 'button "Help: analysis-only result"': "?"
    - text: ": this file was checked but could not be fully auto-fixed. Add document tags manually in Adobe Acrobat or the free"
    - link "PAC tool":
      - /url: https://pac.pdf-accessibility.org/
    - text: before publishing.
  - group: Show automated check details
  - paragraph: Next step
  - heading "Finish the manual checklist" [level=2]
  - paragraph: Work through the checklist below. When it is complete, download the best available PDF and upload your revised file for a final check.
  - link "Go to checklist":
    - /url: "#manual-checklist"
  - button "Download updated PDF"
  - link "Upload revised PDF":
    - /url: /app?revalidateFor=86d571c7-885f-4e2a-803f-6d83e920796e#upload-revised-pdf
  - paragraph: Manual checklist progress
  - paragraph: 0%
  - progressbar "Manual edit completion"
  - paragraph: 1 checklist item left
  - heading "Manual checklist" [level=2]
  - paragraph: Complete each item that applies to this PDF. The progress meter updates as you save descriptions, confirm tables, or mark manual tasks done.
  - paragraph: "How to finish:"
  - list:
    - listitem: Save any image descriptions, or mark decorative images so screen readers can skip them.
    - listitem: If a document structure or table item appears, apply that fix in Acrobat, PAC, or the source file.
    - listitem: Download the best available PDF, make any desktop edits, then upload the revised PDF for validation.
  - heading "Document structure" [level=3]
  - article:
    - checkbox "Fix document structure in Acrobat or PAC Add or repair the hidden tags that screen readers use, including heading order, reading order, and table structure. Check this only after you have made those edits in the PDF or source file. Required before publishing"
    - text: Fix document structure in Acrobat or PAC Add or repair the hidden tags that screen readers use, including heading order, reading order, and table structure. Check this only after you have made those edits in the PDF or source file. Required before publishing
  - heading "Other manual tasks" [level=3]
  - paragraph: No extra manual tasks have been added.
  - button "Add another task"
  - heading "Validate the final PDF" [level=2]
  - paragraph: After you apply the manual edits, upload the revised PDF to check it again.
  - link "Upload revised PDF":
    - /url: /app?revalidateFor=86d571c7-885f-4e2a-803f-6d83e920796e#upload-revised-pdf
- contentinfo:
  - paragraph: UC San Diego 9500 Gilman Dr. La Jolla, CA 92093 (858) 534-2230 Copyright © 2026 Regents of the University of California. All rights reserved.
  - list:
    - listitem:
      - link "Accessibility":
        - /url: https://accessibility.ucsd.edu/
    - listitem:
      - link "Privacy":
        - /url: https://ucsd.edu/about/privacy.html
    - listitem:
      - link "Terms of Use":
        - /url: https://ucsd.edu/about/terms-of-use.html
    - listitem:
      - link "Feedback":
        - /url: mailto:brand@ucsd.edu
  - link "UCSD homepage":
    - /url: https://ucsd.edu/
    - img "UCSD homepage"
- alert
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import path from 'node:path';
  3   | 
  4   | const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');
  5   | const PROCESSING_TIMEOUT_MS = 180_000;
  6   | 
  7   | async function uploadFixture(page: Page, fileName: string) {
  8   |   await page.goto('/app');
  9   |   // The input stays disabled until saved files are restored from the browser.
  10  |   const fileInput = page.locator('input[type="file"]:enabled');
  11  |   await fileInput.waitFor({ state: 'attached' });
  12  |   await fileInput.setInputFiles(path.join(FIXTURE_DIR, fileName));
  13  | }
  14  | 
  15  | test.describe('landing page', () => {
  16  |   test('loads with corrected copy and quick-start link', async ({ page }) => {
  17  |     await page.goto('/');
  18  |     await expect(page).toHaveTitle(/PDF Remediator/i);
  19  |     await expect(page.getByRole('heading', { name: /make your pdf more accessible/i })).toBeVisible();
  20  | 
  21  |     // New: quick-start link added by the UX PR.
  22  |     await expect(page.getByRole('link', { name: /2-minute quick start/i })).toBeVisible();
  23  | 
  24  |     // New: privacy claim corrected; old absolute claim must be gone.
  25  |     await expect(page.getByText(/files are only sent to configured ocr or/i)).toBeVisible();
  26  |     await expect(page.getByText(/nothing is uploaded to a server/i)).toHaveCount(0);
  27  | 
  28  |     // CTA navigates to the upload page.
  29  |     await page.getByRole('link', { name: /start accessibility check/i }).click();
  30  |     await expect(page).toHaveURL(/\/app$/);
  31  |     await expect(page.getByText(/drop pdfs here or browse/i)).toBeVisible();
  32  |   });
  33  | });
  34  | 
  35  | test.describe('upload validation', () => {
  36  |   test('rejects a non-PDF file with a clear message', async ({ page }) => {
  37  |     await uploadFixture(page, '..' + path.sep + 'README.md');
  38  |     // Next.js adds its own role="alert" route announcer, so filter to the validation alert.
  39  |     await expect(page.getByRole('alert').filter({ hasText: 'README.md' })).toContainText(
  40  |       /file extension must be \.pdf/i,
  41  |       { timeout: 10_000 }
  42  |     );
  43  |   });
  44  | });
  45  | 
  46  | test.describe('upload and remediation workflow', () => {
  47  |   test('processes a PDF end-to-end and shows the publish-readiness banner', async ({ page }) => {
  48  |     await uploadFixture(page, 'untagged.pdf');
  49  | 
  50  |     // File card appears in the queue.
  51  |     await expect(page.getByText('untagged.pdf')).toBeVisible({ timeout: 10_000 });
  52  | 
  53  |     // New: keep-tab-open notice and duration hint while processing.
  54  |     await expect.soft(page.getByText(/files are processed in this browser tab/i)).toBeVisible({ timeout: 15_000 });
  55  |     await expect
  56  |       .soft(page.getByText(/usually takes a few seconds|still working/i).first())
  57  |       .toBeVisible({ timeout: 30_000 });
  58  | 
  59  |     // Processing completes.
  60  |     await expect(page.getByText('Ready: review results')).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  61  | 
  62  |     // Results page shows the new publish-readiness banner.
  63  |     await page.getByRole('link', { name: /view results/i }).click();
  64  |     await expect(page.getByRole('heading', { name: /finish your pdf/i })).toBeVisible({ timeout: 20_000 });
> 65  |     await expect(page.getByText(/is this pdf ready to publish\?/i)).toBeVisible();
      |                                                                     ^ Error: expect(locator).toBeVisible() failed
  66  |     await expect(
  67  |       page.getByText(/^(Accessible|Not yet accessible|Verification unavailable|Processing)$/).first()
  68  |     ).toBeVisible();
  69  | 
  70  |     // Download action is available, with the worksheet disclaimer.
  71  |     await expect(page.getByRole('button', { name: /download updated pdf/i })).toBeEnabled();
  72  |     await expect(page.getByText(/not.*added to the downloaded pdf/i).first()).toBeVisible();
  73  |   });
  74  | 
  75  |   test('saved image description can be embedded into the downloaded PDF', async ({ page }) => {
  76  |     await uploadFixture(page, 'with-image.pdf');
  77  |     await expect(page.getByText('with-image.pdf')).toBeVisible({ timeout: 10_000 });
  78  |     await expect(page.getByText('Ready: review results')).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  79  | 
  80  |     await page.getByRole('link', { name: /view results/i }).click();
  81  |     await expect(page.getByRole('heading', { name: /image descriptions/i })).toBeVisible({ timeout: 20_000 });
  82  | 
  83  |     await page.getByPlaceholder(/write the image description/i).fill('Bar chart of recycling volume by month.');
  84  |     const embedButton = page.getByRole('button', { name: /download pdf with my description/i });
  85  |     await expect(embedButton).toBeVisible();
  86  | 
  87  |     const downloadPromise = page.waitForEvent('download');
  88  |     await embedButton.click();
  89  |     const download = await downloadPromise;
  90  |     expect(download.suggestedFilename()).toMatch(/^remediated-/);
  91  |     await expect(page.getByText(/embedded 1 description into the downloaded pdf/i)).toBeVisible({ timeout: 30_000 });
  92  |   });
  93  | 
  94  |   test('already-accessible PDF still completes and offers download', async ({ page }) => {
  95  |     await uploadFixture(page, 'accessible.pdf');
  96  |     await expect(page.getByText('accessible.pdf')).toBeVisible({ timeout: 10_000 });
  97  |     await expect(page.getByText('Ready: review results')).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  98  | 
  99  |     await page.getByRole('link', { name: /view results/i }).click();
  100 |     await expect(page.getByText(/is this pdf ready to publish\?/i)).toBeVisible({ timeout: 20_000 });
  101 |     await expect(page.getByRole('button', { name: /download updated pdf/i })).toBeEnabled();
  102 |   });
  103 | });
  104 | 
  105 | test.describe('about page', () => {
  106 |   test('quick start and privacy sections are present', async ({ page }) => {
  107 |     await page.goto('/about');
  108 |     await expect(page.getByRole('heading', { name: /2-minute quick start/i })).toBeVisible();
  109 |     await expect(page.getByRole('heading', { name: /privacy/i })).toBeVisible();
  110 |   });
  111 | });
  112 | 
```