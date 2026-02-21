import { describe, expect, it } from 'vitest';
import { normalizeVerapdfPayload } from '@/lib/verapdf/normalize';

describe('normalizeVerapdfPayload', () => {
  it('extracts compliance data from JSON reports', () => {
    const jsonReport = JSON.stringify({
      report: {
        jobs: [
          {
            validationReport: {
              profileName: 'PDF/UA-1',
              statement: 'The file is not compliant with the profile requirements.',
              isCompliant: false,
              details: {
                passedRules: 101,
                failedRules: 4,
                passedChecks: 980,
                failedChecks: 17
              }
            }
          }
        ]
      }
    });

    const result = normalizeVerapdfPayload(jsonReport, 'application/json');

    expect(result.compliant).toBe(false);
    expect(result.profile).toBe('PDF/UA-1');
    expect(result.summary?.passedRules).toBe(101);
    expect(result.summary?.failedRules).toBe(4);
    expect(result.summary?.passedChecks).toBe(980);
    expect(result.summary?.failedChecks).toBe(17);
  });

  it('extracts compliance data from XML reports', () => {
    const xmlReport = `<?xml version="1.0" encoding="utf-8"?>
<report>
  <jobs>
    <job>
      <validationReport profileName="PDF/UA-1" statement="Compliant file." isCompliant="true">
        <details passedRules="88" failedRules="0" passedChecks="744" failedChecks="0" />
      </validationReport>
    </job>
  </jobs>
</report>`;

    const result = normalizeVerapdfPayload(xmlReport, 'application/xml');

    expect(result.compliant).toBe(true);
    expect(result.profile).toBe('PDF/UA-1');
    expect(result.summary?.passedRules).toBe(88);
    expect(result.summary?.failedRules).toBe(0);
    expect(result.summary?.passedChecks).toBe(744);
    expect(result.summary?.failedChecks).toBe(0);
  });

  it('returns a reason when payload is empty', () => {
    const result = normalizeVerapdfPayload('', 'application/json');
    expect(result.reason).toBe('veraPDF returned an empty report.');
  });
});
