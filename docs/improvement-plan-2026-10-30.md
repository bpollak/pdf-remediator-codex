# PDF Remediator improvement plan

October 30, 2026. Status: in progress.

Scope correction: Brett removed SSO from this goal on October 30. No sign-in, identity registration, or authenticated-user gate is required. This correction supersedes SSO and per-user identity wording in the original goal; usage controls below use shared app-level and per-IP accounting.

Complete the October 30 review improvements: preserve existing PDF structure during OCR, prevent silent text loss, fix queue ownership across browser tabs, deliver the current release reliably, and establish the access and release controls needed for campus use.

## Baseline and scope

The reviewed GitHub baseline is `cede2ed`. An isolated install passed 463 unit and integration tests, 19 browser checks, and the production build. The browser checks included automated accessibility scans and desktop, phone, and 320 px layouts. Targeted reproductions exposed the three defects below despite those passing checks.

Production still showed the October 27 release during the review. Its `/api/health` returned 404, and the latest post-deploy workflow failed waiting for the reviewed commit. The workflow reported missing Vercel deployment secrets. GitHub reported no branch protection or repository rulesets.

Work starts from current GitHub main on `codex/review-improvements-2026-10-30`. Preserve unrelated files and existing review artifacts. Use focused commits and pull requests, and update `lib/content/release-notes.ts` before pushing app enhancements. Do not describe planned changes as already deployed.

## Phase 1 Preserve PDF structure and complete OCR text

1. Add regressions for a tagged scan containing an existing heading and other structure before changing the builder.
2. Preserve the existing StructTreeRoot, ParentTree, marked-content bindings, role mappings, and image descriptions when adding OCR. Merge new bindings with collision-free identifiers. If a source cannot be extended safely, leave its structure intact and report the limitation instead of replacing it.
3. Prove that original tagged text remains tagged and that newly added OCR text is bound correctly. Cover existing headings, Figure descriptions, annotations, multiple pages, and repeated remediation passes.
4. Remove silent truncation at 120 lines and 240 characters per line in the OCR route. Retain complete extracted text within explicit resource limits; if a limit or model token cutoff prevents completion, return an explicit incomplete result.
5. Propagate incomplete extraction, empty page results, and page failures through the OCR client, queue, saved coverage, checklist, and results. A successful HTTP response alone must not count a page as fully readable.
6. Add route and client regressions for long lines, dense pages, model token cutoffs, empty results, partial page failures, and fallback behavior. Preserve the existing eight-page limit as a clearly reported limitation until full-document OCR is implemented separately.

Done when the reviewed heading-loss and text-truncation reproductions no longer occur, existing PDF content and tags survive, and incomplete OCR always produces a visible required follow-up.

## Phase 2 Make queue ownership independent of navigation

1. Add a browser regression using two pages in the same browser context: the first acquires queue leadership and navigates to Home; the second uploads a PDF.
2. Ensure queued work is consumed even when the leader's `/app` layout is unmounted, or hand leadership to a tab that can process it. Keep exactly one active processing owner.
3. Cover navigation to Home and About, an idle leader, tab closure, cancellation, retries, and rapid uploads from multiple tabs. New work must start without asking the user to close another idle tab.
4. Keep waiting messages consistent with actual queue behavior and ensure the processing lock is released or handed off on failure.

Done when uploads in the second tab finish without closing the first, cross-tab updates remain consistent, and no file is processed concurrently by multiple tabs.

## Phase 3 Establish shared usage controls

1. Discover existing approved infrastructure for shared quota storage and the app-specific TritonAI key before requesting missing configuration. Keep the app usable without sign-in.
2. Replace process-local usage accounting as the primary control with shared per-IP request limits and an app-wide daily cap. Enforce limits across instances, concurrent requests, and restarts; document campus NAT implications.
3. Verify an app-specific TritonAI key and an enforced gateway budget with the available administration path. Do not treat UI copy or a local counter as proof of a gateway spend cap.
4. Add tests showing that over-quota requests make no upstream calls, including concurrent requests across independent app instances. Verify configured behavior before production promotion.

Dependencies: approved shared quota storage and gateway administration access. Continue independent code and test work while resolving these. If a required configuration or owner decision is unavailable, record the exact missing item and obtain it; this phase remains incomplete until enforcement is verified. Do not create paid infrastructure or accept institutional agreements without the required user decision.

Done when the app remains available without sign-in, shared usage caps work across instances, and the app's gateway budget is confirmed.

## Phase 4 Require CI before release and finish verification

1. Apply branch protection or an equivalent ruleset to main with pull requests and the relevant CI jobs required. Inspect the actual check names and available repository capabilities first.
2. Ensure failed required checks prevent promotion. Verify both repository settings and release workflow behavior; do not rely only on a written convention.
3. Run typecheck, lint, the full unit and integration suite with coverage, the PDF release gate, the production build, and the expanded browser suite. Retain at least the 463-test baseline and the 19 existing browser checks, adding regressions for the new defects without weakening assertions.
4. Review production dependency advisories and document applicability of any remaining finding. Do not broaden this work into an untested framework migration solely to clear an audit count.
5. Run an independent PDF validation check on representative changed output when a validator is available, alongside content and tag-preservation assertions. Confirm the supported PDF/UA profile and preserve an honest unavailable result when validation cannot run.
6. Update release notes and the handoff, merge through the required checks, and prepare the final release. Review the local desktop and mobile screenshots and verify keyboard access to the changed flows before production promotion.

