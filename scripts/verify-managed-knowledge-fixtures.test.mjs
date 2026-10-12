import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { syntheticImagePDF, syntheticPNG } from './verify-managed-knowledge-fixtures.mjs';

describe('synthetic image fixture', () => {
  it('creates a valid in-memory PNG and PDF image XObject with searchable marker text', () => {
    const png = syntheticPNG();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(256 * 256).toBeGreaterThanOrEqual(80 * 80);
    expect((500 * 500) / (612 * 792)).toBeGreaterThanOrEqual(0.01);
    expect(inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)))).toHaveLength(256 * (1 + 256 * 4));
    const pdf = syntheticImagePDF('image-fixture-marker');
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain('/Subtype /Image /Width 256 /Height 256');
    expect(pdf.toString('latin1')).toContain('Managed image fixture image-fixture-marker');
    const start = pdf.indexOf(Buffer.from('stream\n', 'latin1'), pdf.indexOf('/Subtype /Image')) + 7;
    const end = pdf.indexOf(Buffer.from('\nendstream', 'latin1'), start);
    const pixels = inflateSync(pdf.subarray(start, end));
    expect(pixels).toHaveLength(256 * 256 * 3);
    expect(pixels.subarray(0, 3)).toEqual(Buffer.from([255, 0, 0]));
    expect(() => syntheticImagePDF('../unsafe')).toThrow('unsafe synthetic marker');
  });
});
