// Tiny store-only ZIP writer — enough to produce a valid .xlsx (Office Open XML).
// We avoid adding a dependency by writing a minimal ZIP archive (no compression):
//   * Local file headers  (signature 0x04034b50)
//   * Central directory   (signature 0x02014b50)
//   * End of central dir  (signature 0x06054b50)
//
// Excel and LibreOffice both accept stored (method 0) zip entries, which means
// we don't need DEFLATE. CRC32 is computed inline; bitwise ops on a 32-bit int
// use the standard IEEE-802.3 polynomial reflected (0xEDB88320).

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c: number = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c: number = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    const idx = (c ^ (bytes[i] as number)) & 0xFF;
    const entry = CRC_TABLE[idx] as number;
    c = entry ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d = new Date()): { date: number; time: number } {
  const time = ((d.getHours() & 0x1F) << 11)
             | ((d.getMinutes() & 0x3F) << 5)
             | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
  const date = (((d.getFullYear() - 1980) & 0x7F) << 9)
             | (((d.getMonth() + 1) & 0x0F) << 5)
             | (d.getDate() & 0x1F);
  return { date, time };
}

function encodeUTF8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

type Entry = { nameBytes: Uint8Array; data: Uint8Array; crc: number; size: number; offset: number; date: number; time: number };

export function buildZip(parts: Record<string, string>): Uint8Array {
  const { date, time } = dosDateTime();
  const entries: Entry[] = [];
  let offset = 0;
  const chunks: Uint8Array[] = [];

  for (const [name, body] of Object.entries(parts)) {
    const nameBytes = encodeUTF8(name);
    const data = encodeUTF8(body);
    const crc = crc32(data);

    // Local file header
    const lfh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lfh.buffer);
    dv.setUint32(0, 0x04034b50, true);    // signature
    dv.setUint16(4, 20, true);             // version needed
    dv.setUint16(6, 0, true);              // flags
    dv.setUint16(8, 0, true);              // compression: stored
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);   // compressed size
    dv.setUint32(22, data.length, true);   // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);             // extra length
    lfh.set(nameBytes, 30);

    chunks.push(lfh);
    chunks.push(data);
    entries.push({ nameBytes, data, crc, size: data.length, offset, date, time });
    offset += lfh.length + data.length;
  }

  // Central directory
  let cdSize = 0;
  const cdChunks: Uint8Array[] = [];
  for (const e of entries) {
    const cdh = new Uint8Array(46 + e.nameBytes.length);
    const dv = new DataView(cdh.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);             // version made by
    dv.setUint16(6, 20, true);             // version needed
    dv.setUint16(8, 0, true);              // flags
    dv.setUint16(10, 0, true);             // compression
    dv.setUint16(12, e.time, true);
    dv.setUint16(14, e.date, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.size, true);
    dv.setUint32(24, e.size, true);
    dv.setUint16(28, e.nameBytes.length, true);
    dv.setUint16(30, 0, true);             // extra length
    dv.setUint16(32, 0, true);             // comment length
    dv.setUint16(34, 0, true);             // disk #
    dv.setUint16(36, 0, true);             // internal attrs
    dv.setUint32(38, 0, true);             // external attrs
    dv.setUint32(42, e.offset, true);      // local header offset
    cdh.set(e.nameBytes, 46);
    cdChunks.push(cdh);
    cdSize += cdh.length;
  }
  for (const c of cdChunks) chunks.push(c);

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);                // disk #
  ev.setUint16(6, 0, true);                // disk where cd starts
  ev.setUint16(8, entries.length, true);   // # entries on this disk
  ev.setUint16(10, entries.length, true);  // # total entries
  ev.setUint32(12, cdSize, true);          // cd size
  ev.setUint32(16, offset, true);          // cd offset
  ev.setUint16(20, 0, true);               // comment length
  chunks.push(eocd);

  // Concatenate
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}