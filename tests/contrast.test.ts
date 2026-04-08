import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/utils/contrast';

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    const ratio = contrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBe(21);
  });

  it('returns 21 for white on black (order independent)', () => {
    const ratio = contrastRatio([255, 255, 255], [0, 0, 0]);
    expect(ratio).toBe(21);
  });

  it('returns 1 for identical colors', () => {
    const ratio = contrastRatio([128, 128, 128], [128, 128, 128]);
    expect(ratio).toBe(1);
  });

  it('returns correct ratio for WCAG AA threshold boundary', () => {
    // Gray text (#767676) on white should be approximately 4.54:1 (passes AA for normal text)
    const ratio = contrastRatio([118, 118, 118], [255, 255, 255]);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('computes ratio for colored foreground on white', () => {
    // Dark blue on white should have good contrast
    const ratio = contrastRatio([0, 0, 139], [255, 255, 255]);
    expect(ratio).toBeGreaterThan(4.5);
  });

  it('computes ratio for light yellow on white (poor contrast)', () => {
    // Light yellow on white should have poor contrast
    const ratio = contrastRatio([255, 255, 200], [255, 255, 255]);
    expect(ratio).toBeLessThan(1.5);
  });

  it('handles pure red on pure green', () => {
    const ratio = contrastRatio([255, 0, 0], [0, 255, 0]);
    // Red and green have a specific contrast ratio
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(4);
  });
});
