import assert from "node:assert/strict";
import test from "node:test";

import { auditRules } from "../lib/audit/rules";
import { accessibleParsed, partialParsed, untaggedParsed } from "./parsed-fixtures";

const failingFixtureByRuleId: Record<string, "untagged" | "partial"> = {
  "DOC-001": "untagged",
  "DOC-002": "untagged",
  "DOC-003": "untagged",
  "DOC-004": "untagged",
  "DOC-005": "partial",
  "HDG-001": "partial",
  "HDG-002": "untagged",
  "HDG-003": "partial",
  "IMG-001": "untagged",
  "IMG-002": "partial",
  "IMG-003": "untagged",
  "TBL-001": "partial",
  "TBL-002": "partial",
  "TBL-003": "partial",
  "LST-001": "untagged",
  "LNK-001": "partial",
  "LNK-002": "untagged",
  "CLR-001": "partial",
  "CLR-002": "partial",
  "FRM-001": "untagged",
  "FRM-002": "untagged",
  "META-001": "untagged",
  "META-002": "untagged"
};

function fixture(name: "untagged" | "partial") {
  return name === "untagged" ? untaggedParsed : partialParsed;
}

test("all rules pass on accessible fixture", () => {
  for (const rule of auditRules) {
    const findings = rule.run({ parsed: structuredClone(accessibleParsed) });
    assert.equal(findings.length, 0, `Expected ${rule.id} to pass`);
  }
});

for (const rule of auditRules) {
  test(`${rule.id} reports findings on failing fixture`, () => {
    const parsed = structuredClone(fixture(failingFixtureByRuleId[rule.id]));
    const findings = rule.run({ parsed });

    assert.ok(findings.length > 0, `${rule.id} should report at least one finding`);
    for (const finding of findings) {
      assert.equal(finding.ruleId, rule.id);
    }
  });
}
