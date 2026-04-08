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

  it('infers non-compliance from failed rule counts when explicit verdict is missing', () => {
    const jsonReport = JSON.stringify({
      validationReport: {
        profileName: 'PDF/UA-1 validation profile',
        statement: 'PDF file is not compliant with Validation Profile requirements.',
        details: {
          passedRules: 98,
          failedRules: 8,
          passedChecks: 3804,
          failedChecks: 738
        }
      }
    });

    const result = normalizeVerapdfPayload(jsonReport, 'application/json');

    expect(result.compliant).toBe(false);
    expect(result.summary?.failedRules).toBe(8);
    expect(result.statement).toContain('not compliant');
  });

  it('infers compliance from zero failed rule counts when explicit verdict is missing', () => {
    const jsonReport = JSON.stringify({
      validationReport: {
        profileName: 'PDF/UA-1 validation profile',
        details: {
          passedRules: 108,
          failedRules: 0,
          passedChecks: 4120,
          failedChecks: 0
        }
      }
    });

    const result = normalizeVerapdfPayload(jsonReport, 'application/json');

    expect(result.compliant).toBe(true);
    expect(result.summary?.failedRules).toBe(0);
  });

  it('returns reason for unparseable non-JSON non-XML payload', () => {
    const result = normalizeVerapdfPayload('random garbage', 'text/plain');
    expect(result.reason).toContain('Unable to parse');
  });

  it('handles @-prefixed keys from XML-to-JSON conversion', () => {
    const jsonReport = JSON.stringify({
      validationReport: {
        '@isCompliant': 'true',
        '@profileName': 'PDF/UA-1',
        details: { '@passedRules': '50', '@failedRules': '0' }
      }
    });
    const result = normalizeVerapdfPayload(jsonReport, 'application/json');
    expect(result.compliant).toBe(true);
    expect(result.profile).toBe('PDF/UA-1');
    expect(result.summary?.passedRules).toBe(50);
    expect(result.summary?.failedRules).toBe(0);
  });

  it('treats numeric strings as numbers in summary', () => {
    const jsonReport = JSON.stringify({
      validationReport: {
        details: { failedRules: '3', passedRules: '47' }
      }
    });
    const result = normalizeVerapdfPayload(jsonReport, 'application/json');
    expect(result.summary?.failedRules).toBe(3);
    expect(result.summary?.passedRules).toBe(47);
  });

  it('treats boolean strings as booleans', () => {
    const jsonReport = JSON.stringify({
      validationReport: { isCompliant: 'false' }
    });
    const result = normalizeVerapdfPayload(jsonReport, 'application/json');
    expect(result.compliant).toBe(false);
  });

  it('returns undefined summary when no rule/check counts exist', () => {
    const jsonReport = JSON.stringify({
      validationReport: { isCompliant: true, profileName: 'Custom' }
    });
    const result = normalizeVerapdfPayload(jsonReport, 'application/json');
    expect(result.compliant).toBe(true);
    expect(result.summary).toBeUndefined();
  });

  it('parses self-closing XML validationReport tag', () => {
    const xml = '<validationReport isCompliant="true" profileName="PDF/UA-1"/>';
    const result = normalizeVerapdfPayload(xml, 'application/xml');
    expect(result.compliant).toBe(true);
    expect(result.profile).toBe('PDF/UA-1');
  });

  it('infers compliance from statement containing "compliant"', () => {
    const jsonReport = JSON.stringify({
      validationReport: {
        statement: 'The document is compliant with PDF/UA requirements.'
      }
    });
    const result = normalizeVerapdfPayload(jsonReport, 'application/json');
    expect(result.compliant).toBe(true);
  });

  it('infers non-compliance from statement containing "fails"', () => {
    const jsonReport = JSON.stringify({
      validationReport: {
        statement: 'The document fails PDF/UA validation.'
      }
    });
    const result = normalizeVerapdfPayload(jsonReport, 'application/json');
    expect(result.compliant).toBe(false);
  });

  it('falls back to XML parser when JSON parse fails', () => {
    const xml = '<validationReport isCompliant="true" profileName="PDF/UA-1"><details passedRules="10" failedRules="0"/></validationReport>';
    // Content-type says JSON but payload is XML
    const result = normalizeVerapdfPayload(xml, 'application/json');
    expect(result.compliant).toBe(true);
    expect(result.profile).toBe('PDF/UA-1');
  });

  it('extracts compliance data from veraPDF REST validationResult payloads', () => {
    const jsonReport = JSON.stringify({
      report: {
        jobs: [
          {
            validationResult: [
              {
                profileName: 'PDF/UA-1 validation profile',
                statement: 'PDF file is not compliant with Validation Profile requirements.',
                compliant: false,
                details: {
                  passedRules: 100,
                  failedRules: 6,
                  passedChecks: 300,
                  failedChecks: 41
                }
              }
            ]
          }
        ]
      }
    });

    const result = normalizeVerapdfPayload(jsonReport, 'application/json');

    expect(result.compliant).toBe(false);
    expect(result.profile).toBe('PDF/UA-1 validation profile');
    expect(result.summary?.failedRules).toBe(6);
    expect(result.summary?.failedChecks).toBe(41);
  });
});
