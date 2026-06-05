// Magic-byte sniffing, shared by the local handlers that accept user files.

const ascii = (buffer, start, end) => new TextDecoder('latin1').decode(new Uint8Array(buffer.slice(start, end)));

export function isPdf(buffer) {
  // A real PDF carries "%PDF-" within the first bytes (a little slack allowed).
  return ascii(buffer, 0, 1024).includes('%PDF-');
}

// → MIME type for a supported image, or null.
export function imageMime(buffer) {
  const head = new Uint8Array(buffer.slice(0, 16));
  const starts = (sig) => sig.every((b, i) => head[i] === b);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(buffer, 4, 12).startsWith('ftypavi')) return 'image/avif';
  return null;
}
