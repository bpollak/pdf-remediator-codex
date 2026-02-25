import type { ParsedPDF } from '@/lib/pdf/types';

export type SourceType = 'content-document' | 'checker-report-artifact' | 'mixed-or-uncertain';
export type SourceTypeConfidence = 'high' | 'medium' | 'low';

export interface SourceTypeAssessment {
  type: SourceType;
  confidence: SourceTypeConfidence;
  reasons: string[];
  suggestedAction: string;
}

const REPORT_NAME_PATTERN =
  /\b(report|accessibility[\s-]?checker|checker|audit|acrobat\s*-\s*report|ai\s*-\s*report)\b/i;

function hasHeadingLikeTag(parsed: ParsedPDF): boolean {
  return parsed.tags.some((tag) => /^H[1-6]$/.test(tag.type));
}

export function classifyPdfSource(fileName: string, parsed: ParsedPDF): SourceTypeAssessment {
  const nameLooksLikeReport = REPORT_NAME_PATTERN.test(fileName);
  const textItemCount = parsed.textItems.length;
  const imageCount = parsed.images.length;
  const pageCount = parsed.pageCount;
  const hasUserFacingStructure =
    parsed.outlines.length > 0 ||
    hasHeadingLikeTag(parsed) ||
    parsed.links.length > 0 ||
    parsed.forms.length > 0;

  const sparseTextThreshold = Math.max(20, pageCount * 6);
  const richTextThreshold = Math.max(120, pageCount * 30);
  const isImageDominant = textItemCount === 0 && imageCount > 0;
  const isVerySparse = textItemCount < sparseTextThreshold;
  const hasRichText = textItemCount >= richTextThreshold;

  if (
    nameLooksLikeReport &&
    (isImageDominant || (pageCount <= 4 && isVerySparse && !hasUserFacingStructure) || parsed.pageCount <= 2)
  ) {
    return {
      type: 'checker-report-artifact',
      confidence: 'high',
      reasons: [
        'Filename strongly matches accessibility-report naming patterns.',
        'Document content is sparse and resembles a checker output artifact rather than a source document.'
      ],
      suggestedAction: 'Use the original source PDF for remediation. Keep this file as QA evidence only.'
    };
  }

  if (nameLooksLikeReport && isVerySparse) {
    return {
      type: 'checker-report-artifact',
      confidence: 'medium',
      reasons: [
        'Filename suggests report/checker output.',
        'Extracted content is limited for a publishable content PDF.'
      ],
      suggestedAction: 'Verify this is the source document before remediation. If this is a report export, upload the source PDF.'
    };
  }

  if (hasRichText || hasUserFacingStructure || (parsed.pageCount > 2 && textItemCount > sparseTextThreshold)) {
    return {
      type: 'content-document',
      confidence: hasRichText || hasUserFacingStructure ? 'high' : 'medium',
      reasons: [
        'Document contains substantial readable content and/or navigation structure.',
        'Layout characteristics match a source document suitable for remediation.'
      ],
      suggestedAction: 'Proceed with remediation and manual review workflow.'
    };
  }

  return {
    type: 'mixed-or-uncertain',
    confidence: 'low',
    reasons: [
      'Document characteristics are ambiguous (limited text/structure).',
      'It may be scanned content, an export artifact, or a partially structured source file.'
    ],
    suggestedAction: 'Run remediation, then verify output in desktop checker and assistive-technology smoke tests.'
  };
}
