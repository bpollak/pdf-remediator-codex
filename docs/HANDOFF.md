# Handoff: release to production and check the live site

October 28, 2026. Start here when picking this work up on your own computer.

## Where things stand

- The campus-readiness release is merged to `main` (bpollak/pdf-remediator-codex#50), with post-deploy checks
  (bpollak/pdf-remediator-codex#65) and CI-driven deploys (bpollak/pdf-remediator-codex#69). See
  [campus-readiness-2026-10-28.md](campus-readiness-2026-10-28.md) for what changed and what is still open.
- All automated checks pass: typecheck, lint, 463 unit and integration tests, the release gate, the production build,
  and the browser suite against a local production build.
- **Production has not been updated yet.** GitHub pushes are not triggering Vercel deployments for this repo (the same
  problem noted on October 27), and the cloud session that did this work could not reach Vercel. The live site still
  runs the October 27 release.

## 1. Release and check production (about 10 minutes)

From a clone of the repo on your computer:

```bash
git checkout main && git pull
```

```bash
bash scripts/release-to-production.sh
```

The script:

1. Updates `main` and runs `npm ci`. It needs Node 22 (`nvm install && nvm use` reads `.nvmrc`).
2. Runs every check: typecheck, lint, production audit, unit tests with coverage, the release gate, the build, and the
   browser suite against a local production build.
3. Deploys `main` to Vercel production with the Vercel CLI. The first time, it opens a browser to log in to Vercel and
   asks you to link the folder to the existing `pdf-remediator-codex` project.
4. Waits until https://pdf-remediator-codex.vercel.app/api/health reports the commit it deployed.
5. Runs the browser suite against production: the regression tests, axe accessibility checks of the app's pages, and a
   visual walkthrough at desktop, phone and 320 px widths with tagged, untagged, scanned and batch uploads. Screenshots
   open in `test-results/walkthrough/` when it finishes.
6. Offers to store `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as GitHub secrets (needs the GitHub CLI,
   `gh auth login`). Say yes: from then on, every merge to `main` deploys and checks production from CI on its own.
   Create the token at https://vercel.com/account/tokens, scoped to the team that owns the project.

A summary is written to `test-results/release-report.md`. Useful options:

| Option | Use |
|---|---|
| `--checks-only` | Run the checks without deploying anything |
| `--skip-checks` | Deploy and check production without the local checks |
| `--skip-deploy` | Only check what production serves now |
| `--no-secrets` | Don't offer to store the GitHub secrets |

If step 4 fails, production is not serving the commit. Look at the deployment in the Vercel dashboard (build logs,
environment variables) and the project's Settings → Git connection.

## 2. Review the live site by hand

Automated checks cover a lot, but not everything a campus launch needs. With the screenshots open:

- [ ] Home, About and Upload read well at desktop, phone and 320 px (`home-*.png`, `about-*.png`, `upload-*.png`).
- [ ] The untagged result says "Not yet" and explains how to export a tagged PDF (`untagged-results.png`).
- [ ] The scanned result shows OCR text, or a required "Make the scanned text readable (OCR)" item
  (`scanned-results.png`, `scanned-results.txt`).
- [ ] `health.json` shows the services you expect configured (`altText`, `tritonAiOcr`, `verapdf`).

Then on the live site:

- [ ] Keyboard only: Tab from the top (the first stop is "Skip to main content"), upload a PDF, open the results, tick a
  checklist item, download.
- [ ] VoiceOver (Cmd+F5) in Safari: hear each file's status as it finishes, and the page title change on navigation.
- [ ] Safari and Firefox, not just Chrome.
- [ ] Two or three real campus PDFs (a Word export, a scan, a form). Compare the result with Acrobat's checker or PAC.

## 3. Continue with Claude Code on your computer

Open Claude Code in the repo folder and paste:

> Read docs/HANDOFF.md and docs/campus-readiness-2026-10-28.md. Run `bash scripts/release-to-production.sh` (I will
> handle the Vercel login prompts), then review every screenshot in test-results/walkthrough/ and the live site at
> https://pdf-remediator-codex.vercel.app for regressions: layout at each width, honest verdicts, the checklist, errors
> in plain language, and keyboard and screen-reader behavior. Fix anything you find in a pull request, following
> AGENTS.md, and summarize what you checked.

## Still needs decisions (not code)

From [campus-readiness-2026-10-28.md](campus-readiness-2026-10-28.md):

1. Sign-in (campus SSO). Until then, anyone who can reach the site can use the app's TritonAI key.
2. Data classification and which AI processors may see documents (`lib/content/privacy.ts` copy).
3. Where veraPDF and the OCR worker run (Vercel's 4.5 MB request limit blocks most online verification).
4. Vercel plan and agreement for a campus service.
5. The help contact and feedback owner (`lib/content/support.ts`).
6. A TritonAI key with its own budget.
7. Making CI a required check on `main`.

## Notes

- If the OCR worker (`services/ocrmypdf-worker`) is deployed anywhere, set `OCR_WORKER_API_KEY` before redeploying it;
  it now refuses requests without one.
- Dependabot now proposes minor and patch updates only. Its earlier major-version PRs can be closed.
