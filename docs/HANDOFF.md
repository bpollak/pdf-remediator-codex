# PDF Remediator release handoff

October 30, 2026.

## Verified release

[PR #70](https://github.com/bpollak/pdf-remediator-codex/pull/70) shipped the October 28 campus-readiness work and October 30 OCR/queue fixes through the authenticated local release script. Production reported commit `89400ae` at `/api/health`, and all 22 live browser checks passed, including upload, processing, results, download, saved-description embedding, accessibility scans, desktop/390 px/320 px layouts, and three cross-tab regressions. The script also exposed a report-retention defect: Playwright's default output cleanup removed the report. The follow-up configuration gives Playwright its own subdirectory; verify report retention on the next release.

All four required CI jobs passed before merging and again on main. The suite has 484 unit/integration tests, plus the 16-test PDF release gate. Main requires pull requests, current branches, all four checks and resolved conversations, including for administrators; force pushes and deletions are disabled. Vercel uses Node 22.x.

Independent veraPDF 1.28.2 PDF/UA-1 validation of a synthetic tagged OCR fixture introduced no new failing rules. Original H1/P tags remained, tagged text rose from 32 to 157 characters, and unbound text stayed at zero. Three fixture failures remain (untagged image, DisplayDocTitle and original font embedding). This is regression evidence, not PDF accessibility certification.

SSO and sign-in are excluded by the user's instruction. The remaining goal scope is recorded in [the improvement plan](improvement-plan-2026-10-30.md).

## Release again

Use Node 22 and a clean tracked working tree:

```bash
bash scripts/release-to-production.sh --no-secrets
```

The script updates main, installs dependencies, runs local acceptance checks, deploys to the existing Vercel project, waits for the exact commit at `/api/health`, then runs the live browser suite. If that exact commit already passed required CI and local acceptance, `--skip-checks --no-secrets` runs deployment and live verification. Do not use a skipped check as evidence that it passed.

Evidence lives in `test-results/release-report.md`, `test-results/walkthrough/` and `test-results/playwright/`. Review the screenshots as well as the test result. The health endpoint should show alt-text, TritonAI OCR and veraPDF configured; the optional native OCR service is currently unconfigured.

## Automatic delivery dependency

The Vercel GitHub app cannot access this repository. GitHub Actions has `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, but no `VERCEL_TOKEN`. The existing CLI authorization permits local deployment but the token-creation API returns 403, "Cannot create tokens for this app." A project-scoped Vercel deployment token must be added as the repository secret `VERCEL_TOKEN`; do not paste it into chat or source, or copy the cached personal CLI session into CI.

Automatic deployment now fails immediately with that missing-configuration error, rather than calling a skipped deploy successful. This was verified in [run 41072583899](https://github.com/bpollak/pdf-remediator-codex/actions/runs/41072583899). After a local release, independently verify the current main commit with:

```bash
gh workflow run post-deploy.yml --ref main -f verify_only=true
```

Wait for main's CI run to finish before dispatching; the workflow serializes post-deploy runs and a later automatic run can cancel an earlier verification run. Verification-only mode does not deploy and still requires the live commit and full browser suite to pass.

## Remaining usage configuration

No shared quota datastore is configured. The approved datastore, app-wide daily request cap and gateway budget are awaiting user input. Usage is currently guarded by process-local per-IP limits, which do not enforce a serverless-wide quota. The TritonAI secrets are marked sensitive and cannot be read back through the existing authorization, so an app-specific key and enforced gateway budget have not been verified. Keep this goal criterion open.

Campus data classification, processor/hosting agreements and the support owner remain rollout decisions described in [the campus-readiness review](campus-readiness-2026-10-28.md). General semantic tagging, full-document OCR beyond eight pages, and direct large-file service uploads remain outside this goal. VoiceOver/Safari/Firefox and representative real campus documents still need human acceptance; Chrome automation is not proof of those checks.

## Rollback

The previous ready production deployment was `dpl_EXpjcQ6ftyJZVABsw6y9y1gGNaAv`, URL `https://pdf-remediator-codex-6otyem6ci-bpollaks-projects.vercel.app`, from commit `c9e56ff084f317b1ecf812d38782ee603a02da40` (October 27 behavior). If needed, inspect it and run:

```bash
vercel promote https://pdf-remediator-codex-6otyem6ci-bpollaks-projects.vercel.app
```

Then verify production and rerun the live checks appropriate to that commit. The old release has no health endpoint, so this rollback restores that limitation and the older defects too.
