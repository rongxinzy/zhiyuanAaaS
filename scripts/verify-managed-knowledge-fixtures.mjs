import { deflateSync, inflateSync } from 'node:zlib';

// A valid 256x256 red RGBA PNG, generated entirely in memory. This exceeds the
// WeKnora DocReader's default embedded-image pixel and page-area thresholds.
export function syntheticPNG() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    // CRC-32 over type + data, as required by the PNG format.
    let value = 0xffffffff;
    for (const byte of Buffer.concat([name, data])) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    crc.writeUInt32BE((value ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, name, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const scanline = Buffer.alloc(256 * (1 + 256 * 4));
  for (let y = 0; y < 256; y++) {
    const row = y * (1 + 256 * 4);
    scanline[row] = 0; // PNG filter: none
    for (let x = 0; x < 256; x++) {
      const pixel = row + 1 + x * 4;
      scanline[pixel] = 255;
      scanline[pixel + 3] = 255;
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanline)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A one-page PDF with searchable marker text and a real Flate-encoded RGB image
// XObject decoded from the synthetic PNG. No files, network or user data used.
export function syntheticImagePDF(marker) {
  if (!/^[\w-]+$/.test(marker)) throw new Error('unsafe synthetic marker');
  const png = syntheticPNG();
  const idatLength = png.readUInt32BE(33);
  const scanline = inflateSync(png.subarray(41, 41 + idatLength));
  if (scanline.length !== 256 * (1 + 256 * 4) || scanline[0] !== 0) throw new Error('invalid synthetic PNG data');
  const rgb = Buffer.alloc(256 * 256 * 3);
  for (let offset = 0; offset < rgb.length; offset += 3) rgb[offset] = 255;
  const compressedRGB = deflateSync(rgb);
  const content = Buffer.from(
    `BT /F1 12 Tf 40 750 Td (Managed image fixture ${marker}) Tj ET\nq 500 0 0 500 40 150 cm /Im0 Do Q\n`,
  );
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 5 0 R >>',
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('endstream')]),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 256 /Height 256 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedRGB.length} >>\nstream\n`,
      ),
      compressedRGB,
      Buffer.from('\nendstream'),
    ]),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let position = parts[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(position);
    const prefix = Buffer.from(`${index + 1} 0 obj\n`);
    const suffix = Buffer.from('\nendobj\n');
    parts.push(prefix, object, suffix);
    position += prefix.length + object.length + suffix.length;
  }
  const xrefOffset = position;
  const xref = Buffer.from(
    `xref\n0 7\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  parts.push(xref);
  return Buffer.concat(parts);
}
