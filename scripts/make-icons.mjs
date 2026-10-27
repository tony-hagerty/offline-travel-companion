// Draws the app icon (white map pin on a teal gradient) as PNGs with no image library.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CX = 0.5, CY = 0.42, R = 0.2, HOLE = 0.075, AY = 0.8;
const d = AY - CY;
const phi = Math.acos(R / d);
const TY = CY + R * Math.cos(phi);
const TW = R * Math.sin(phi);

function inPin(x, y) {
  const dx = x - CX, dy = y - CY;
  const r2 = dx * dx + dy * dy;
  if (r2 <= HOLE * HOLE) return false;
  if (r2 <= R * R) return true;
  if (y >= TY && y <= AY) return Math.abs(dx) <= (TW * (AY - y)) / (AY - TY);
  return false;
}

function bg(y) {
  const top = [20, 184, 166], bottom = [15, 118, 110];
  return top.map((c, i) => Math.round(c + (bottom[i] - c) * y));
}

function render(size) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++)
          if (inPin((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)) hits++;
      const a = hits / (ss * ss);
      const b = bg(py / size);
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(b[i] * (1 - a) + 255 * a);
      raw[o + 3] = 255;
    }
  }
  return png(size, raw);
}

function png(size, raw) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), render(size));
  console.log('wrote', name);
}
