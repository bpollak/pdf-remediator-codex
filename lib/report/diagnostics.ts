/**
 * Raw diagnostic text (OCR or service errors) is only shown behind a
 * "Details for support" disclosure. Even there, server setting names such as
 * environment variables are left out: they mean nothing to the person using
 * the tool and describe how the server is configured.
 */
const ENV_VAR_NAME = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

// Sentences that only tell an operator which setting to change.
const SETUP_INSTRUCTION = /(?:^|\s)(?:Set|Configure|Add)\s+\[server setting\][^.]*\.?/gi;

export function redactDiagnostic(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const cleaned = text
    .replace(ENV_VAR_NAME, '[server setting]')
    .replace(SETUP_INSTRUCTION, '')
    // "(set [server setting] or [server setting])" adds nothing once redacted.
    .replace(/\(\s*set\s+\[server setting\](?:\s*(?:or|,)\s*\[server setting\])*\s*\)/gi, '')
    .replace(/\s+([.,;)])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || undefined;
}
