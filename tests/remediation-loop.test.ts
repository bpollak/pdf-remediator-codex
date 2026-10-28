import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ParsedPDF } from '@/lib/pdf/types';
import { parsePdfBytes } from '@/lib/pdf/parser';
import { remediatePdf } from '@/lib/remediate/engine';
import {
  computeFailureScore,
  createByteFingerprint,
  createRemediationFingerprint,
  decideRemediationLoop,
  selectBestRemediationIteration
} from '@/lib/remediate/loop';

describe('remediation loop controls', () => {
  it('prefers failed checks as failure score when available', () => {
    expect(
      computeFailureScore({
        attempted: true,
        summary: { failedRules: 4, failedChecks: 21 }
      })
    ).toBe(21);
  });

  it('falls back to failed rules for failure score', () => {
    expect(
      computeFailureScore({
        attempted: true,
        summary: { failedRules: 3 }
      })
    ).toBe(3);
  });

  it('returns stable fingerprint for same bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(createByteFingerprint(bytes)).toBe(createByteFingerprint(bytes.slice(0)));
  });

  it('fingerprints every byte, not a sample', () => {
    const a = new Uint8Array(10_000);
    const b = new Uint8Array(10_000);
    b[5_001] = 1;
    expect(createByteFingerprint(a.buffer)).not.toBe(createByteFingerprint(b.buffer));
  });

  it('ignores the modification date and pdf.js font ids when fingerprinting a pass', async () => {
    const base: ParsedPDF = {
      pageCount: 1,
      metadata: { Title: 'Report', ModDate: "D:20261028100000Z" },
      hasStructTree: true,
      tags: [{ type: 'P', page: 1 }],
      textItems: [{ text: 'Hello', x: 0, y: 0, width: 10, height: 10, fontName: 'g_d3_f1', fontSize: 10, page: 1 }],
      images: [],
      links: [],
      outlines: [],
      forms: []
    };
    const laterPass: ParsedPDF = {
      ...base,
      metadata: { ...base.metadata, ModDate: "D:20261028100500Z" },
      textItems: [{ ...base.textItems[0]!, fontName: 'g_d4_f1' }]
    };
    const changed: ParsedPDF = { ...base, tags: [...base.tags, { type: 'H1', page: 1 }] };

    expect(await createRemediationFingerprint(laterPass)).toBe(await createRemediationFingerprint(base));
    expect(await createRemediationFingerprint(changed)).not.toBe(await createRemediationFingerprint(base));
  });

  it('lets no_change fire when a further strict pass changes nothing', async () => {
    const buffer = readFileSync('fixtures/partial.pdf');
    let bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    let parsed = await parsePdfBytes(bytes);
    const fingerprints: string[] = [];
    for (let pass = 1; pass <= 3; pass += 1) {
      const output = await remediatePdf(parsed, parsed.language ?? 'en-US', bytes, { strictPdfUa: pass > 1 });
      bytes = (output instanceof Uint8Array ? output.slice().buffer : output) as ArrayBuffer;
      parsed = await parsePdfBytes(bytes);
      fingerprints.push(await createRemediationFingerprint(parsed));
    }
    expect(fingerprints[2]).toBe(fingerprints[1]);
    expect(
      decideRemediationLoop({ iteration: 3, maxIterations: 3, currentFingerprint: fingerprints[2], previousFingerprint: fingerprints[1] }).reason
    ).toBe('no_change');
  }, 30_000);

  it('stops when veraPDF reports compliance', () => {
    const decision = decideRemediationLoop({
      iteration: 1,
      maxIterations: 3,
      verapdfResult: { attempted: true, compliant: true }
    });
    expect(decision.continue).toBe(false);
    expect(decision.reason).toBe('compliant');
  });

  it('stops when failure score does not improve', () => {
    const decision = decideRemediationLoop({
      iteration: 2,
      maxIterations: 3,
      verapdfResult: { attempted: true, compliant: false },
      currentFailureScore: 12,
      previousFailureScore: 10
    });
    expect(decision.continue).toBe(false);
    expect(decision.reason).toBe('no_improvement');
  });

  it('continues when not compliant but improving and under iteration cap', () => {
    const decision = decideRemediationLoop({
      iteration: 1,
      maxIterations: 3,
      verapdfResult: { attempted: true, compliant: false },
      currentFailureScore: 8,
      previousFailureScore: 11,
      currentFingerprint: '10:1',
      previousFingerprint: '10:2'
    });
    expect(decision.continue).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('prefers candidates that do not regress below original internal score', () => {
    const selected = selectBestRemediationIteration(
      [
        {
          iteration: 1,
          internalScore: 92,
          failureScore: 200,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 200 } }
        },
        {
          iteration: 2,
          internalScore: 70,
          failureScore: 120,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 120 } }
        }
      ],
      78
    );

    expect(selected?.iteration).toBe(1);
  });

  it('prefers better external failure score when both candidates are above baseline', () => {
    const selected = selectBestRemediationIteration(
      [
        {
          iteration: 1,
          internalScore: 90,
          failureScore: 200,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 200 } }
        },
        {
          iteration: 2,
          internalScore: 88,
          failureScore: 120,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 120 } }
        }
      ],
      78
    );

    expect(selected?.iteration).toBe(2);
  });

  it('prefers compliant candidate when both are safe', () => {
    const selected = selectBestRemediationIteration(
      [
        {
          iteration: 1,
          internalScore: 95,
          failureScore: 10,
          verapdfResult: { attempted: true, compliant: false, summary: { failedChecks: 10 } }
        },
        {
          iteration: 2,
          internalScore: 88,
          failureScore: 0,
          verapdfResult: { attempted: true, compliant: true, summary: { failedChecks: 0 } }
        }
      ],
      78
    );

    expect(selected?.iteration).toBe(2);
  });
});
