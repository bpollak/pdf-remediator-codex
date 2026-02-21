import type { VerapdfResult, VerapdfSummary } from './types';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as JsonRecord;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getValue(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function extractSummary(record: JsonRecord | undefined): VerapdfSummary | undefined {
  if (!record) return undefined;

  const summary: VerapdfSummary = {
    passedRules: asNumber(getValue(record, ['passedRules', '@passedRules'])),
    failedRules: asNumber(getValue(record, ['failedRules', '@failedRules'])),
    passedChecks: asNumber(getValue(record, ['passedChecks', '@passedChecks'])),
    failedChecks: asNumber(getValue(record, ['failedChecks', '@failedChecks']))
  };

  if (
    summary.passedRules === undefined &&
    summary.failedRules === undefined &&
    summary.passedChecks === undefined &&
    summary.failedChecks === undefined
  ) {
    return undefined;
  }

  return summary;
}

function findValidationReport(root: unknown): JsonRecord | undefined {
  const visited = new Set<object>();

  function walk(node: unknown): JsonRecord | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (visited.has(node as object)) return undefined;
    visited.add(node as object);

    if (Array.isArray(node)) {
      for (const item of node) {
        const match = walk(item);
        if (match) return match;
      }
      return undefined;
    }

    const record = node as JsonRecord;
    const nestedValidationReport = asRecord(record.validationReport);
    if (nestedValidationReport) return nestedValidationReport;

    if (
      'isCompliant' in record ||
      '@isCompliant' in record ||
      'profileName' in record ||
      '@profileName' in record ||
      'details' in record
    ) {
      return record;
    }

    for (const value of Object.values(record)) {
      const match = walk(value);
      if (match) return match;
    }

    return undefined;
  }

  return walk(root);
}

function normalizeFromJson(payload: unknown): Partial<VerapdfResult> {
  const validationReport = findValidationReport(payload);
  if (!validationReport) return {};

  const details = asRecord(validationReport.details);
  const summary = extractSummary(details) ?? extractSummary(validationReport);

  return {
    compliant: asBoolean(getValue(validationReport, ['isCompliant', '@isCompliant'])),
    profile: asString(getValue(validationReport, ['profileName', '@profileName', 'validationProfile', '@validationProfile'])),
    statement: asString(getValue(validationReport, ['statement', '@statement'])),
    summary
  };
}

function parseAttributes(rawAttributes: string): JsonRecord {
  const attributes: JsonRecord = {};
  const attributePattern = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null = null;

  while ((match = attributePattern.exec(rawAttributes)) !== null) {
    const key = match[1];
    const value = match[2];
    if (!key) continue;
    attributes[key] = value;
  }

  return attributes;
}

function extractTagAttributes(xml: string, tagName: string): JsonRecord | undefined {
  const tagPattern = new RegExp(`<${tagName}\\b([^>]*)\\/?>`, 'i');
  const match = tagPattern.exec(xml);
  if (!match) return undefined;
  return parseAttributes(match[1] ?? '');
}

function normalizeFromXml(xml: string): Partial<VerapdfResult> {
  const validationReportAttributes = extractTagAttributes(xml, 'validationReport');
  if (!validationReportAttributes) return {};

  const summary = extractSummary(extractTagAttributes(xml, 'details'));

  return {
    compliant: asBoolean(getValue(validationReportAttributes, ['isCompliant'])),
    profile: asString(getValue(validationReportAttributes, ['profileName', 'validationProfile'])),
    statement: asString(getValue(validationReportAttributes, ['statement'])),
    summary
  };
}

export function normalizeVerapdfPayload(rawPayload: string, contentType?: string): Partial<VerapdfResult> {
  const payload = rawPayload.trim();
  if (!payload) {
    return { reason: 'veraPDF returned an empty report.' };
  }

  const normalizedContentType = (contentType ?? '').toLowerCase();
  const expectsJson = normalizedContentType.includes('json') || payload.startsWith('{') || payload.startsWith('[');
  const expectsXml = normalizedContentType.includes('xml') || payload.startsWith('<') || payload.includes('<validationReport');

  if (expectsJson) {
    try {
      const parsedJson = JSON.parse(payload) as unknown;
      const normalized = normalizeFromJson(parsedJson);
      if (Object.keys(normalized).length > 0) return normalized;
    } catch {
      // Fallback to XML parser below.
    }
  }

  if (expectsXml || !expectsJson) {
    const normalized = normalizeFromXml(payload);
    if (Object.keys(normalized).length > 0) return normalized;
  }

  return { reason: 'Unable to parse veraPDF verification report.' };
}
