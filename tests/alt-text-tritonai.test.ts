import { describe, expect, it } from 'vitest';
import {
  buildAltTextPrompt,
  buildTritonAiRequest,
  parseAltTextSuggestion,
  validateImageDataUrl
} from '@/lib/alt-text/tritonai';

describe('TritonAI alt-text helpers', () => {
  it('builds a vision chat request with PDF image context', () => {
    const request = buildTritonAiRequest({
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageLabel: 'Image 1 on page 2',
      documentName: 'campus-map.pdf',
      nearbyText: 'Figure 1. Accessible entrance route.',
      page: 2
    });

    expect(request.model).toBe('gpt-5.5');
    expect(request.messages[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,AAAA' }
        })
      ])
    );
    expect(JSON.stringify(request)).toContain('Accessible entrance route');
  });

  it('parses strict JSON alt-text suggestions', () => {
    expect(
      parseAltTextSuggestion(
        JSON.stringify({
          alt: 'Map showing the accessible entrance route highlighted in blue.',
          decorative: false,
          rationale: 'The map communicates route information.'
        })
      )
    ).toEqual({
      alt: 'Map showing the accessible entrance route highlighted in blue.',
      decorative: false,
      rationale: 'The map communicates route information.'
    });
  });

  it('accepts decorative recommendations with empty alt text', () => {
    expect(parseAltTextSuggestion('```json\n{"alt":"","decorative":true}\n```')).toEqual({
      alt: '',
      decorative: true,
      rationale: undefined
    });
  });

  it('rejects unusable non-decorative recommendations', () => {
    expect(() => parseAltTextSuggestion('{"alt":"map","decorative":false}')).toThrow(/usable alt-text/);
  });

  it('validates image data URLs and prompt context', () => {
    expect(validateImageDataUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(validateImageDataUrl('https://example.com/image.png')).toBeUndefined();
    expect(buildAltTextPrompt({ imageDataUrl: 'data:image/png;base64,AAAA', imageLabel: 'Image 1' })).toContain(
      'Return JSON only'
    );
  });
});

