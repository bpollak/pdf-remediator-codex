# PDF Accessibility Agent

## Purpose

This agent validates that remediation output is structurally truthful and stable across reruns. It focuses on high-risk mismatches seen in Acrobat reviews:

1. Unbound tag trees (`StructTreeRoot` present, but no `/MCID` or ParentTree content bindings).
2. Synthetic table structures introduced where no real table exists.
3. Second-pass score regressions from metadata/manifest side effects.

## Inputs

Run this agent against fixture PDFs in `public/`, especially:

1. `Impressionist Period Reading - 2 column - structurally remediated.pdf`
2. `AI - remediated-Impressionist Period Reading - 2 column - structurally remediated.pdf`
3. `remediated-Impressionist Period Reading - 2 column - unremediated.pdf`
4. `2nd Pass - AI - remediated-Impressionist Period Reading - 2 column - structurally remediated.pdf`

## Checks

1. Parse each PDF and collect `structureBinding` summary metrics.
2. Run internal audit and verify `DOC-005` is raised when structure is unbound.
3. Run one- and two-pass remediation loops and confirm score stability.
4. Confirm remediation does not create `Table` tags in non-table fixtures.
5. Confirm remediated outputs from unstructured sources are labeled `analysis-only`.
6. Confirm remediated score display cannot show `100%` unless internal critical findings are clear and veraPDF is compliant.

## Execution

Run:

```bash
npm run test:pdf-agent
```

This executes:

- `tests/pdf-accessibility-agent.regression.test.ts`

## Pass criteria

1. Known unbound AI fixture triggers `DOC-005` and remains score-capped.
2. Manually remediated fixture does not trigger `DOC-005`.
3. Two-pass remediation does not collapse score and keeps `Table` tags at `0` for the Impressionist non-table fixture.
4. Remediation mode is `analysis-only` when content-bound structure cannot be guaranteed.
5. Displayed remediated score follows the 100% guardrail.
