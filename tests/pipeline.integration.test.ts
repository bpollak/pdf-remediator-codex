import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { runAuditEngine } from "../lib/audit/engine";
import { parsePdfBytes } from "../lib/pdf/parser";
import { runRemediationEngine } from "../lib/remediate/engine";

test("parse -> audit -> remediate -> re-audit reduces issue count", { timeout: 30000 }, async () => {
  const fixturePath = resolve(process.cwd(), "fixtures/untagged.pdf");
  const sourceBuffer = await readFile(fixturePath);

  const sourceBytes = sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength);

  const originalParsed = await parsePdfBytes({
    fileId: "integration-source",
    fileName: "untagged.pdf",
    bytes: sourceBytes
  });

  const before = runAuditEngine({ parsed: originalParsed });

  const remediation = await runRemediationEngine({
    fileName: "untagged.pdf",
    bytes: sourceBytes,
    parsed: originalParsed,
    options: { language: "en-US" }
  });

  const reparsed = await parsePdfBytes({
    fileId: "integration-remediated",
    fileName: "untagged-remediated.pdf",
    bytes: remediation.remediatedBytes
  });

  const after = runAuditEngine({ parsed: reparsed });

  assert.ok(after.counts.total < before.counts.total, `Expected issue count to decrease (${before.counts.total} -> ${after.counts.total})`);
});
