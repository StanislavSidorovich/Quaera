// Генерирует PNG-иконки приложения без внешних зависимостей:
// рисуем в RGBA-буфер и кодируем PNG вручную через zlib.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'icons');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

function canvas(size, bg) {
  const buf = Buffer.alloc(size * size * 4);
  const [r, g, b] = hex(bg);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function rect(buf, size, x0, y0, w, h, color, radius = 0) {
  const [r, g, b] = hex(color);
  for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
      if (radius > 0) {
        // скругление углов: проверяем расстояние до ближайшего центра дуги
        const cx = Math.min(Math.max(x, x0 + radius), x0 + w - radius);
        const cy = Math.min(Math.max(y, y0 + radius), y0 + h - radius);
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      }
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
}

// Знак приложения: три растущих столбца (данные) + подчёркивание-каретка (запрос).
function drawMark(size, inset) {
  const buf = canvas(size, '#0b1020');
  const u = size / 100;
  const pad = inset * size;
  const area = size - pad * 2;
  const barW = area * 0.19;
  const gap = area * 0.115;
  const baseY = pad + area * 0.74;
  const bars = [
    { h: area * 0.3, color: '#38bdf8' },
    { h: area * 0.48, color: '#818cf8' },
    { h: area * 0.66, color: '#4ade80' },
  ];
  bars.forEach((bar, i) => {
    const x = pad + area * 0.06 + i * (barW + gap);
    rect(buf, size, Math.round(x), Math.round(baseY - bar.h), Math.round(barW), Math.round(bar.h), bar.color, Math.round(u * 2));
  });
  // каретка терминала под столбцами
  rect(buf, size, Math.round(pad + area * 0.06), Math.round(baseY + area * 0.09), Math.round(area * 0.5), Math.round(u * 5), '#e2e8f0', Math.round(u * 2.5));
  rect(buf, size, Math.round(pad + area * 0.62), Math.round(baseY + area * 0.09), Math.round(area * 0.2), Math.round(u * 5), '#475569', Math.round(u * 2.5));
  return buf;
}

await mkdir(outDir, { recursive: true });
const targets = [
  { name: 'icon-192.png', size: 192, inset: 0.1 },
  { name: 'icon-512.png', size: 512, inset: 0.1 },
  // maskable: контент внутри safe zone (≈20% отступа со всех сторон)
  { name: 'icon-maskable-512.png', size: 512, inset: 0.22 },
];
for (const t of targets) {
  await writeFile(path.join(outDir, t.name), encodePng(t.size, t.size, drawMark(t.size, t.inset)));
  console.log(`icons: ${t.name} (${t.size}x${t.size})`);
}