Done when required checks are enforced and the final code passes its acceptance checks. Production delivery and live verification follow in phase 5.

## Phase 5 Restore reliable production delivery

1. Inspect the existing Vercel project connection, available authenticated local tooling, deployment settings, and GitHub workflow configuration. Reuse the existing project and approved credentials; never write secrets into source, logs, or the plan.
2. Repair the deployment path using the existing release script and CI deployment workflow. When automatic deployment is not configured, make that state explicit rather than treating a skipped deploy as a successful release.
3. Deploy the tested fixes and earlier October 28 improvements. Confirm that Vercel reports the deployment ready and production `/api/health` reports the exact deployed commit.
4. Run the browser regression, accessibility, and visual walkthrough checks against production. Confirm upload, processing, results, download, description embedding, and service configuration status using synthetic fixtures.
5. Update the handoff documentation with the working release path, remaining service limitations, and verified release evidence. Include a concrete rollback path.

Done when a release from main reaches production through the intended process, its commit is verified live, and production checks pass. A successful build or push alone is insufficient.

## Completion criteria

- [x] Existing PDF structure survives OCR, with regression evidence.
- [x] OCR never silently discards text; incomplete extraction is surfaced and remains actionable.
- [x] A tab on Home or About cannot stall another tab's queue.
- [ ] The current release is delivered reliably and the deployed commit is verified live.
- [ ] Shared app-level and per-IP quotas and the app-specific gateway budget are verified; SSO is excluded.
- [x] Required CI checks and pull requests protect main.
- [ ] Full checks, release notes, production walkthrough, and handoff evidence are complete.

The goal is complete only when every criterion is satisfied. A missing credential, unconfigured service, pending deployment, or unverified external control is an open dependency, not a completed improvement.

## Boundaries

This plan does not implement general semantic tagging of untagged PDFs, full-document OCR beyond the current limit, direct large-file service uploads, or a framework migration. The app must continue to explain those limits accurately. Campus privacy classification, hosting agreements, and the named support owner remain institutional rollout decisions from the October 28 readiness review; this plan does not claim to approve them.

## Execution checkpoint

October 30: phases 1 and 2 are implemented on the improvement branch. Regression checks cover preserved headings, Figure descriptions, role maps, annotation bindings, flat and branched ParentTrees, multiple pages, repeated passes, long lines, dense pages, cutoffs, and incomplete OCR coverage. The local production browser suite passed all 22 checks, including three new cross-tab regressions; the run also used the configured external veraPDF service. The production build, lint, typecheck, coverage suite, and 16-test PDF release gate passed.

Main now requires pull requests and all four CI jobs, including for administrators, with branches required to be current before merging. PR #70 was blocked while required checks were pending and became mergeable only after all four passed. Live release verification remains open.

The existing Vercel project is reachable from this Mac. No shared quota datastore is configured; the quota datastore and requested request/budget limits are awaiting user input. PR #70 was merged and deployed through the authenticated local release script. Production reported `89400ae`, and all 22 live browser checks passed. A follow-up isolates Playwright output so report cleanup cannot delete release evidence. Vercel now targets Node 22.x, matching the repository. The Vercel GitHub app cannot access this repository; refreshing its existing project link returned an installation-required error. The authenticated local Vercel CLI works. CI now fails immediately if deployment credentials are absent; an explicit verification-only dispatch checks an authenticated local release without claiming to deploy it.

Independent validation: veraPDF 1.28.2 checked a synthetic tagged source and OCR output with its PDF/UA-1 profile. Existing H1/P structure remained, bound text increased from 32 to 157 characters, and unbound text stayed at zero. Failed rules decreased from four to three with no new failing rule IDs. The output is not PDF/UA compliant: the fixture still has an untagged image, a missing DisplayDocTitle preference, and a non-embedded original font. This is regression evidence, not accessibility certification.

Production dependency review (October 30): `npm audit --omit=dev` reports zero critical findings, one high PostCSS finding and the inherited moderate Next.js finding. `npm ls postcss` locates the affected copy at `next/node_modules/postcss` 8.4.31; the direct build dependency is 8.5.32. The reports concern [inline CSS escaping](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) and untrusted CSS source-map loading ([initial report](https://github.com/advisories/GHSA-6g55-p6wh-862q), [follow-up](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [traversal report](https://github.com/advisories/GHSA-r28c-9q8g-f849)). The app has no user-supplied CSS or runtime PostCSS processing path; CSS is compiled from repository source. This limits current runtime applicability but does not remove the vulnerable dependency or the risk from untrusted build inputs. Keep the Next.js upgrade as separately tested work; do not claim the audit is clean.

Deployment checkpoint: GitHub now has the existing Vercel team/project IDs. Creating a project-scoped deployment token through the CLI authorization returned 403 (Cannot create tokens for this app), so `VERCEL_TOKEN` remains an external dependency for automatic delivery. The local script successfully deployed the exact main commit; the automatic workflow now fails clearly without its token. AI environment values are sensitive and unreadable through this authorization, so gateway budget enforcement remains unverified.
