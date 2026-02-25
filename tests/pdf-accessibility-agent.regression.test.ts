import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { runAudit } from '@/lib/audit/engine';
import { remediatePdf } from '@/lib/remediate/engine';

const FIXTURES = {
  manual: 'Impressionist Period Reading - 2 column - structurally remediated.pdf',
  aiRemediated: 'AI - remediated-Impressionist Period Reading - 2 column - structurally remediated.pdf',
  aiSecondPass: '2nd Pass - AI - remediated-Impressionist Period Reading - 2 column - structurally remediated.pdf',
  source: 'remediated-Impressionist Period Reading - 2 column - unremediated.pdf'
} as const;

function fixturePath(name: string): string {
  return resolve(process.cwd(), 'public', name);
}

async function loadFixtureBytes(name: string): Promise<ArrayBuffer> {
  const filePath = fixturePath(name);
  const sourceBuffer = await readFile(filePath);
  return sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength);
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof Uint8Array) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return bytes;
}

describe('PDF accessibility agent regression checks', () => {
  it('flags unbound structure in known AI-remediated fixture', { timeout: 60000 }, async () => {
    if (!existsSync(fixturePath(FIXTURES.aiRemediated))) return;

    const bytes = await loadFixtureBytes(FIXTURES.aiRemediated);
    const parsed = await parsePdfBytes(bytes.slice(0));
    const audit = runAudit(parsed);

    expect(parsed.hasStructTree).toBe(true);
    expect(parsed.structureBinding?.structElemCount ?? 0).toBeGreaterThan(0);
    expect(parsed.structureBinding?.hasContentBinding).toBe(false);
    expect(audit.findings.some((finding) => finding.ruleId === 'DOC-005')).toBe(true);
    expect(audit.score).toBeLessThanOrEqual(35);
  });

  it('does not raise unbound-structure finding on manually remediated fixture', { timeout: 60000 }, async () => {
    if (!existsSync(fixturePath(FIXTURES.manual))) return;

    const bytes = await loadFixtureBytes(FIXTURES.manual);
    const parsed = await parsePdfBytes(bytes.slice(0));
    const audit = runAudit(parsed);

    expect(audit.findings.some((finding) => finding.ruleId === 'DOC-005')).toBe(false);
  });

  it('keeps second-pass AI fixture score-capped when structural regressions persist', { timeout: 60000 }, async () => {
    if (!existsSync(fixturePath(FIXTURES.aiSecondPass))) return;

    const bytes = await loadFixtureBytes(FIXTURES.aiSecondPass);
    const parsed = await parsePdfBytes(bytes.slice(0));
    const audit = runAudit(parsed);

    const hasDoc002 = audit.findings.some((finding) => finding.ruleId === 'DOC-002');
    const hasDoc005 = audit.findings.some((finding) => finding.ruleId === 'DOC-005');

    expect(hasDoc002 || hasDoc005).toBe(true);
    expect(audit.score).toBeLessThanOrEqual(40);
  });

  it('two-pass remediation remains stable and avoids synthetic tables', { timeout: 120000 }, async () => {
    if (!existsSync(fixturePath(FIXTURES.source))) return;

    const sourceBytes = await loadFixtureBytes(FIXTURES.source);
    const parsed0 = await parsePdfBytes(sourceBytes.slice(0));
    const audit0 = runAudit(parsed0);
    const doc005Before = audit0.findings.some((finding) => finding.ruleId === 'DOC-005');
    const tableTags0 = parsed0.tags.filter((tag) => tag.type === 'Table').length;

    const pass1 = await remediatePdf(parsed0, parsed0.language ?? 'en-US', sourceBytes.slice(0));
    const pass1Bytes = toArrayBuffer(pass1);
    const parsed1 = await parsePdfBytes(pass1Bytes.slice(0));
    const audit1 = runAudit(parsed1);
    const doc005AfterPass1 = audit1.findings.some((finding) => finding.ruleId === 'DOC-005');
    const tableTags1 = parsed1.tags.filter((tag) => tag.type === 'Table').length;

    const pass2 = await remediatePdf(parsed1, parsed1.language ?? 'en-US', pass1Bytes.slice(0));
    const pass2Bytes = toArrayBuffer(pass2);
    const parsed2 = await parsePdfBytes(pass2Bytes.slice(0));
    const audit2 = runAudit(parsed2);
    const doc005AfterPass2 = audit2.findings.some((finding) => finding.ruleId === 'DOC-005');
    const tableTags2 = parsed2.tags.filter((tag) => tag.type === 'Table').length;

    expect(audit1.score).toBeGreaterThanOrEqual(audit0.score);
    expect(audit2.score).toBeGreaterThanOrEqual(audit1.score - 2);
    expect(parsed1.remediationMode).toBe('analysis-only');
    expect(parsed2.remediationMode).toBe('analysis-only');
    expect(tableTags1).toBe(0);
    expect(tableTags2).toBe(0);
    expect(tableTags1).toBeLessThanOrEqual(tableTags0);
    expect(tableTags2).toBeLessThanOrEqual(tableTags1);
    expect(Number(doc005AfterPass1)).toBeLessThanOrEqual(Number(doc005Before));
    expect(Number(doc005AfterPass2)).toBeLessThanOrEqual(Number(doc005AfterPass1));
  });
});
