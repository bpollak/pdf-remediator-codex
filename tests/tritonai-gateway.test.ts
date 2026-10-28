import { describe, expect, it } from 'vitest';
import { DEFAULT_FALLBACK_MODELS, getModelCandidates, MAX_MODEL_CANDIDATES, stripJsonFences } from '@/lib/tritonai/gateway';

describe('TritonAI gateway helpers', () => {
  it('orders the primary model first, dedupes, and falls back to the defaults', () => {
    expect(getModelCandidates('primary', undefined)).toEqual(['primary', ...DEFAULT_FALLBACK_MODELS]);
    expect(getModelCandidates('primary', '')).toEqual(['primary', ...DEFAULT_FALLBACK_MODELS]);
    expect(getModelCandidates(' a ', 'a, b ,,b')).toEqual(['a', 'b']);
  });

  it('caps the number of candidates', () => {
    expect(getModelCandidates('a', 'b,c,d,e,f')).toHaveLength(MAX_MODEL_CANDIDATES);
  });

  it('strips JSON code fences', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFences('  {"a":1} ')).toBe('{"a":1}');
  });
});
