// Minimal ZIP writer (store / no compression) — enough to bundle a few Markdown
// files into a downloadable archive without pulling in a dependency.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// files: [{ name: string, data: string }] → Blob (application/zip)
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const localOffset = offset;
    const nameBytes = enc.encode(file.name);
    const data = enc.encode(file.data);
    const crc = crc32(data);

    const local = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method (0 = store)
      u16(0),
      u16(0), // mod time, date
      u32(crc),
      u32(data.length), // compressed size
      u32(data.length), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra len
      nameBytes,
      data,
    ]);
    chunks.push(local);
    offset += local.length;

    central.push(
      concat([
        u32(0x02014b50), // central directory header signature
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(0), // method
        u16(0),
        u16(0), // mod time, date
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0), // extra len
        u16(0), // comment len
        u16(0), // disk number start
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(localOffset),
        nameBytes,
      ]),
    );
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) {
    chunks.push(c);
    centralSize += c.length;
  }

  chunks.push(
    concat([
      u32(0x06054b50), // end of central directory signature
      u16(0),
      u16(0), // disk numbers
      u16(files.length),
      u16(files.length),
      u32(centralSize),
      u32(centralStart),
      u16(0), // comment len
    ]),
  );

  return new Blob(chunks, { type: 'application/zip' });
}
