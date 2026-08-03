// Генерирует растровые ассеты без внешних зависимостей: иконки приложения
// и превью-картинку для ссылок в соцсетях. Рисуем в RGBA-буфер и кодируем
// PNG вручную через zlib.
//
// og.png нужна именно как растр: LinkedIn, Telegram и Slack не принимают SVG
// в og:image. Шрифта в проекте нет, поэтому надпись набирается собственным
// растровым шрифтом 5×7 ниже — для семи букв логотипа и латинского подзаголовка
// этого достаточно, а тянуть ради этого зависимость с рендерингом шрифтов
// в проект, который принципиально собирается без них, не стоит.
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

function canvas(width, height, bg) {
  const buf = Buffer.alloc(width * height * 4);
  const [r, g, b] = hex(bg);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function rect(buf, width, height, x0, y0, w, h, color, radius = 0) {
  const [r, g, b] = hex(color);
  for (let y = Math.max(0, y0); y < Math.min(height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(width, x0 + w); x++) {
      if (radius > 0) {
        // скругление углов: проверяем расстояние до ближайшего центра дуги
        const cx = Math.min(Math.max(x, x0 + radius), x0 + w - radius);
        const cy = Math.min(Math.max(y, y0 + radius), y0 + h - radius);
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      }
      const i = (y * width + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
}

/** Растровый шрифт 5×7: только заглавная латиница и знаки, нужные для превью. */
const GLYPHS = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.####|#....|#....|#....|#....|#....|.####',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  G: '.####|#....|#....|#..##|#...#|#...#|.###.',
  I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  '.': '.....|.....|.....|.....|.....|.....|..#..',
  '·': '.....|.....|.....|..#..|.....|.....|.....',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};

/** Возвращает ширину надписи в пикселях — нужна, чтобы центрировать без замеров на глаз. */
const textWidth = (text, scale) => text.length * 6 * scale - scale;

function drawText(buf, width, height, text, x0, y0, scale, color) {
  [...text].forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`В растровом шрифте нет знака «${ch}» — добавьте его в GLYPHS`);
    glyph.split('|').forEach((row, ry) => {
      [...row].forEach((px, rx) => {
        if (px !== '#') return;
        rect(buf, width, height, x0 + (i * 6 + rx) * scale, y0 + ry * scale, scale, scale, color);
      });
    });
  });
}

// Знак приложения: три растущих столбца (данные) + подчёркивание-каретка (запрос).
function drawMark(size, inset) {
  const buf = canvas(size, size, '#0b1020');
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
    rect(buf, size, size, Math.round(x), Math.round(baseY - bar.h), Math.round(barW), Math.round(bar.h), bar.color, Math.round(u * 2));
  });
  // каретка терминала под столбцами
  rect(buf, size, size, Math.round(pad + area * 0.06), Math.round(baseY + area * 0.09), Math.round(area * 0.5), Math.round(u * 5), '#e2e8f0', Math.round(u * 2.5));
  rect(buf, size, size, Math.round(pad + area * 0.62), Math.round(baseY + area * 0.09), Math.round(area * 0.2), Math.round(u * 5), '#475569', Math.round(u * 2.5));
  return buf;
}

/**
 * Превью для ссылки в соцсетях. 1200×630 — размер, который LinkedIn, Telegram
 * и Slack показывают широкой карточкой; при меньшем ссылка сворачивается
 * в мелкий квадратный значок и теряется в ленте.
 */
function drawOg() {
  const W = 1200;
  const H = 630;
  const buf = canvas(W, H, '#0b1020');
  const pad = 96;

  // тот же знак, что и на иконке, — три столбца
  const barW = 46;
  const gap = 24;
  const baseY = 200;
  [
    { h: 74, color: '#38bdf8' },
    { h: 122, color: '#818cf8' },
    { h: 166, color: '#4ade80' },
  ].forEach((bar, i) => {
    rect(buf, W, H, pad + i * (barW + gap), baseY - bar.h, barW, bar.h, bar.color, 6);
  });

  // Вертикальный ритм считаем от высоты знаков (7 строк × scale), а не подбором
  // на глаз: иначе строки съезжают при любой правке масштаба.
  const titleY = 250;
  const titleBottom = titleY + 7 * 14;
  drawText(buf, W, H, 'QUERIUM', pad, titleY, 14, '#e2e8f0');
  rect(buf, W, H, pad, titleBottom + 26, 128, 8, '#38bdf8', 4);
  drawText(buf, W, H, 'SQL · PANDAS · ANALYTICS', pad, titleBottom + 74, 6, '#94a3b8');
  drawText(buf, W, H, 'QUERIUM.PAGES.DEV', pad, H - pad - 7 * 4, 4, '#475569');
  return { W, H, buf };
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

const og = drawOg();
await writeFile(path.join(outDir, 'og.png'), encodePng(og.W, og.H, og.buf));
console.log(`icons: og.png (${og.W}x${og.H}) — превью для ссылок`);
