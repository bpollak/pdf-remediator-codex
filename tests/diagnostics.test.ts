import { describe, expect, it } from 'vitest';
import { redactDiagnostic } from '@/lib/report/diagnostics';

describe('redactDiagnostic', () => {
  it('removes environment variable names from raw diagnostics', () => {
    const raw =
      'TritonAI OCR did not detect enough text (found 0, need 3): Page 1: TritonAI OCR is not configured (set OCR_LITELLM_API_KEY or LITELLM_API_KEY).';
    const cleaned = redactDiagnostic(raw);

    expect(cleaned).not.toMatch(/LITELLM|_API_KEY/);
    expect(cleaned).toBe(
      'TritonAI OCR did not detect enough text (found 0, need 3): Page 1: TritonAI OCR is not configured.'
    );
  });

  it('replaces a lone setting name with a neutral phrase', () => {
    expect(redactDiagnostic('Missing VERAPDF_SERVICE_URL')).toBe('Missing [server setting]');
  });

  it('keeps ordinary text and drops empty input', () => {
    expect(redactDiagnostic('Used local OCR fallback')).toBe('Used local OCR fallback');
    expect(redactDiagnostic('')).toBeUndefined();
    expect(redactDiagnostic(undefined)).toBeUndefined();
  });
});
