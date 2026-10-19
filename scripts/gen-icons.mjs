// Рисует значки приложения без внешних зависимостей: рисуем в RGBA-буфер и кодируем
// PNG вручную через zlib. Знак берётся из family/marks/quaera.svg (плитка #1f2a40 и три
// цветных столбца, тот же, что в боковой панели); геометрию повторяем здесь вручную,
// потому что сборка на Cloudflare не должна зависеть от браузера.
//
// Картинка превью для ссылок (og.png) рисуется отдельно, scripts/make-og.mjs, вместе
// с четырьмя другими приложениями семьи: ей нужен шрифт Plex, а значит браузер.
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

function canvas(width, height) {
  return Buffer.alloc(width * height * 4); // прозрачный
}

function rect(buf, width, height, x0, y0, w, h, color, radius = 0) {
  const [r, g, b] = hex(color);
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
      if (radius > 0) {
        // скругление углов: проверяем расстояние до ближайшего центра дуги
        const cx = Math.min(Math.max(x + 0.5, x0 + radius), x1 - radius);
        const cy = Math.min(Math.max(y + 0.5, y0 + radius), y1 - radius);
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > radius ** 2) continue;
      }
      const i = (y * width + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
}

const SS = 4; // сглаживание: рисуем в SS раз крупнее и усредняем
function downsample(buf, size) {
  const big = size * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * big + x * SS + dx) * 4;
          const al = buf[i + 3];
          r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / (SS * SS));
    }
  }
  return out;
}

const TILE = '#1f2a40'; // плитка знака, как в family/marks/quaera.svg

/**
 * Знак в 32-единичной сетке marks/quaera.svg. full=true: плитка на весь квадрат
 * (maskable и apple-touch: маску рисует система); иначе плитка со скруглением rx 7
 * на прозрачном фоне. scale<1 уменьшает знак внутри плитки (safe zone).
 */
function drawMark(size, full, scale = 1) {
  const big = size * SS;
  const buf = canvas(big, big);
  const u = big / 32;
  rect(buf, big, big, 0, 0, big, big, TILE, full ? 0 : 7 * u);
  // знак в оригинале сдвинут на (5.75, 3.45); центр его группы (9.25, 11.05) ставим в центр плитки
  const cx = 16 * u;
  const cy = 16 * u;
  const k = u * scale;
  const X = (x) => cx + (x - 9.25) * k;
  const Y = (y) => cy + (y - 11.05) * k;
  const bars = [
    [0, 11, 6, '#38bdf8'],
    [6.5, 7, 10, '#818cf8'],
    [13, 3, 14, '#4ade80'],
  ];
  for (const [x, y, h, color] of bars) rect(buf, big, big, X(x), Y(y), 4.5 * k, h * k, color, 1.2 * k);
  rect(buf, big, big, X(0), Y(19.5), 12 * k, 2.6 * k, '#ffffff', 1.3 * k);
  // хвост каретки: белый с непрозрачностью 0.4 поверх плитки
  const mix = (c, t) => Math.round(c + (255 - c) * t);
  const [tr, tg, tb] = hex(TILE);
  rect(buf, big, big, X(13.8), Y(19.5), 4.7 * k, 2.6 * k, `#${[mix(tr, 0.4), mix(tg, 0.4), mix(tb, 0.4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`, 1.3 * k);
  return downsample(buf, size);
}

await mkdir(outDir, { recursive: true });
const targets = [
  { name: 'icon-192.png', size: 192, full: false, scale: 1.12 },
  { name: 'icon-512.png', size: 512, full: false, scale: 1.12 },
  // maskable и apple-touch: плитка на весь квадрат, знак внутри safe zone (~80%)
  { name: 'icon-maskable-512.png', size: 512, full: true, scale: 0.9 },
  { name: 'apple-touch-icon.png', size: 180, full: true, scale: 0.95 },
];
for (const t of targets) {
  await writeFile(path.join(outDir, t.name), encodePng(t.size, t.size, drawMark(t.size, t.full, t.scale)));
  console.log(`icons: ${t.name} (${t.size}x${t.size})`);
}
