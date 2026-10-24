/**
 * Минимальный zip-писатель без зависимостей: по образцу lab/src/core/zip.ts (Quaera Lab),
 * но сжатие через zlib.deflateRawSync, а время записи в архиве задаётся снаружи.
 *
 * Время не берётся из часов: датасет обязан воспроизводиться байт в байт
 * (см. шапку build-dataset.mjs), а архив, зависящий от момента сборки, делал бы
 * каждый деплой «изменением» файла. Без ZIP64: хватает до 4 ГБ и 65 535 файлов.
 */
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS время и дата из компонентов UTC-даты, как их хранит zip. */
function dosTime(d) {
  const year = Math.max(1980, d.getUTCFullYear());
  return [
    (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  ];
}

/** Байты архива. files: [{ name, data: Buffer }]; имена в UTF-8 (флаг бит 11). */
export function zipFiles(files, at) {
  const [time, date] = dosTime(at);
  const entries = files.map((f) => {
    const raw = f.data;
    const deflated = deflateRawSync(raw, { level: 9 });
    const packed = deflated.length < raw.length;
    return {
      name: Buffer.from(f.name, 'utf8'),
      crc: crc32(raw),
      size: raw.length,
      method: packed ? 8 : 0,
      data: packed ? deflated : raw,
    };
  });
  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = Buffer.alloc(localSize + centralSize + 22);
  let p = 0;
  const u16 = (x) => { out.writeUInt16LE(x, p); p += 2; };
  const u32 = (x) => { out.writeUInt32LE(x, p); p += 4; };
  const bytes = (b) => { b.copy(out, p); p += b.length; };
  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    u32(0x04034b50);
    u16(20), u16(0x0800), u16(e.method), u16(time), u16(date);
    u32(e.crc), u32(e.data.length), u32(e.size);
    u16(e.name.length), u16(0);
    bytes(e.name);
    bytes(e.data);
  }
  const centralAt = p;
  entries.forEach((e, i) => {
    u32(0x02014b50);
    u16(20), u16(20), u16(0x0800), u16(e.method), u16(time), u16(date);
    u32(e.crc), u32(e.data.length), u32(e.size);
    u16(e.name.length), u16(0), u16(0), u16(0), u16(0);
    u32(0), u32(offsets[i]);
    bytes(e.name);
  });
  const centralEnd = p;
  u32(0x06054b50);
  u16(0), u16(0), u16(entries.length), u16(entries.length);
  u32(centralEnd - centralAt), u32(centralAt), u16(0);
  return out;
}
