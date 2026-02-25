import { describe, expect, it } from 'vitest';
import { buildEvidencePack } from '@/lib/report/evidence-pack';
import type { FileEntry } from '@/stores/app-store';

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'sample.pdf',
    size: 3,
    uploadedBytes: new Uint8Array([1, 2, 3]).buffer,
    status: 'remediated',
    progress: 100,
    ...overrides
  };
}

describe('buildEvidencePack', () => {
  it('builds an exportable payload with key sections', () => {
    const file = makeFile({
      sourceType: 'content-document',
      sourceTypeConfidence: 'high',
      sourceTypeReasons: ['Contains substantial content'],
      sourceTypeSuggestedAction: 'Proceed with remediation.',
      auditResult: { score: 45, findings: [] },
      postRemediationAudit: { score: 75, findings: [] },
      remediatedBytes: new Uint8Array([4, 5, 6]).buffer
    });

    const pack = buildEvidencePack(file);
    expect(pack.document.name).toBe('sample.pdf');
    expect(pack.sourceAssessment.sourceType).toBe('content-document');
    expect(pack.scoring.originalInternalScore).toBe(45);
    expect(pack.scoring.remediatedInternalScore).toBe(75);
    expect(pack.document.uploadedFingerprint).toContain(':');
    expect(pack.document.remediatedFingerprint).toContain(':');
  });
});
