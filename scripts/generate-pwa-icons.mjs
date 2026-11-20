import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function createPngBuffer(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * (maskable ? 0.34 : 0.42);
  const innerR = size * 0.14;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Slate-900 (#0f172a) background with clean geometric cyan/emerald swarm hexagon ring
      let r = 15;
      let g = 23;
      let b = 42;
      const a = 255;

      // Subtle border highlight
      if (!maskable && (x < 2 || y < 2 || x >= size - 2 || y >= size - 2)) {
        r = 30;
        g = 41;
        b = 59;
      }

      // Outer luminous ring
      if (Math.abs(dist - maxR) < size * 0.035) {
        r = 56;
        g = 189;
        b = 248;
      }
      // Inner core node
      if (dist <= innerR) {
        r = 16;
        g = 185;
        b = 129;
      }
      // 3 orbital swarm nodes at 120 deg intervals
      for (let k = 0; k < 3; k++) {
        const ang = (k * 2 * Math.PI) / 3 - Math.PI / 2;
        const nx = cx + Math.cos(ang) * maxR;
        const ny = cy + Math.sin(ang) * maxR;
        if (Math.hypot(x - nx, y - ny) <= size * 0.075) {
          r = 248;
          g = 250;
          b = 252;
        }
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f172a"/>
  <circle cx="256" cy="256" r="168" fill="none" stroke="#38bdf8" stroke-width="24"/>
  <circle cx="256" cy="256" r="56" fill="#10b981"/>
  <circle cx="256" cy="88" r="28" fill="#f8fafc"/>
  <circle cx="401" cy="340" r="28" fill="#f8fafc"/>
  <circle cx="111" cy="340" r="28" fill="#f8fafc"/>
</svg>
`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), svg, 'utf8');
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-192x192.png'), createPngBuffer(192, false));
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-512x512.png'), createPngBuffer(512, false));
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-maskable-512x512.png'), createPngBuffer(512, true));
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), createPngBuffer(180, false));
console.log('Generated PWA icons in public/');
